import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import { z } from "zod";

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
const requestValidator = z.discriminatedUnion("method", [
  z.object({ method: z.literal("stateRead") }),
  z.object({ method: z.literal("clipboard") }),
  z.object({ method: z.literal("default") }),
  z.object({ method: z.literal("select") }),
]);
const messageValidator = z.object({
  method: z.literal("stateUpdated"),
  value: authJsonImportValidator,
});

type AuthJsonImport = z.infer<typeof authJsonImportValidator>;
type AuthJsonImportSlice = {
  authJsonImport: AuthJsonImport;
  authJsonImportActions: {
    operationCancel(): void;
    operationFail(input: z.infer<typeof operationFailValidator>): void;
    operationStart(): void;
    operationSucceed(): void;
  };
};

const initial: AuthJsonImport = {
  error: null,
  status: "idle",
};
const authJsonImport = {
  accountReadResultValidator,
  authJsonImportValidator,
  authJsonValidator,
  channel: "authJsonImport",
  initial,
  input: {
    command: commandValidator,
    operationFail: operationFailValidator,
  },
  result: { import: importResultValidator },
  messageValidator,
  requestValidator,
  sourceValidator,
};

const authJsonImportStore: ImmerStateCreator<
  AuthJsonImportSlice,
  { webContents?: WebContents }
> = (set, get) => {
  const stateSend = (): void => get().webContents?.send(
    authJsonImport.channel,
    messageValidator.parse({ method: "stateUpdated", value: get().authJsonImport }),
  );
  return ({
  authJsonImport: structuredClone(initial),
  authJsonImportActions: {
    operationCancel() {
      set(state => {
        state.authJsonImport = structuredClone(initial);
      });
      stateSend();
    },
    operationFail(input) {
      const value = operationFailValidator.parse(input);
      set(state => {
        state.authJsonImport = {
          error: value.error,
          status: "error",
        };
      });
      stateSend();
    },
    operationStart() {
      set(state => {
        state.authJsonImport = {
          error: null,
          status: "working",
        };
      });
      stateSend();
    },
    operationSucceed() {
      set(state => {
        state.authJsonImport = structuredClone(initial);
      });
      stateSend();
    },
  },
  });
};

export { authJsonImport, type AuthJsonImport, type AuthJsonImportSlice };
export default authJsonImportStore;
