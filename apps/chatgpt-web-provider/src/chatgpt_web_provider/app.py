from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import time
import uuid
from pathlib import Path
from typing import Optional

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse

from .backends import Backend, build_backend
from .config import Settings
from .models import ChatCompletionRequest, ChatMessage, ResponsesRequest


def _require_auth(settings: Settings):
    async def dep(authorization: Optional[str] = Header(default=None), x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")) -> str:
        candidates: list[str] = []
        if x_api_key and x_api_key.strip() and not x_api_key.strip().startswith("{{"):
            candidates.append(x_api_key.strip())
        if authorization and authorization.lower().startswith("bearer "):
            candidates.append(authorization.split(" ", 1)[1].strip())

        if settings.allow_anonymous:
            return ""
        if not candidates:
            raise HTTPException(status_code=401, detail="missing bearer token")
        for token in candidates:
            if token in settings.api_keys:
                return token
        raise HTTPException(status_code=403, detail="invalid bearer token")
    return dep


def _truthy_header(value: str | None) -> bool:
    return bool(value and value.strip().lower() in {"1", "true", "yes", "on"})


def _request_level(req) -> str | None:
    return getattr(req, "level", None) or getattr(req, "reasoning_effort", None) or (getattr(req, "reasoning", None) or {}).get("effort")


def _request_session_id(req) -> str | None:
    metadata = getattr(req, "client_metadata", None) or {}
    if isinstance(metadata, dict) and metadata.get("session_id"):
        return str(metadata["session_id"])
    if isinstance(metadata, dict) and isinstance(metadata.get("x-codex-turn-metadata"), str):
        try:
            nested_metadata = json.loads(metadata["x-codex-turn-metadata"])
            if isinstance(nested_metadata, dict) and nested_metadata.get("session_id"):
                return str(nested_metadata["session_id"])
        except json.JSONDecodeError:
            pass
    return None


def _request_thread_source(req) -> str | None:
    metadata = getattr(req, "client_metadata", None) or {}
    if isinstance(metadata, dict) and metadata.get("thread_source"):
        return str(metadata["thread_source"])
    if isinstance(metadata, dict) and isinstance(metadata.get("x-codex-turn-metadata"), str):
        try:
            nested_metadata = json.loads(metadata["x-codex-turn-metadata"])
            if isinstance(nested_metadata, dict) and nested_metadata.get("thread_source"):
                return str(nested_metadata["thread_source"])
        except json.JSONDecodeError:
            pass
    return None


def _codex_error(status_code: int, code: str, message: str, error_type: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": code, "type": error_type, "message": message, "param": None}},
    )


def _validate_requested_options(settings: Settings, model: str, level: str | None) -> str:
    if model not in settings.available_models:
        raise HTTPException(
            status_code=400,
            detail={"error": "unsupported_model", "model": model, "available_models": settings.available_models},
        )
    if level and level not in settings.available_levels:
        raise HTTPException(
            status_code=400,
            detail={"error": "unsupported_level", "level": level, "available_levels": settings.available_levels},
        )
    return model


async def _run_with_queue(settings: Settings, queue_sem: asyncio.Semaphore, operation):
    try:
        async with asyncio.timeout(settings.queue_timeout_seconds):
            async with queue_sem:
                return await operation()
    except TimeoutError as exc:
        raise HTTPException(status_code=504, detail="request timed out while waiting for provider queue") from exc


def _not_logged_in_response(health_data: dict) -> JSONResponse | None:
    if health_data.get("logged_in_hint") is not False:
        return None
    return _codex_error(401, "E001", "ChatGPT Web 尚未登录，请在隔离 Chrome 窗口中登录后重试。", "authentication_error")


def _conversation_gate(settings: Settings, req, request: Request, messages: list[ChatMessage], authorized_installations: set[str]) -> tuple[str | None, str | None]:
    if settings.conversation_password_mode != "current_date":
        return None, None
    metadata = getattr(req, "client_metadata", None) or {}
    installation_id = str(metadata.get("x-codex-installation-id")) if isinstance(metadata, dict) and metadata.get("x-codex-installation-id") else None
    if not installation_id and isinstance(metadata, dict) and isinstance(metadata.get("x-codex-turn-metadata"), str):
        try:
            nested_metadata = json.loads(metadata["x-codex-turn-metadata"])
            if isinstance(nested_metadata, dict) and nested_metadata.get("installation_id"):
                installation_id = str(nested_metadata["installation_id"])
        except json.JSONDecodeError:
            pass
    cookie_value = request.cookies.get("chatgpt_web_device")
    cookie_parts = cookie_value.split(".", 1) if cookie_value else []
    cookie_valid = bool(cookie_parts and len(cookie_parts) == 2 and cookie_parts[0] and hmac.compare_digest(cookie_parts[1], hmac.new(settings.conversation_session_secret.encode(), cookie_parts[0].encode(), hashlib.sha256).hexdigest()))
    if cookie_valid or (installation_id and installation_id in authorized_installations):
        return None, None
    latest_user_text = next((message.text().strip() for message in reversed(messages) if message.role == "user"), "")
    if latest_user_text == time.strftime("%Y/%m/%d"):
        if installation_id:
            authorized_installations.add(installation_id)
            device_id = installation_id
        else:
            device_id = uuid.uuid4().hex
        signature = hmac.new(settings.conversation_session_secret.encode(), device_id.encode(), hashlib.sha256).hexdigest()
        return "口令正确，现在你可以开始愉快玩耍啦", f"{device_id}.{signature}"
    if _request_thread_source(req) == "thread_title" or not latest_user_text:
        return "请输入口令", None
    return "口令不对，联系管理员13520521413", None


def _attach_conversation_cookie(response, cookie_value: str | None):
    if cookie_value:
        response.set_cookie("chatgpt_web_device", cookie_value, max_age=31_536_000, httponly=True, samesite="lax", path="/")
    return response



async def _chat_completion_stream(response_id: str, created: int, model: str, text: str, usage: dict):
    first = {
        "id": response_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [{"index": 0, "delta": {"role": "assistant", "content": text}, "finish_reason": None}],
    }
    final = {
        "id": response_id,
        "object": "chat.completion.chunk",
        "created": created,
        "model": model,
        "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
        "usage": usage,
    }
    yield f"data: {json.dumps(first, ensure_ascii=False)}\n\n"
    yield f"data: {json.dumps(final, ensure_ascii=False)}\n\n"
    yield "data: [DONE]\n\n"


def create_app(settings: Settings | None = None, backend: Backend | None = None) -> FastAPI:
    settings = settings or Settings.from_env()
    settings.validate_for_runtime()
    backend = backend or build_backend(settings)
    auth = _require_auth(settings)
    queue_sem = asyncio.Semaphore(settings.max_concurrent_requests)
    first_codex_request_logged = False
    authorized_installations: set[str] = set()

    def write_codex_artifacts(health_data: dict) -> None:
        if not settings.codex_home:
            return
        codex_home = Path(settings.codex_home).resolve()
        codex_home.mkdir(parents=True, exist_ok=True)
        auth_path = codex_home / "auth.json"
        token_script_path = codex_home / "get-provider-token.mjs"
        config_path = codex_home / "config.toml"
        catalog_path = codex_home / "model-catalog.json"
        auth_path.unlink(missing_ok=True)
        token_script_path.unlink(missing_ok=True)
        if health_data.get("logged_in_hint") is not True:
            config_path.unlink(missing_ok=True)
            catalog_path.unlink(missing_ok=True)
            return
        default_model = settings.model_id
        default_level = settings.default_level or settings.available_levels[0]
        catalog_models = [{
            "slug": model,
            "display_name": settings.model_label(model),
            "description": settings.model_label(model),
            "base_instructions": "",
            "default_reasoning_level": default_level,
            "supported_reasoning_levels": [{"effort": level, "description": settings.level_label(level)} for level in settings.available_levels],
            "shell_type": "unified_exec",
            "visibility": "list",
            "supported_in_api": True,
            "priority": index,
            "additional_speed_tiers": [],
            "service_tiers": [],
            "default_service_tier": None,
            "available_access_programs": None,
            "availability_nux": None,
            "upgrade": None,
            "model_messages": None,
            "include_skills_usage_instructions": False,
            "include_plugin_usage_instructions": False,
            "include_apps_usage_instructions": True,
            "supports_reasoning_summary_parameter": True,
            "default_reasoning_summary": "none",
            "support_verbosity": False,
            "default_verbosity": None,
            "apply_patch_tool_type": "freeform",
            "web_search_tool_type": "text",
            "web_search_provider": None,
            "truncation_policy": {"mode": "tokens", "limit": 100000},
            "supports_image_detail_original": False,
            "context_window": None,
            "max_context_window": None,
            "auto_compact_token_limit": None,
            "comp_hash": None,
            "effective_context_window_percent": 95,
            "experimental_supported_tools": [],
            "input_modalities": ["text"],
            "supports_search_tool": False,
            "supports_experimental_context": False,
            "use_responses_lite": False,
            "supports_reasoning_effort_updates": True,
            "node_repl_auto_review_required": False,
            "node_repl_disabled": False,
            "auto_review_model_override": None,
            "model_specialty": None,
            "tool_mode": "direct",
            "multi_agent_version": None,
            "multi_agent_reasoning_effort": None,
        } for index, model in enumerate(settings.available_models)]
        with catalog_path.open("w", encoding="utf-8", newline="") as catalog_file:
            catalog_file.write(json.dumps({"models": catalog_models}, ensure_ascii=False, indent=2) + "\r\n")
        project_root = Path.cwd().resolve().as_posix()
        config_text = "\r\n".join([
            f'model_catalog_json = "{catalog_path.as_posix()}"',
            'model_provider = "chatgpt_web"',
            'sandbox_mode = "workspace-write"',
            f'model = "{default_model}"',
            f'model_reasoning_effort = "{default_level}"',
            "",
            "[model_providers.chatgpt_web]",
            'name = "ChatGPT Web"',
            f'base_url = "{settings.public_base_url.rstrip("/")}/v1"',
            'wire_api = "responses"',
            "requires_openai_auth = false",
            "supports_websockets = false",
            "",
            "[windows]",
            'sandbox = "elevated"',
            "",
            "[sandbox_workspace_write]",
            f"writable_roots = ['{project_root}']",
            "",
        ])
        with config_path.open("w", encoding="utf-8", newline="") as config_file:
            config_file.write(config_text)

    app = FastAPI(
        title="chatgpt-web-provider",
        version="0.1.0",
        description="OpenAI-compatible API facade for a browser-backed ChatGPT.com worker.",
    )
    app.state.settings = settings
    app.state.backend = backend

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, exc: HTTPException):
        # E001：Provider API Key 无效，或 ChatGPT 网页没有登录。
        if exc.status_code in {401, 403}:
            return _codex_error(exc.status_code, "E001", "授权失败，请检查 Provider API Key。", "authentication_error")
        # E002：请求格式、模型名称或推理档位不符合服务协议。
        if exc.status_code in {400, 422}:
            return _codex_error(exc.status_code, "E002", "请求格式或参数不正确，请检查模型、推理档位和请求内容。", "invalid_request_error")
        # E003：浏览器、CDP 或模型目录暂时不可用。
        if exc.status_code == 503:
            return _codex_error(503, "E003", "浏览器服务暂不可用，请检查 Chrome 和 ChatGPT 页面。", "service_unavailable")
        # E004：请求在服务队列中等待超时。
        if exc.status_code == 504:
            return _codex_error(504, "E004", "请求等待超时，请稍后重试。", "timeout_error")
        return _codex_error(exc.status_code, "E005", "服务内部错误，请稍后重试。", "server_error")

    @app.exception_handler(RequestValidationError)
    async def request_validation_error(_: Request, __: RequestValidationError):
        # E002：FastAPI/Pydantic 无法解析 Codex 请求体。
        return _codex_error(422, "E002", "请求格式不正确，请检查 input、model、messages 等字段。", "invalid_request_error")

    @app.exception_handler(Exception)
    async def unhandled(_: Request, exc: Exception):
        if isinstance(exc, RuntimeError) and "not logged in" in str(exc).lower():
            return _codex_error(401, "E001", "ChatGPT Web 尚未登录，请在隔离 Chrome 窗口中登录后重试。", "authentication_error")
        # E006：ChatGPT 页面控件定位、点击、输入或回复读取失败。
        if isinstance(exc, RuntimeError) or exc.__class__.__module__.startswith("playwright."):
            return _codex_error(503, "E006", f"ChatGPT 页面交互失败：{exc}", "browser_ui_error")
        return _codex_error(500, "E005", "服务内部错误，请稍后重试。", "server_error")

    @app.get("/", include_in_schema=False)
    async def root():
        return RedirectResponse("/docs", status_code=308)

    @app.get("/health")
    async def health():
        data = await backend.health()
        write_codex_artifacts(data)
        return {"ok": bool(data.get("ok")), "backend": settings.backend, "model": settings.model_id, **data}

    @app.get("/v1/models")
    async def models(_token: str = Depends(auth)):
        health_data = await backend.health()
        not_logged_in = _not_logged_in_response(health_data)
        if not_logged_in:
            return not_logged_in
        if not health_data.get("ok"):
            raise HTTPException(status_code=503, detail={"error": "backend_unavailable", "message": health_data.get("error", "browser backend is unavailable")})
        return {
            "object": "list",
            "data": [
                {
                    "id": model,
                    "object": "model",
                    "created": 0,
                    "owned_by": "chatgpt-web-provider",
                    "display_name": settings.model_label(model),
                    "default": model == settings.model_id,
                }
                for model in settings.available_models
            ],
        }

    @app.get("/v1/provider/capabilities")
    async def provider_capabilities(_token: str = Depends(auth)):
        health_data = await backend.health()
        write_codex_artifacts(health_data)
        not_logged_in = _not_logged_in_response(health_data)
        if not_logged_in:
            return not_logged_in
        if not health_data.get("ok"):
            raise HTTPException(status_code=503, detail={"error": "backend_unavailable", "message": health_data.get("error", "browser backend is unavailable")})
        return {
            "backend": settings.backend,
            "default_model": settings.model_id,
            "models": [
                {"id": model, "display_name": settings.model_label(model), "default": model == settings.model_id}
                for model in settings.available_models
            ],
            "levels": [
                {"id": level, "display_name": settings.level_label(level), "default": level == settings.default_level}
                for level in settings.available_levels
            ],
            "new_session": {"body_field": "new_session", "header": "X-New-Session"},
        }

    @app.get("/v1/provider/status")
    async def provider_status(_token: str = Depends(auth)):
        health_data = await backend.health()
        not_logged_in = _not_logged_in_response(health_data)
        if not_logged_in:
            return not_logged_in
        waiters = max(0, settings.max_concurrent_requests - getattr(queue_sem, "_value", settings.max_concurrent_requests))
        return {
            "backend": settings.backend,
            "model": settings.model_id,
            "models": settings.available_models,
            "levels": settings.available_levels,
            "health": health_data,
            "queue": {
                "max_concurrent_requests": settings.max_concurrent_requests,
                "queue_timeout_seconds": settings.queue_timeout_seconds,
                "in_flight_estimate": waiters,
            },
        }

    @app.post("/v1/chat/completions")
    async def chat_completions(req: ChatCompletionRequest, request: Request, x_new_session: Optional[str] = Header(default=None, alias="X-New-Session"), _token: str = Depends(auth)):
        auth_prompt, conversation_cookie = _conversation_gate(settings, req, request, req.messages, authorized_installations)
        if auth_prompt:
            response_id = f"chatcmpl-{uuid.uuid4().hex}"
            usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
            if req.stream:
                return _attach_conversation_cookie(StreamingResponse(
                    _chat_completion_stream(response_id, int(time.time()), req.model or settings.model_id, auth_prompt, usage),
                    media_type="text/event-stream",
                    headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
                ), conversation_cookie)
            return _attach_conversation_cookie(JSONResponse(content={
                "id": response_id,
                "object": "chat.completion",
                "created": int(time.time()),
                "model": req.model or settings.model_id,
                "level": _request_level(req),
                "choices": [{"index": 0, "message": {"role": "assistant", "content": auth_prompt}, "finish_reason": "stop"}],
                "usage": usage,
            }), conversation_cookie)
        health_data = await backend.health()
        not_logged_in = _not_logged_in_response(health_data)
        if not_logged_in:
            return not_logged_in
        if not health_data.get("ok"):
            raise HTTPException(status_code=503, detail={"error": "backend_unavailable", "message": health_data.get("error", "browser backend is unavailable")})
        started = int(time.time())
        selected_model = req.model or settings.model_id
        selected_level = _request_level(req)
        selected_model = _validate_requested_options(settings, selected_model, selected_level)
        thread_source = _request_thread_source(req)
        new_session = req.new_session or _truthy_header(x_new_session) or thread_source == "thread_title"
        session_id = None if thread_source == "thread_title" else _request_session_id(req)
        completion_kwargs = {"model": selected_model, "new_session": new_session, "level": selected_level}
        if session_id:
            completion_kwargs["session_id"] = session_id
        result = await _run_with_queue(
            settings,
            queue_sem,
            lambda: backend.complete(req.messages, **completion_kwargs),
        )
        response_id = f"chatcmpl-{uuid.uuid4().hex}"
        usage = {
            "prompt_tokens": result.prompt_tokens,
            "completion_tokens": result.completion_tokens,
            "total_tokens": result.prompt_tokens + result.completion_tokens,
        }
        if req.stream:
            return _attach_conversation_cookie(StreamingResponse(
                _chat_completion_stream(response_id, started, result.model, result.text, usage),
                media_type="text/event-stream",
                headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
            ), conversation_cookie)
        return _attach_conversation_cookie(JSONResponse(content={
            "id": response_id,
            "object": "chat.completion",
            "created": started,
            "model": result.model,
            "level": result.level,
            "choices": [
                {"index": 0, "message": {"role": "assistant", "content": result.text}, "finish_reason": "stop"}
            ],
            "usage": usage,
        }), conversation_cookie)

    @app.post("/v1/responses")
    async def responses(req: ResponsesRequest, request: Request, x_new_session: Optional[str] = Header(default=None, alias="X-New-Session"), _token: str = Depends(auth)):
        nonlocal first_codex_request_logged
        raw_request = (await request.body()).decode("utf-8", errors="replace")
        try:
            formatted_request = json.dumps(json.loads(raw_request), ensure_ascii=False, indent=2)
        except json.JSONDecodeError:
            formatted_request = raw_request
        if not first_codex_request_logged:
            print(f"\n{'=' * 80}\n[CODEX_FIRST_REQUEST]\n{formatted_request.rstrip()}\n{'=' * 80}\n", flush=True)
            first_codex_request_logged = True
        messages = _responses_input_to_messages(req.input)
        auth_prompt, conversation_cookie = _conversation_gate(settings, req, request, messages, authorized_installations)
        if auth_prompt:
            response_id = f"resp_{uuid.uuid4().hex}"
            message_id = f"msg_{uuid.uuid4().hex}"
            started = int(time.time())
            selected_model = req.model or settings.model_id
            output_item = {"id": message_id, "type": "message", "status": "completed", "role": "assistant", "content": [{"type": "output_text", "text": auth_prompt, "annotations": [], "logprobs": []}]}
            completed_response = {"id": response_id, "object": "response", "created_at": started, "status": "completed", "model": selected_model, "output": [output_item], "usage": {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}}
            if req.stream:
                async def auth_events():
                    sequence = 0

                    def event(event_type: str, payload: dict) -> str:
                        nonlocal sequence
                        payload = {"type": event_type, **payload, "sequence_number": sequence}
                        sequence += 1
                        return f"event: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

                    in_progress_response = {**completed_response, "status": "in_progress", "output": [], "usage": None}
                    yield event("response.created", {"response": in_progress_response})
                    yield event("response.in_progress", {"response": in_progress_response})
                    in_progress_item = {**output_item, "status": "in_progress", "content": []}
                    yield event("response.output_item.added", {"output_index": 0, "item": in_progress_item})
                    yield event("response.content_part.added", {"item_id": message_id, "output_index": 0, "content_index": 0, "part": {"type": "output_text", "text": "", "annotations": [], "logprobs": []}})
                    yield event("response.output_text.delta", {"item_id": message_id, "output_index": 0, "content_index": 0, "delta": auth_prompt, "logprobs": []})
                    yield event("response.output_text.done", {"item_id": message_id, "output_index": 0, "content_index": 0, "text": auth_prompt, "logprobs": []})
                    yield event("response.content_part.done", {"item_id": message_id, "output_index": 0, "content_index": 0, "part": output_item["content"][0]})
                    yield event("response.output_item.done", {"output_index": 0, "item": output_item})
                    yield event("response.completed", {"response": completed_response})

                return _attach_conversation_cookie(StreamingResponse(auth_events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}), conversation_cookie)
            return _attach_conversation_cookie(JSONResponse(content={**completed_response, "output_text": auth_prompt}), conversation_cookie)
        health_data = await backend.health()
        not_logged_in = _not_logged_in_response(health_data)
        if not_logged_in:
            return not_logged_in
        if not health_data.get("ok"):
            raise HTTPException(status_code=503, detail={"error": "backend_unavailable", "message": health_data.get("error", "browser backend is unavailable")})
        started = int(time.time())
        selected_model = req.model or settings.model_id
        selected_level = _request_level(req)
        selected_model = _validate_requested_options(settings, selected_model, selected_level)
        thread_source = _request_thread_source(req)
        new_session = req.new_session or _truthy_header(x_new_session) or thread_source == "thread_title"
        session_id = None if thread_source == "thread_title" else _request_session_id(req)
        completion_kwargs = {"model": selected_model, "new_session": new_session, "level": selected_level}
        if session_id:
            completion_kwargs["session_id"] = session_id
        result = await _run_with_queue(
            settings,
            queue_sem,
            lambda: backend.complete(messages, **completion_kwargs),
        )
        response_id = f"resp_{uuid.uuid4().hex}"
        message_id = f"msg_{uuid.uuid4().hex}"
        usage = {
            "input_tokens": result.prompt_tokens,
            "output_tokens": result.completion_tokens,
            "total_tokens": result.prompt_tokens + result.completion_tokens,
        }
        output_item = {
            "id": message_id,
            "type": "message",
            "status": "completed",
            "role": "assistant",
            "content": [{"type": "output_text", "text": result.text, "annotations": [], "logprobs": []}],
        }
        completed_response = {
            "id": response_id,
            "object": "response",
            "created_at": started,
            "status": "completed",
            "model": result.model,
            "output": [output_item],
            "usage": usage,
        }
        if req.stream:
            async def response_events():
                sequence = 0

                def event(event_type: str, payload: dict) -> str:
                    nonlocal sequence
                    payload = {"type": event_type, **payload, "sequence_number": sequence}
                    sequence += 1
                    return f"event: {event_type}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"

                in_progress_response = {**completed_response, "status": "in_progress", "output": [], "usage": None}
                yield event("response.created", {"response": in_progress_response})
                yield event("response.in_progress", {"response": in_progress_response})
                in_progress_item = {**output_item, "status": "in_progress", "content": []}
                yield event("response.output_item.added", {"output_index": 0, "item": in_progress_item})
                yield event("response.content_part.added", {"item_id": message_id, "output_index": 0, "content_index": 0, "part": {"type": "output_text", "text": "", "annotations": [], "logprobs": []}})
                yield event("response.output_text.delta", {"item_id": message_id, "output_index": 0, "content_index": 0, "delta": result.text, "logprobs": []})
                yield event("response.output_text.done", {"item_id": message_id, "output_index": 0, "content_index": 0, "text": result.text, "logprobs": []})
                yield event("response.content_part.done", {"item_id": message_id, "output_index": 0, "content_index": 0, "part": output_item["content"][0]})
                yield event("response.output_item.done", {"output_index": 0, "item": output_item})
                yield event("response.completed", {"response": completed_response})

            return _attach_conversation_cookie(StreamingResponse(response_events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}), conversation_cookie)
        return _attach_conversation_cookie(JSONResponse(content={
            "id": response_id,
            "object": "response",
            "created_at": started,
            "status": "completed",
            "model": result.model,
            "level": result.level,
            "output": [{"id": message_id, "type": "message", "role": "assistant", "content": [{"type": "output_text", "text": result.text}]}],
            "output_text": result.text,
            "usage": usage,
        }), conversation_cookie)

    return app


def _responses_input_to_messages(value: str | list | dict) -> list[ChatMessage]:
    if isinstance(value, str):
        return [ChatMessage(role="user", content=value)]
    if isinstance(value, list):
        messages: list[ChatMessage] = []
        for item in value:
            if isinstance(item, dict) and "role" in item:
                content = item.get("content", "")
                if isinstance(content, list):
                    content = "\n".join(str(part.get("text", part)) if isinstance(part, dict) else str(part) for part in content)
                messages.append(ChatMessage(role=str(item.get("role", "user")), content=content))
        return messages or [ChatMessage(role="user", content=str(value))]
    return [ChatMessage(role="user", content=str(value))]


def main() -> None:
    settings = Settings.from_env()
    settings.validate_for_runtime()
    uvicorn.run("chatgpt_web_provider.app:create_app", factory=True, host=settings.host, port=settings.port)


if __name__ == "__main__":
    main()
