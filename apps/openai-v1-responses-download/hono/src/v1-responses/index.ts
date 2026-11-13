﻿import { Hono } from "hono";
import peer from "../default/peer.js";
import auth from "../default/auth.js";

type ResponsesRequest = {
  model?: string;
  stream?: boolean;
  [key: string]: unknown;
};

function sseEvent(encoder: TextEncoder, event: unknown): Uint8Array {
  const value = event as { type?: string };
  return encoder.encode(`event: ${value.type ?? "message"}\ndata: ${JSON.stringify(event)}\n\n`);
}

export default new Hono().post("/responses", async c => {
  const authorization = c.req.header("authorization") ?? "";
  const apiKey = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!await auth.verifyApiKey(apiKey)) {
    return c.json({
      error: { message: "Invalid API key.", type: "authentication_error" },
    }, 401);
  }

  let body: ResponsesRequest;
  try {
    body = await c.req.json<ResponsesRequest>();
  } catch {
    return c.json({
      error: { message: "Request body must be valid JSON.", type: "invalid_request_error" },
    }, 400);
  }

  if (!body || typeof body !== "object" || !body.model || !body.input) {
    return c.json({
      error: { message: "Responses API requires model and input.", type: "invalid_request_error" },
    }, 400);
  }

  if (body.stream === true) {
    const encoder = new TextEncoder();
    let cancelled = false;
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller;
        void peer.request(body, event => {
          if (!cancelled) controller.enqueue(sseEvent(encoder, event));
        }).then(
          () => {
            if (!cancelled) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
            }
          },
          error => {
            if (!cancelled) {
              const payload = {
                type: "error",
                error: { message: error instanceof Error ? error.message : String(error) },
              };
              controller.enqueue(sseEvent(encoder, payload));
              controller.close();
            }
          },
        );
      },
      cancel() {
        cancelled = true;
        controllerRef = undefined;
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  try {
    const response = await peer.request({ ...body, stream: true });
    return c.json(response);
  } catch (error) {
    return c.json({
      error: {
        message: error instanceof Error ? error.message : String(error),
        type: "server_error",
      },
    }, 502);
  }
});
