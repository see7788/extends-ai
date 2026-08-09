import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { app, clipboard, dialog, type BrowserWindow } from "electron";
import type { WebAccess } from "../../accountList/account/store.ts";
import { errorText } from "../../public.ts";
import {
  accountAuthPath,
  connectionRequest,
} from "../../process.ts";
import store from "../../store.ts";
import { authJsonImport } from "./store.ts";

const authTextMaxBytes = 2 * 1024 * 1024;

const credentialRead = (sourceText: string) => {
  const normalized = sourceText.replace(/^\uFEFF/, "");
  let json: unknown;
  try {
    json = JSON.parse(normalized);
  } catch (error) {
    throw new Error("auth.json 不是有效的 JSON", { cause: error });
  }
  const result = authJsonImport.authJsonValidator.safeParse(json);
  if (!result.success) {
    const details = result.error.issues
      .map(issue => `${issue.path.join(".") || "根对象"}：${issue.message}`)
      .join("；");
    throw new Error(`auth.json 字段校验失败：${details}`);
  }
  return { credential: result.data, normalized };
};

const prepare = async (sourceText: string) => {
  if (!sourceText.trim()) throw new Error("auth.json 内容为空");
  if (Buffer.byteLength(sourceText, "utf8") > authTextMaxBytes) {
    throw new Error("auth.json 不能超过 2 MiB");
  }
  const parsed = credentialRead(sourceText);
  const validationHome = await mkdtemp(join(
    app.getPath("temp"),
    "codex-app-server-validation-",
  ));
  try {
    await writeFile(join(validationHome, "auth.json"), parsed.normalized, {
      encoding: "utf8",
      mode: 0o600,
    });
    const accountRead = await connectionRequest({
      accountId: "account-add-validation",
      codexHome: validationHome,
      method: "account/read",
      params: { refreshToken: false },
      resultValidator: authJsonImport.accountReadResultValidator,
    });
    return { ...parsed, accountRead };
  } catch (error) {
    throw new Error(`auth.json 登录态校验失败：${errorText(error)}`, { cause: error });
  } finally {
    await rm(validationHome, { force: true, recursive: true }).catch(() => undefined);
  }
};

type PreparedAuthJson = Awaited<ReturnType<typeof prepare>>;

const commit = async (options: {
  prepared: PreparedAuthJson;
  sourceFileName: string;
  sourcePath?: string;
  webAccess?: WebAccess;
}): Promise<string> => {
  const { accountRead, credential, normalized } = options.prepared;
  const id = createHash("sha256")
    .update(credential.tokens.account_id, "utf8")
    .digest("hex")
    .slice(0, 24);
  const targetPath = accountAuthPath(app.getPath("userData"), id);
  if (options.sourcePath?.toLowerCase() === resolve(targetPath).toLowerCase()) {
    throw new Error("不能把托管副本再次作为导入源");
  }
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, normalized, { encoding: "utf8", mode: 0o600 });
  const previous = store.getState().account[id];
  store.getState().accountActions.accountSet({
    id,
    label: previous?.label
      ?? accountRead.account.email
      ?? options.sourceFileName.replace(/\.json$/i, ""),
    enabled: previous?.enabled ?? true,
    importedAt: new Date().toISOString(),
    sourceFileName: basename(options.sourceFileName),
    webAccess: options.webAccess ?? previous?.webAccess ?? null,
  });
  store.getState().accountsActions.accountAdd({ accountId: id });
  store.getState().authSessionsActions.accountDelete({ accountId: id });
  store.getState().rateLimitsActions.accountDelete({ accountId: id });
  store.getState().usageActions.accountDelete({ accountId: id });
  return id;
};

const authJsonImportIndex = {
  commit,
  prepare,
  async import(options: {
    sourceFileName: string;
    sourcePath?: string;
    sourceText: string;
    webAccess?: WebAccess;
  }): Promise<string> {
    return commit({
      ...options,
      prepared: await prepare(options.sourceText),
    });
  },
  async importClipboard(): Promise<string> {
    const sourceText = clipboard.readText();
    if (!sourceText.trim()) throw new Error("剪贴板中没有 auth.json 内容");
    return authJsonImportIndex.import({
      sourceFileName: "clipboard-auth.json",
      sourceText,
    });
  },
  async importDefault(): Promise<string> {
    const codexHome = store.getState().globalSettings.codexHome;
    if (!codexHome) throw new Error("请先配置 CODEX_HOME");
    return authJsonImportIndex.importPath(join(codexHome, "auth.json"));
  },
  async importPath(sourcePathInput: string): Promise<string> {
    const sourcePath = resolve(sourcePathInput);
    return authJsonImportIndex.import({
      sourceFileName: basename(sourcePath),
      sourcePath,
      sourceText: await readFile(sourcePath, "utf8"),
    });
  },
  async selectPath(parent: BrowserWindow): Promise<string | null> {
    const codexHome = store.getState().globalSettings.codexHome;
    const result = await dialog.showOpenDialog(parent, {
      title: "选择 auth.json",
      buttonLabel: "导入",
      defaultPath: codexHome ? join(codexHome, "auth.json") : undefined,
      filters: [{ name: "auth.json", extensions: ["json"] }],
      properties: ["openFile"],
    });
    const sourcePath = result.filePaths[0];
    if (result.canceled || !sourcePath) return null;
    return sourcePath;
  },
};

export default authJsonImportIndex;
