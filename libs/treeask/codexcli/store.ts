import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import { z } from "zod";

const codexcliNodeIdValidator = z.string().min(1);
const codexcliNodeRoleValidator = z.enum(["project", "user", "assistant"]);
const codexcliNodeStatusValidator = z.enum(["ready", "streaming", "failed"]);
const codexcliNodeValidator = z.object({
  id: codexcliNodeIdValidator,
  parentId: codexcliNodeIdValidator.nullable(),
  role: codexcliNodeRoleValidator,
  status: codexcliNodeStatusValidator,
  text: z.string(),
  error: z.string().nullable(),
}).strict();
const codexcliValidator = z.object({ nodes: z.array(codexcliNodeValidator) }).strict();
const codexcliAskInputValidator = z.object({
  parentId: codexcliNodeIdValidator,
  text: z.string().trim().min(1).max(200_000),
}).strict();
const codexcliNodeAddInputValidator = codexcliNodeValidator.omit({ id: true, error: true })
  .extend({ error: z.string().nullable().optional() }).strict();
const codexcliPromptNodeValidator = codexcliNodeValidator.pick({ role: true, text: true });
const codexcliResponseAppendInputValidator = z.object({
  nodeId: codexcliNodeIdValidator,
  text: z.string(),
}).strict();
const codexcliResponseCompleteInputValidator = z.object({
  nodeId: codexcliNodeIdValidator,
}).strict();
const codexcliResponseFailInputValidator = z.object({
  nodeId: codexcliNodeIdValidator,
  error: z.string().trim().min(1),
}).strict();

type CodexcliNode = z.infer<typeof codexcliNodeValidator>;
type Codexcli = z.infer<typeof codexcliValidator>;

type nodeState_t = {
  crypto_randomUUID_nodestate: typeof crypto.randomUUID;
  fetch_nodestate: typeof fetch;
};
type CodexcliSlice = {
  codexcli: Codexcli;
  codexcliActions: { ask(input: unknown): Promise<void> };
  codexcliPrivateActions: {
    nodeAdd(input: unknown): CodexcliNode;
    pathRead(id: string): CodexcliNode[];
    promptCreate(id: string): string;
    responseAppend(input: unknown): void;
    responseComplete(input: unknown): void;
    responseFail(input: unknown): void;
  };
};

const codexcliAddress = "/codexcli";
const initial = codexcliValidator.parse({
  nodes: [{
    error: null,
    id: "root",
    parentId: null,
    role: "project",
    status: "ready",
    text: "AI Tree",
  }],
});

const codexcliStore: ImmerStateCreator<CodexcliSlice, nodeState_t> = (set, get) => {
  const errorMessageRead = (error: unknown): string => {
    const value = (error instanceof Error ? error.message : String(error ?? "")).trim();
    return value || "Codexcli request failed";
  };

  return {
    codexcli: structuredClone(initial),
    codexcliActions: {
      async ask(input) {
        const askInput = codexcliAskInputValidator.parse(input);
        const parent = get().codexcli.nodes.find(node => node.id === askInput.parentId);
        if (
          parent === undefined
          || parent.status !== "ready"
          || (parent.role !== "project" && parent.role !== "assistant")
        ) throw new Error("The parent must be a ready project or assistant node");

        const userNode = get().codexcliPrivateActions.nodeAdd({
          error: null,
          parentId: parent.id,
          role: "user",
          status: "ready",
          text: askInput.text,
        });
        const assistantNode = get().codexcliPrivateActions.nodeAdd({
          error: null,
          parentId: userNode.id,
          role: "assistant",
          status: "streaming",
          text: "",
        });

        try {
          const response = await get().fetch_nodestate(codexcliAddress, {
            body: get().codexcliPrivateActions.promptCreate(userNode.id),
            headers: { "content-type": "text/plain;charset=UTF-8" },
            method: "POST",
          });
          if (!response.ok) throw new Error(`Codexcli request failed with status ${response.status}`);
          if (response.body === null) throw new Error("Codexcli response body is unavailable");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            const text = z.string().parse(decoder.decode(chunk.value, { stream: true }));
            if (text) get().codexcliPrivateActions.responseAppend({ nodeId: assistantNode.id, text });
          }
          const trailingText = z.string().parse(decoder.decode());
          if (trailingText) {
            get().codexcliPrivateActions.responseAppend({ nodeId: assistantNode.id, text: trailingText });
          }
          get().codexcliPrivateActions.responseComplete({ nodeId: assistantNode.id });
        } catch (error) {
          get().codexcliPrivateActions.responseFail({
            error: errorMessageRead(error),
            nodeId: assistantNode.id,
          });
        }
      },
    },
    codexcliPrivateActions: {
      nodeAdd(input) {
        const nodeInput = codexcliNodeAddInputValidator.parse(input);
        const node = codexcliNodeValidator.parse({
          ...nodeInput,
          error: nodeInput.error ?? null,
          id: get().crypto_randomUUID_nodestate(),
        });
        set(state => {
          state.codexcli.nodes.push(node);
        });
        return node;
      },
      pathRead(id) {
        let nodeId: string | null = codexcliNodeIdValidator.parse(id);
        const visitedIds = new Set<string>();
        const path: CodexcliNode[] = [];
        while (nodeId !== null) {
          if (visitedIds.has(nodeId)) throw new Error(`Repeated node id in path: ${nodeId}`);
          visitedIds.add(nodeId);
          const node: CodexcliNode | undefined = get().codexcli.nodes
            .find(candidate => candidate.id === nodeId);
          if (node === undefined) throw new Error(`Node not found: ${nodeId}`);
          path.unshift(node);
          nodeId = node.parentId;
        }
        return path;
      },
      promptCreate(id) {
        return get().codexcliPrivateActions.pathRead(id)
          .map(node => codexcliPromptNodeValidator.parse({
            role: node.role,
            text: node.text,
          }))
          .map(node => `${node.role}: ${node.text}`)
          .join("\n");
      },
      responseAppend(input) {
        const value = codexcliResponseAppendInputValidator.parse(input);
        set(state => {
          const node = state.codexcli.nodes.find(candidate => candidate.id === value.nodeId);
          if (node === undefined || node.role !== "assistant" || node.status !== "streaming") {
            throw new Error("Response text requires a streaming assistant node");
          }
          node.text += value.text;
        });
      },
      responseComplete(input) {
        const value = codexcliResponseCompleteInputValidator.parse(input);
        set(state => {
          const node = state.codexcli.nodes.find(candidate => candidate.id === value.nodeId);
          if (node === undefined || node.role !== "assistant" || node.status !== "streaming") {
            throw new Error("Response completion requires a streaming assistant node");
          }
          node.status = "ready";
          node.error = null;
        });
      },
      responseFail(input) {
        const value = codexcliResponseFailInputValidator.parse(input);
        set(state => {
          const node = state.codexcli.nodes.find(candidate => candidate.id === value.nodeId);
          if (node === undefined || node.role !== "assistant") {
            throw new Error("Response failure requires an assistant node");
          }
          node.status = "failed";
          node.error = value.error;
        });
      },
    },
  };
};

export {
  codexcliAddress,
  codexcliAskInputValidator,
  codexcliNodeValidator,
  codexcliValidator,
  type Codexcli,
  type CodexcliNode,
  type nodeState_t,
};
export default codexcliStore;
