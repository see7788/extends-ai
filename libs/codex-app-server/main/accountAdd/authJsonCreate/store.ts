import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { browser } from "browser-partition-main/browser/store.ts";
import { z } from "zod";

const sourceValidator = z.object({
  sourceFileName: z.literal("auth.json"),
  sourcePath: z.string().trim().min(1),
  sourceText: z.string().min(1),
});
const historyEntryValidator = z.object({
  browserId: browser.browserIdValidator,
  completedAt: z.string().min(1),
});
const authJsonCreateValidator = z.object({
  activeBrowserId: browser.browserIdValidator.nullable(),
  authorizationExpiresAt: z.string().min(1).nullable(),
  authorizationTimeoutSeconds: z.number().int().min(1).max(3_600),
  history: z.record(browser.browserIdValidator, historyEntryValidator),
  status: z.enum(["idle", "working"]),
});
const operationStartValidator = z.object({
  browserId: browser.browserIdValidator,
});
type AuthJsonCreate = z.infer<typeof authJsonCreateValidator>;
type AuthJsonCreateOptions = {
  openAuthUrl(authUrl: string): Promise<void>;
  signal: AbortSignal;
};
type AuthJsonCreateSlice = {
  authJsonCreate: AuthJsonCreate;
  authJsonCreateActions: {
    create(options: AuthJsonCreateOptions): Promise<z.infer<typeof sourceValidator>>;
    operationCancel(): void;
    operationStart(input: z.infer<typeof operationStartValidator>): void;
    operationSucceed(): void;
  };
};

const commandValidator = z.object({});
const createInputValidator = z.object({ browserId: browser.browserIdValidator });
const createResultValidator = z.object({ created: z.boolean() });
const cancelResultValidator = z.object({ canceled: z.boolean() });
const authJsonCreate = {
  authJsonCreateValidator,
  channel: {
    cancel: "account-add:auth-json-create:cancel",
    create: "account-add:auth-json-create:create",
    stateRead: "account-add:auth-json-create:state-read",
    stateUpdated: "account-add:auth-json-create:state-updated",
  },
  initial: {
    activeBrowserId: null,
    authorizationExpiresAt: null,
    authorizationTimeoutSeconds: 59,
    history: {},
    status: "idle",
  } satisfies AuthJsonCreate,
  input: {
    command: commandValidator,
    create: createInputValidator,
    operationStart: operationStartValidator,
  },
  result: {
    cancel: cancelResultValidator,
    create: createResultValidator,
  },
  sourceValidator,
};

const canceledError = (): Error => {
  const error = new Error("Codex 登录已取消");
  error.name = "AbortError";
  return error;
};

const authJsonCreateStore: ImmerStateCreator<AuthJsonCreateSlice> = set => ({
  authJsonCreate: structuredClone(authJsonCreate.initial),
  authJsonCreateActions: {
    async create(options) {
      const [electron, filesystem, path, processModule] = await Promise.all([
        import("electron"),
        import("node:fs/promises"),
        import("node:path"),
        import("../../process.ts"),
      ]);
      const { app } = electron;
      const { mkdtemp, readFile, rm } = filesystem;
      const { join } = path;
      const { connectionLoginChatGpt } = processModule;
      const loginHome = await mkdtemp(join(
        app.getPath("temp"),
        "codex-app-server-login-",
      ));
      try {
        await connectionLoginChatGpt({
          codexHome: loginHome,
          openAuthUrl: options.openAuthUrl,
          signal: options.signal,
        });
        if (options.signal.aborted) throw canceledError();
        const sourcePath = join(loginHome, "auth.json");
        return sourceValidator.parse({
          sourceFileName: "auth.json",
          sourcePath,
          sourceText: await readFile(sourcePath, "utf8"),
        });
      } finally {
        await rm(loginHome, { force: true, recursive: true }).catch(() => undefined);
      }
    },
    operationCancel() {
      set(state => {
        state.authJsonCreate.activeBrowserId = null;
        state.authJsonCreate.authorizationExpiresAt = null;
        state.authJsonCreate.status = "idle";
      });
    },
    operationStart(input) {
      const value = operationStartValidator.parse(input);
      set(state => {
        state.authJsonCreate.activeBrowserId = value.browserId;
        state.authJsonCreate.authorizationExpiresAt = new Date(
          Date.now() + state.authJsonCreate.authorizationTimeoutSeconds * 1_000,
        ).toISOString();
        state.authJsonCreate.status = "working";
      });
    },
    operationSucceed() {
      set(state => {
        const browserId = state.authJsonCreate.activeBrowserId;
        if (browserId) {
          state.authJsonCreate.history[browserId] = {
            browserId,
            completedAt: new Date().toISOString(),
          };
        }
        state.authJsonCreate.activeBrowserId = null;
        state.authJsonCreate.authorizationExpiresAt = null;
        state.authJsonCreate.status = "idle";
      });
    },
  },
});

export { authJsonCreate };
export default authJsonCreateStore;
