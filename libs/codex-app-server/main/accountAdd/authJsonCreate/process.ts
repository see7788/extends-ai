import { app } from "electron";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { connectionLoginChatGpt } from "../../process.ts";

type AuthJsonCreateOptions = {
  openAuthUrl(authUrl: string): Promise<void>;
  signal: AbortSignal;
};

const authJsonCreate = async (options: AuthJsonCreateOptions) => {
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
    const sourcePath = join(loginHome, "auth.json");
    return {
      sourceFileName: "auth.json" as const,
      sourcePath,
      sourceText: await readFile(sourcePath, "utf8"),
    };
  } finally {
    await rm(loginHome, { force: true, recursive: true }).catch(() => undefined);
  }
};

export { authJsonCreate };
