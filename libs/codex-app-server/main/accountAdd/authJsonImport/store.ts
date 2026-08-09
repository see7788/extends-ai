import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { z } from "zod";

type AuthJsonImportOperation = "authJsonCreate" | "authJsonImport";

const authJsonImportValidator = z.object({
  error: z.string().nullable(),
  status: z.enum(["idle", "working", "error"]),
});
const authJsonValidator = z.object({
  auth_mode: z.literal("chatgpt"),
  OPENAI_API_KEY: z.union([z.literal(""), z.null()]).optional(),
  last_refresh: z.string().optional(),
  tokens: z.object({
    access_token: z.string().min(1),
    account_id: z.string().min(1),
    id_token: z.string().min(1),
    refresh_token: z.string().min(1),
  }),
}).passthrough();
const sourceValidator = z.object({
  sourceFileName: z.literal("auth.json"),
  sourcePath: z.string().trim().min(1),
  sourceText: z.string().min(1),
});
const accountReadResultValidator = z.object({
  account: z.object({
    email: z.string().email().nullable(),
    planType: z.string().nullable(),
  }),
  requiresOpenaiAuth: z.boolean(),
}).passthrough();
const operationFailValidator = z.object({ error: z.string().min(1) });
const commandValidator = z.object({});
const importResultValidator = z.object({ imported: z.boolean() });

type AuthJsonImport = z.infer<typeof authJsonImportValidator>;
type AuthJsonImportSlice = {
  authJsonImport: AuthJsonImport;
  authJsonImportActions: {
    cancel(type: AuthJsonImportOperation): boolean;
    dispose(): void;
    operationCancel(): void;
    operationFail(input: z.infer<typeof operationFailValidator>): void;
    operationStart(): void;
    operationSucceed(): void;
    running(): boolean;
    run<T>(options: {
      execute(signal: AbortSignal): Promise<T>;
      type: AuthJsonImportOperation;
    }): Promise<T | undefined>;
  };
};

let active: { controller: AbortController; type: AuthJsonImportOperation } | undefined;
const canceled = (error: unknown): boolean => (
  error instanceof Error && error.name === "AbortError"
);
const initial: AuthJsonImport = {
  error: null,
  status: "idle",
};
const authJsonImport = {
  accountReadResultValidator,
  authJsonImportValidator,
  authJsonValidator,
  channel: {
    clipboard: "account-add:auth-json-import:clipboard",
    default: "account-add:auth-json-import:default",
    select: "account-add:auth-json-import:select",
    stateRead: "account-add:auth-json-import:state-read",
    stateUpdated: "account-add:auth-json-import:state-updated",
  },
  initial,
  input: {
    command: commandValidator,
    operationFail: operationFailValidator,
  },
  result: { import: importResultValidator },
  sourceValidator,
};

const authJsonImportStore: ImmerStateCreator<AuthJsonImportSlice> = (set, get) => ({
  authJsonImport: structuredClone(initial),
  authJsonImportActions: {
    cancel(type) {
      if (!active || active.type !== type || active.controller.signal.aborted) return false;
      active.controller.abort();
      return true;
    },
    dispose() {
      active?.controller.abort();
      active = undefined;
    },
    operationCancel() {
      set(state => {
        state.authJsonImport = structuredClone(initial);
      });
    },
    operationFail(input) {
      const value = operationFailValidator.parse(input);
      set(state => {
        state.authJsonImport = {
          error: value.error,
          status: "error",
        };
      });
    },
    operationStart() {
      set(state => {
        state.authJsonImport = {
          error: null,
          status: "working",
        };
      });
    },
    operationSucceed() {
      set(state => {
        state.authJsonImport = structuredClone(initial);
      });
    },
    running() {
      return active !== undefined;
    },
    async run<T>({ execute, type }: {
      execute(signal: AbortSignal): Promise<T>;
      type: AuthJsonImportOperation;
    }): Promise<T | undefined> {
      if (active) throw new Error("已有 auth.json 导入操作正在进行");
      const controller = new AbortController();
      active = { controller, type };
      try {
        return await execute(controller.signal);
      } catch (error) {
        if (canceled(error)) return undefined;
        throw error;
      } finally {
        if (active?.controller === controller) active = undefined;
      }
    },
  },
});

export { authJsonImport };
export default authJsonImportStore;
