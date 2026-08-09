import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { browser } from "browser-partition-main/browser/store.ts";
import { z } from "zod";

const sourceValidator = z.object({
  sourceFileName: z.literal("auth.json"),
  sourcePath: z.string().trim().min(1),
  sourceText: z.string().min(1),
});
type AuthJsonCreateOptions = {
  openAuthUrl(authUrl: string): Promise<void>;
  signal: AbortSignal;
};
type AuthJsonCreateSlice = {
  authJsonCreateActions: {
    create(options: AuthJsonCreateOptions): Promise<z.infer<typeof sourceValidator>>;
  };
};

const commandValidator = z.object({});
const createInputValidator = z.discriminatedUnion("type", [
  z.object({ type: z.literal("electron") }),
  z.object({
    browserId: browser.browserIdValidator,
    type: z.literal("browser"),
  }),
]);
const createResultValidator = z.object({ created: z.boolean() });
const cancelResultValidator = z.object({ canceled: z.boolean() });
const authJsonCreate = {
  channel: {
    cancel: "account-add:auth-json-create:cancel",
    create: "account-add:auth-json-create:create",
  },
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
  const error = new Error("ChatGPT 登录已取消");
  error.name = "AbortError";
  return error;
};

const authJsonCreateStore: ImmerStateCreator<AuthJsonCreateSlice> = (set, get) => ({
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
  },
});

export { authJsonCreate };
export default authJsonCreateStore;
