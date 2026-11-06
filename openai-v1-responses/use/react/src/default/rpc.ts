import { Remote, type context_t } from "invoke-protocol";
import type rpc from "openai-v1-responses-use-hono/default/rpc";

type DefaultContext = context_t & { readonly routers: typeof rpc.routers };
type InvokeOperation = { readonly path: string; readonly input: unknown };

class DefaultRpcConsumer extends Remote<DefaultContext> {
  create(invoke: (operation: InvokeOperation) => unknown | Promise<unknown>) {
    return this.invokeProxyInitFromInvoke(invoke);
  }
}

const consumer = new DefaultRpcConsumer();

export default consumer.create(async ({ path, input }) => {
  const response = await fetch("/rpc", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, input }),
  });
  const result = await response.json() as { output?: unknown; error?: string };
  if (!response.ok) throw new Error(result.error || "RPC request failed");
  return result.output;
});
