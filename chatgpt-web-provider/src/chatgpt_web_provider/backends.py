from __future__ import annotations

import asyncio
import re
from abc import ABC, abstractmethod
from pathlib import Path

from .config import Settings
from .models import ChatMessage, CompletionResult


class Backend(ABC):
    def __init__(self, settings: Settings):
        self.settings = settings

    @abstractmethod
    async def complete(self, messages: list[ChatMessage], model: str | None = None, new_session: bool = False, level: str | None = None, session_id: str | None = None) -> CompletionResult:
        raise NotImplementedError

    async def health(self) -> dict:
        return {"ok": True, "backend": self.settings.backend}


class MockBackend(Backend):
    async def complete(self, messages: list[ChatMessage], model: str | None = None, new_session: bool = False, level: str | None = None, session_id: str | None = None) -> CompletionResult:
        last_user = next((m.text() for m in reversed(messages) if m.role == "user"), "")
        text = f"[mock:{self.settings.model_id}] {last_user}"
        return CompletionResult(text=text, model=model or self.settings.model_id, level=level, prompt_tokens=sum(len(m.text().split()) for m in messages), completion_tokens=len(text.split()))


class BrowserBackend(Backend):
    """Browser-backed ChatGPT.com worker.

    This intentionally keeps the first implementation conservative. It launches a
    persistent Chromium profile and drives ChatGPT through Playwright. Real
    production use should pin selectors with browser-level regression tests.
    """

    def __init__(self, settings: Settings):
        super().__init__(settings)
        self._lock = asyncio.Lock()
        self._playwright = None
        self._browser = None
        self._context = None
        self._page = None
        self._capabilities_loaded = False
        self._level_positions: dict[str, int] = {}
        self._active_session_id: str | None = None

    async def _ensure_page(self):
        if self._page:
            return self._page
        try:
            from playwright.async_api import async_playwright
        except Exception as exc:  # pragma: no cover - depends on optional browser env
            raise RuntimeError("playwright is not installed") from exc

        Path(self.settings.profile_dir).mkdir(parents=True, exist_ok=True)
        self._playwright = await async_playwright().start()
        if self.settings.cdp_url:
            self._browser = await self._playwright.chromium.connect_over_cdp(self.settings.cdp_url)
            if not self._browser.contexts:
                raise RuntimeError("Chrome CDP 已连接，但没有可用浏览器上下文")
            self._context = self._browser.contexts[0]
            await self._context.add_cookies([{"name": "codex_composer_mode", "value": "chat", "domain": "chatgpt.com", "path": "/"}])
        else:
            self._context = await self._playwright.chromium.launch_persistent_context(
                self.settings.profile_dir,
                headless=self.settings.headless,
                viewport={"width": 1400, "height": 1000},
                args=["--disable-blink-features=AutomationControlled"],
            )
        pages = list(self._context.pages)
        self._page = next((page for page in pages if "chatgpt.com" in page.url), pages[0] if pages else await self._context.new_page())
        if "chatgpt.com" not in self._page.url:
            await self._page.goto("https://chatgpt.com/", wait_until="domcontentloaded", timeout=60_000)
        elif self.settings.cdp_url:
            await self._page.reload(wait_until="domcontentloaded", timeout=60_000)
        return self._page

    async def complete(self, messages: list[ChatMessage], model: str | None = None, new_session: bool = False, level: str | None = None, session_id: str | None = None) -> CompletionResult:
        async with self._lock:
            page = await self._ensure_page()
            prompt = self._render_prompt(messages)
            session_changed = bool(session_id and session_id != self._active_session_id)
            if session_id and "/c/" in page.url:
                session_changed = session_changed or (await page.title()).strip() != f"codex:{session_id}"
            if not session_id and not self._active_session_id and "/c/" not in page.url:
                session_changed = True
            if "log in" in (await page.title()).lower():
                raise RuntimeError("ChatGPT browser profile is not logged in; run setup with a visible browser first")
            if new_session:
                await self._start_new_session(page)
            elif session_changed:
                await self._start_new_session(page, session_id=session_id)
            await self._apply_preferences(page, model or self.settings.model_id, level)

            answer_selector = "[data-content-search-unit-key$=':assistant'] [data-response-body]"
            previous_answers = [text.strip() for text in await page.locator(answer_selector).all_text_contents()]
            previous_response_count = await page.locator("[data-response-body]").count()
            previous_image_count = await page.locator("[data-response-body] [data-testid='generated-image-preview']:visible").count()
            composer = page.locator("#prompt-textarea, div[contenteditable='true']").last
            await composer.wait_for(timeout=30_000)
            await composer.fill(prompt)
            await page.keyboard.press("Enter")
            await self._wait_until_idle(page, previous_answers, previous_response_count, previous_image_count)
            text = await self._extract_last_answer(page)
            if session_id:
                self._active_session_id = session_id
                expected_title = f"codex:{session_id}"
                topic_match = re.search(r"/c/([0-9a-f-]{20,})", page.url, re.IGNORECASE)
                if topic_match and (await page.title()).strip() != expected_title:
                    topic_row = page.locator(f"[data-sidebar-cycle-item][data-sidebar-archive-chatgpt-id='{topic_match.group(1)}']").first
                    action_button = topic_row.locator("button[aria-haspopup='menu']").first
                    if await action_button.count() > 0:
                        await action_button.click(timeout=5_000)
                        menu_items = page.locator("[role='menuitem']:visible")
                        if await menu_items.count() > 0:
                            await menu_items.first.click(timeout=5_000)
                            rename_input = page.locator("input:visible").first
                            await rename_input.wait_for(timeout=5_000)
                            await rename_input.fill(expected_title)
                            await rename_input.press("Enter")
                            await page.wait_for_timeout(500)
            return CompletionResult(text=text, model=model or self.settings.model_id, level=level)

    async def health(self) -> dict:
        try:
            async with self._lock:
                page = await self._ensure_page()
                title = await page.title()
                page_url = page.url.lower()
                page_text = (await page.locator("body").inner_text(timeout=5_000)).lower()
                login_markers = ("/auth/", "login", "sign in", "signin", "log in", "create account", "登录", "注册")
                if any(marker in page_url or marker in title.lower() or marker in page_text for marker in login_markers):
                    return {"ok": True, "backend": "browser", "title": title, "url": page.url, "logged_in_hint": False}
                if not self._capabilities_loaded:
                    model_button = page.locator("button[aria-label*='ChatGPT'][aria-haspopup='menu']:visible").first
                    if await model_button.count() == 0:
                        raise RuntimeError("无法找到 ChatGPT 模型选择器")
                    await model_button.click(timeout=5_000)
                    await page.wait_for_timeout(300)
                    model_items = page.locator("[role='menuitemradio']:visible")
                    model_labels = [label.strip() for label in await model_items.all_text_contents() if label.strip()]
                    selected_model_item = page.locator("[role='menuitemradio'][data-model-selected='true']:visible, [role='menuitemradio'][aria-checked='true']:visible").first
                    selected_model_label = (await selected_model_item.inner_text()).strip() if await selected_model_item.count() > 0 else ""
                    await page.keyboard.press("Escape")
                    if not model_labels:
                        raise RuntimeError("无法读取 ChatGPT 当前模型列表")
                    model_labels_by_id: dict[str, str] = {}
                    for label in model_labels:
                        model_id = next((candidate for candidate, candidate_label in self.settings.model_labels.items() if candidate_label.casefold() == label.casefold()), None)
                        model_id = model_id or re.sub(r"[^a-z0-9]+", "-", label.casefold()).strip("-")
                        if model_id:
                            model_labels_by_id[model_id] = label
                    if not model_labels_by_id:
                        raise RuntimeError("ChatGPT 模型列表为空")
                    self.settings.available_models = list(model_labels_by_id)
                    self.settings.model_labels = model_labels_by_id
                    selected_model_id = next((candidate for candidate, candidate_label in model_labels_by_id.items() if candidate_label.casefold() == selected_model_label.casefold()), None)
                    if selected_model_id:
                        self.settings.model_id = selected_model_id
                    elif self.settings.model_id not in self.settings.available_models:
                        self.settings.model_id = self.settings.available_models[0]

                    await model_button.click(timeout=5_000)
                    await page.wait_for_timeout(300)
                    slider_item = page.locator("[data-reasoning-slider]:visible").first
                    slider = slider_item.locator("[role='slider']").first
                    track = slider_item.locator("[data-model-picker-power-slider]").first
                    if await slider.count() == 0 or await track.count() == 0:
                        raise RuntimeError("无法读取 ChatGPT 推理强度控件")
                    minimum = int(await slider.get_attribute("aria-valuemin") or "0")
                    maximum = int(await slider.get_attribute("aria-valuemax") or "0")
                    current = int(await slider.get_attribute("aria-valuenow") or str(maximum))
                    box = await track.bounding_box()
                    if not box or maximum < minimum:
                        raise RuntimeError("ChatGPT 推理强度控件无效")
                    level_positions: dict[str, int] = {}
                    level_labels: dict[str, str] = {}
                    current_level_id: str | None = None
                    for position in range(minimum, maximum + 1):
                        x = box["x"] + (box["width"] - 26) * ((position - minimum) / max(1, maximum - minimum)) + 13
                        await page.mouse.click(x, box["y"] + box["height"] / 2)
                        await page.wait_for_timeout(150)
                        level_lines = [line.strip() for line in (await model_button.inner_text()).splitlines() if line.strip()]
                        level_label = level_lines[-1] if level_lines else await model_button.get_attribute("data-selected-reasoning-effort") or ""
                        level_id = re.sub(r"[^a-z0-9]+", "_", level_label.casefold()).strip("_")
                        if level_id:
                            level_positions.setdefault(level_id, position)
                            level_labels.setdefault(level_id, level_label)
                            if position == current:
                                current_level_id = level_id
                    restore_position = min(max(current, minimum), maximum)
                    restore_x = box["x"] + (box["width"] - 26) * ((restore_position - minimum) / max(1, maximum - minimum)) + 13
                    await page.mouse.click(restore_x, box["y"] + box["height"] / 2)
                    await page.keyboard.press("Escape")
                    if not level_positions:
                        raise RuntimeError("ChatGPT 推理强度列表为空")
                    self._level_positions = level_positions
                    self.settings.available_levels = list(level_positions)
                    self.settings.level_labels = level_labels
                    self.settings.default_level = current_level_id or self.settings.available_levels[0]
                    self._capabilities_loaded = True
                return {
                    "ok": True,
                    "backend": "browser",
                    "title": title,
                    "logged_in_hint": True,
                    "models": self.settings.available_models,
                    "levels": self.settings.available_levels,
                }
        except Exception as exc:
            return {"ok": False, "backend": "browser", "error": str(exc)}

    async def _apply_preferences(self, page, model: str, level: str | None) -> None:  # pragma: no cover - browser integration
        """Best-effort model / reasoning-level selection in the ChatGPT UI.

        ChatGPT UI changes are reported as provider errors so Codex can display
        the failure instead of waiting on a request with unknown preferences.
        """
        await self._try_select_label(page, self.settings.model_label(model))
        if level:
            if level in self._level_positions:
                model_button = page.locator("button[aria-label*='ChatGPT'][aria-haspopup='menu']:visible").first
                if await model_button.count() == 0:
                    raise RuntimeError("ChatGPT 模型选择器当前不可见，无法设置推理档位")
                try:
                    await model_button.click(timeout=5_000)
                except Exception as exc:
                    raise RuntimeError("ChatGPT 模型选择器点击失败，请检查页面状态。") from exc
                await page.wait_for_timeout(300)
                slider_item = page.locator("[data-reasoning-slider]:visible").first
                track = slider_item.locator("[data-model-picker-power-slider]").first
                box = await track.bounding_box()
                slider = slider_item.locator("[role='slider']").first
                if not box or await slider.count() == 0:
                    raise RuntimeError("ChatGPT 推理强度控件当前不可用")
                minimum = int(await slider.get_attribute("aria-valuemin") or "0")
                maximum = int(await slider.get_attribute("aria-valuemax") or "0")
                position = self._level_positions[level]
                x = box["x"] + (box["width"] - 26) * ((position - minimum) / max(1, maximum - minimum)) + 13
                await page.mouse.click(x, box["y"] + box["height"] / 2)
                await page.wait_for_timeout(300)
                await page.keyboard.press("Escape")
            else:
                await self._try_select_label(page, self.settings.level_label(level))

    @staticmethod
    async def _try_select_label(page, label: str) -> bool:  # pragma: no cover - browser integration
        if not label:
            return False
        candidates = (
            f"button:has-text('{label}')",
            f"[role='button']:has-text('{label}')",
            f"[role='menuitem']:has-text('{label}')",
            f"[role='menuitemradio']:has-text('{label}')",
            f"text={label}",
        )
        # First try a direct visible option (already expanded menu or direct button).
        for selector in candidates:
            try:
                loc = page.locator(selector).first
                if await loc.count() > 0 and await loc.is_visible(timeout=1000):
                    await loc.click(timeout=3000)
                    await page.wait_for_timeout(500)
                    return True
            except Exception:
                continue
        # Then try common model/menu buttons and search again.
        for opener in (
            "[data-testid='model-switcher-dropdown-button']",
            "button[aria-haspopup='menu']",
            "button:has-text('ChatGPT')",
            "button:has-text('GPT')",
        ):
            try:
                button = page.locator(opener).first
                if await button.count() > 0 and await button.is_visible(timeout=1000):
                    await button.click(timeout=3000)
                    await page.wait_for_timeout(700)
                    for selector in candidates:
                        loc = page.locator(selector).first
                        if await loc.count() > 0 and await loc.is_visible(timeout=1000):
                            await loc.click(timeout=3000)
                            await page.wait_for_timeout(500)
                            return True
            except Exception:
                continue
        return False

    @staticmethod
    def _render_prompt(messages: list[ChatMessage]) -> str:
        return "\n\n".join(f"{m.role.upper()}: {m.text()}" for m in messages)

    @staticmethod
    async def _wait_until_idle(page, previous_answers: list[str], previous_response_count: int, previous_image_count: int) -> None:  # pragma: no cover - browser integration
        answer_selector = "[data-content-search-unit-key$=':assistant'] [data-response-body]"
        response_selector = "[data-response-body]"
        image_selector = "[data-response-body] [data-testid='generated-image-preview']:visible"
        stop = page.locator(
            "button[aria-label*='Stop']:visible, button[data-testid*='stop']:visible, "
            "button:has-text('停止生成'):visible, button:has-text('Stop generating'):visible"
        )
        for _ in range(240):
            try:
                answers = [text.strip() for text in await page.locator(answer_selector).all_text_contents()]
                response_count = await page.locator(response_selector).count()
                image_count = await page.locator(image_selector).count()
                text_finished = (
                    answers
                    and answers[-1]
                    and (len(answers) > len(previous_answers) or answers[-1] != (previous_answers[-1] if previous_answers else ""))
                )
                image_finished = response_count > previous_response_count and image_count > previous_image_count
                if (text_finished or image_finished) and await stop.count() == 0:
                    await page.wait_for_timeout(1500)
                    settled_answers = [text.strip() for text in await page.locator(answer_selector).all_text_contents()]
                    settled_response_count = await page.locator(response_selector).count()
                    settled_image_count = await page.locator(image_selector).count()
                    text_settled = text_finished and settled_answers and settled_answers[-1] == answers[-1]
                    image_settled = image_finished and settled_response_count == response_count and settled_image_count == image_count
                    if await stop.count() == 0 and (text_settled or image_settled):
                        return
            except Exception as exc:
                raise RuntimeError("读取 ChatGPT 回复状态失败，请检查页面是否仍在生成。") from exc
            await page.wait_for_timeout(1000)
        raise RuntimeError("等待 ChatGPT 回复完成超时，未识别到稳定的文本或图片结果。")

    async def _start_new_session(self, page, session_id: str | None = None) -> None:  # pragma: no cover - browser integration
        """Restore the exact titled ChatGPT topic, or create a fresh conversation."""
        if session_id:
            expected_title = f"codex:{session_id}"

            async def open_topic(chat_id: str) -> None:
                await page.goto(f"https://chatgpt.com/c/{chat_id}", wait_until="domcontentloaded", timeout=60_000)
                for _ in range(10):
                    if (await page.title()).strip() == expected_title:
                        return
                    await page.wait_for_timeout(500)

            visible_links = page.locator("a[href*='/c/']:visible")
            for index in range(await visible_links.count()):
                link = visible_links.nth(index)
                if (await link.inner_text()).strip() == expected_title:
                    href = await link.get_attribute("href")
                    chat_id = re.search(r"/c/([0-9a-f-]{20,})", href or "", re.IGNORECASE)
                    if chat_id:
                        await open_topic(chat_id.group(1))
                        return

            search_opener = page.locator("button[aria-label='搜索'], button[aria-label*='Search']").first
            if await search_opener.count() > 0 and await search_opener.is_visible():
                await search_opener.click(timeout=5_000)
                search_input = page.locator("input[role='combobox']:visible").first
                await search_input.wait_for(timeout=5_000)
                await search_input.fill(expected_title)
                for _ in range(10):
                    results = page.locator("[role='dialog']:visible a[role='option'][href*='/c/']")
                    for index in range(await results.count()):
                        result = results.nth(index)
                        result_title = result.locator("span.truncate").first
                        if await result_title.count() > 0 and (await result_title.inner_text()).strip() == expected_title:
                            href = await result.get_attribute("href")
                            chat_id = re.search(r"/c/([0-9a-f-]{20,})", href or "", re.IGNORECASE)
                            if chat_id:
                                await page.keyboard.press("Escape")
                                await open_topic(chat_id.group(1))
                                return
                    await page.wait_for_timeout(500)
                await page.keyboard.press("Escape")
        await page.goto("https://chatgpt.com/", wait_until="domcontentloaded", timeout=60_000)
        await page.wait_for_timeout(1500)
        if await page.locator("#prompt-textarea, div[contenteditable='true']").count() > 0:
            return
        for selector in (
            "[data-testid='create-new-chat-button']",
            "button[aria-label*='New chat']",
            "a[aria-label*='New chat']",
            "a[href='/']",
        ):
            candidate = page.locator(selector).first
            try:
                if await candidate.count() > 0:
                    await candidate.click(timeout=5_000)
                    await page.wait_for_timeout(1500)
                    return
            except Exception:
                continue

    @staticmethod
    async def _extract_last_answer(page) -> str:  # pragma: no cover - browser integration
        candidates = page.locator("[data-content-search-unit-key$=':assistant'] [data-response-body]")
        count = await candidates.count()
        if count:
            text = (await candidates.nth(count - 1).inner_text()).strip()
            if text:
                return text
        candidates = page.locator("[data-message-author-role='assistant']")
        count = await candidates.count()
        if count:
            text = (await candidates.nth(count - 1).inner_text()).strip()
            if text:
                return text
        generated_images = page.locator("[data-response-body] [data-testid='generated-image-preview']:visible")
        if await generated_images.count():
            return "ChatGPT 已生成图片，请在 ChatGPT 页面查看图片结果。"
        streams = page.locator("[data-d-stream-run]")
        stream_count = await streams.count()
        if stream_count:
            texts = [(await streams.nth(index).inner_text()).strip() for index in range(stream_count)]
            texts = [text for text in texts if text]
            if texts:
                return texts[-1]
        body = await page.locator("body").inner_text(timeout=5000)
        return body[-4000:]


def build_backend(settings: Settings) -> Backend:
    if settings.backend == "browser":
        return BrowserBackend(settings)
    return MockBackend(settings)
