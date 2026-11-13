﻿import { Hono } from "hono";
import hono from "../declare/hono.js";
import peer from "./peer.js";
import rpc from "./rpc.js";
import tasks from "./tasks.js";

function encodeEvent(name: string, data: unknown, id?: number): Uint8Array {
  const lineBreak = String.fromCharCode(10);
  return new TextEncoder().encode([
    ...(id === undefined ? [] : ["id: " + id]),
    "event: " + name,
    "data: " + JSON.stringify(data),
    "",
    "",
  ].join(lineBreak));
}

export default new Hono()
  .get("/", c => c.redirect(hono.honoUrl("openai-v1-responses-download-react")))
  .post("/rpc", async c => {
    let operation: { path?: unknown; input?: unknown };
    try {
      operation = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    if (typeof operation.path !== "string") {
      return c.json({ error: "RPC path must be a string" }, 400);
    }
    try {
      const output = await rpc.dispatch(operation.path, operation.input);
      return c.json({ output });
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      return c.json({ error }, 400);
    }
  })
  .get("/events", c => {
    // The server owns the active task. A page refresh can subscribe without
    // knowing the previous in-memory taskId.
    const requestedTaskId = c.req.query("taskId");
    const taskId = requestedTaskId || tasks.getLatest()?.taskId;
    if (requestedTaskId && !tasks.get(requestedTaskId)) {
      return c.json({ error: "Installation task not found" }, 404);
    }

    let disposed = false;
    let unsubscribeTask = () => {};
    let unsubscribePeer = () => {};
    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      unsubscribeTask();
      unsubscribePeer();
    };

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (name: string, data: unknown, eventId?: number) => {
          if (disposed) return;
          try {
            controller.enqueue(encodeEvent(name, data, eventId));
          } catch {
            cleanup();
          }
        };
        const lineBreak = String.fromCharCode(10);
        controller.enqueue(new TextEncoder().encode(["retry: 3000", "", ""].join(lineBreak)));
        const lastEventId = Number.parseInt(c.req.header("last-event-id") ?? "", 10);
        const onTask = (event: { id: number; task: unknown }) => {
          send("install", event.task, event.id);
        };
        if (requestedTaskId) {
          unsubscribeTask = tasks.subscribe(
            requestedTaskId,
            onTask,
            Number.isNaN(lastEventId) ? -1 : lastEventId,
          );
        } else {
          // Follow the latest task, including tasks created after this SSE opens.
          unsubscribeTask = tasks.subscribeLatest(onTask);
        }
        unsubscribePeer = peer.subscribe(status => send("peer-status", status));
      },
      cancel() { cleanup(); },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  })
  .get("/health", c => c.json({ ok: true, ...peer.getStatus() }));
