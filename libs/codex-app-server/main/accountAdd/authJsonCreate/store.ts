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
type AuthJsonCreate = z.infer<typeof authJsonCreateValidator>;
type AuthJsonCreateOptions = {
  browserId: z.infer<typeof browser.browserIdValidator>;
  openAuthUrl(authUrl: string, signal: AbortSignal): Promise<void>;
};
type AuthJsonCreateSlice = {
  authJsonCreate: AuthJsonCreate;
  authJsonCreateActions: {
    cancel(): boolean;
    create(options: AuthJsonCreateOptions): Promise<z.infer<typeof sourceValidator>>;
    dispose(): void;
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

let active: AbortController | undefined;

const authJsonCreateStore: ImmerStateCreator<AuthJsonCreateSlice> = (set, get) => ({
  authJsonCreate: structuredClone(authJsonCreate.initial),
  authJsonCreateActions: {
    cancel() {
      if (!active || active.signal.aborted) return false;
      active.abort();
      return true;
    },
    async create(options) {
      if (active) throw new Error("已有 auth.json 创建操作正在进行");
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
      const controller = new AbortController();
      active = controller;
      set(state => {
        state.authJsonCreate.activeBrowserId = options.browserId;
        state.authJsonCreate.authorizationExpiresAt = new Date(
          Date.now() + state.authJsonCreate.authorizationTimeoutSeconds * 1_000,
        ).toISOString();
        state.authJsonCreate.status = "working";
      });
      const timeout = setTimeout(
        () => controller.abort(),
        get().authJsonCreate.authorizationTimeoutSeconds * 1_000,
      );
      try {
        await connectionLoginChatGpt({
          codexHome: loginHome,
          openAuthUrl: authUrl => options.openAuthUrl(authUrl, controller.signal),
          signal: controller.signal,
        });
        if (controller.signal.aborted) throw canceledError();
        const sourcePath = join(loginHome, "auth.json");
        const source = sourceValidator.parse({
          sourceFileName: "auth.json",
          sourcePath,
          sourceText: await readFile(sourcePath, "utf8"),
        });
        set(state => {
          state.authJsonCreate.history[options.browserId] = {
            browserId: options.browserId,
            completedAt: new Date().toISOString(),
          };
        });
        return source;
      } finally {
        clearTimeout(timeout);
        if (active === controller) active = undefined;
        set(state => {
          state.authJsonCreate.activeBrowserId = null;
          state.authJsonCreate.authorizationExpiresAt = null;
          state.authJsonCreate.status = "idle";
        });
        await rm(loginHome, { force: true, recursive: true }).catch(() => undefined);
      }
    },
    dispose() {
      active?.abort();
      active = undefined;
    },
  },
});

export { authJsonCreate };
export default authJsonCreateStore;
