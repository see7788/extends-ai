import { Codex } from "@openai/codex-sdk";
import { Hono } from "hono";
import { streamText } from "hono/streaming";
import { resolve } from "node:path";

const MAX_PROMPT_LENGTH = 200_000;
const TEXT_CONTENT_TYPE =
  /^text\/plain(?:\s*;\s*charset\s*=\s*(?:"[^"]*"|[^;\s]+))?\s*$/i;

const codex = new Codex();

const router = new Hono().post("/codexcli", async context => {
  const contentType = context.req.header("content-type");
  if (contentType === undefined || !TEXT_CONTENT_TYPE.test(contentType)) {
    return context.text("Content-Type must be text/plain.", 415);
  }

  const prompt = await context.req.text();
  if (prompt.trim().length === 0) {
    return context.text("Request body must contain a non-empty text prompt.", 400);
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return context.text("Request body must not exceed 200000 characters.", 400);
  }

  return streamText(
    context,
    async stream => {
      const controller = new AbortController();
      const requestSignal = context.req.raw.signal;
      const abort = () => controller.abort();
      if (requestSignal.aborted) abort();
      else requestSignal.addEventListener("abort", abort, { once: true });
      stream.onAbort(abort);

      try {
        const configuredWorkspace = process.env.AI_WORKSPACE?.trim();
        const workingDirectory = configuredWorkspace
          ? configuredWorkspace
          : resolve(process.cwd(), "../..");
        const thread = codex.startThread({
          approvalPolicy: "never",
          sandboxMode: "workspace-write",
          workingDirectory,
        });
        const { events } = await thread.runStreamed(prompt, { signal: controller.signal });
        const previousTextByItem = new Map<string, string>();

        for await (const event of events) {
          if (stream.aborted) return;
          if (event.type === "error") throw new Error(event.message);
          if (event.type === "turn.failed") throw new Error(event.error.message);
          if (
            (event.type !== "item.updated" && event.type !== "item.completed")
            || event.item.type !== "agent_message"
          ) continue;
          const previousText = previousTextByItem.get(event.item.id) ?? "";
          const nextText = event.item.text;
          if (!nextText.startsWith(previousText)) continue;
          previousTextByItem.set(event.item.id, nextText);
          const suffix = nextText.slice(previousText.length);
          if (suffix) await stream.write(suffix);
        }
      } finally {
        requestSignal.removeEventListener("abort", abort);
        abort();
      }
    },
    async (_error, stream) => stream.abort(),
  );
});

export default router;
