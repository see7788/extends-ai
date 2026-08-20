import type { BrowserSlice } from "browser-partition-main/browser/store.ts";
import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import type { WebContents } from "electron";
import { z } from "zod";
import type { AccountSlice, WebAccess } from "../accountList/account/store.ts";
import type { AccountsSlice } from "../accountList/accounts/store.ts";
import type { AuthSessionsSlice } from "../accountList/authSessions/store.ts";
import type { ConnectionSlice } from "../accountList/connection/store.ts";
import type { RateLimitsSlice } from "../accountList/rateLimits/store.ts";
import type { UsageSlice } from "../accountList/usage/store.ts";
import type { GlobalSettingsSlice } from "../globalSettings/store.ts";
import {
  authJsonCreate,
  type AuthJsonCreateSlice,
} from "./authJsonCreate/store.ts";
import {
  authJsonImport,
  type AuthJsonImportSlice,
} from "./authJsonImport/store.ts";

type nodeState_t = {
  app_getPath_temp_nodestate: string;
  app_getPath_userData_nodestate: string;
  browserWindow_fromWebContents_nodestate: typeof import("electron").BrowserWindow.fromWebContents;
  clipboard_readText_nodestate: import("electron").Clipboard["readText"];
  crypto_createHash_nodestate: typeof import("node:crypto").createHash;
  dialog_showOpenDialog_nodestate: typeof import("electron").dialog.showOpenDialog;
  fileSystem_mkdir_nodestate: typeof import("node:fs/promises").mkdir;
  fileSystem_mkdtemp_nodestate: typeof import("node:fs/promises").mkdtemp;
  fileSystem_readFile_nodestate: typeof import("node:fs/promises").readFile;
  fileSystem_rm_nodestate: typeof import("node:fs/promises").rm;
  fileSystem_writeFile_nodestate: typeof import("node:fs/promises").writeFile;
  path_basename_nodestate: typeof import("node:path").basename;
  path_dirname_nodestate: typeof import("node:path").dirname;
  path_join_nodestate: typeof import("node:path").join;
  path_resolve_nodestate: typeof import("node:path").resolve;
  webContents_nodestate?: WebContents;
};
type ProducerSlices = AccountSlice
  & AccountsSlice
  & AuthJsonCreateSlice
  & AuthJsonImportSlice
  & AuthSessionsSlice
  & BrowserSlice
  & ConnectionSlice
  & GlobalSettingsSlice
  & RateLimitsSlice
  & UsageSlice;
type AuthJsonSource = {
  sourceFileName: string;
  sourcePath?: string;
  sourceText: string;
  webAccess?: WebAccess;
};
const request = {
  authJsonCreate: z.object({
    input: authJsonCreate.input.create,
    method: z.literal("authJsonCreate"),
  }),
  authJsonCreateCancel: z.object({ method: z.literal("authJsonCreateCancel") }),
  authJsonImportClipboard: z.object({ method: z.literal("authJsonImportClipboard") }),
  authJsonImportDefault: z.object({ method: z.literal("authJsonImportDefault") }),
  authJsonImportSelect: z.object({ method: z.literal("authJsonImportSelect") }),
};
const requestValidator = z.discriminatedUnion("method", [
  request.authJsonCreate,
  request.authJsonCreateCancel,
  request.authJsonImportClipboard,
  request.authJsonImportDefault,
  request.authJsonImportSelect,
]);
const result = {
  cancel: z.object({ canceled: z.boolean() }),
  create: z.object({ created: z.boolean() }),
  import: z.object({ imported: z.boolean() }),
};
type AccountAddSlice = {
  accountAddActions: {
    authJsonCreate(input: unknown): Promise<void>;
    authJsonCreateCancel(): boolean;
    authJsonImport(input: AuthJsonSource): Promise<string>;
    authJsonImportRequest(input: unknown): Promise<boolean>;
    clipboardImport(): Promise<boolean>;
    communicationStart(): () => void;
    defaultImport(): Promise<boolean>;
    dispose(): void;
    pathImport(sourcePath: string): Promise<string>;
    selectImport(): Promise<boolean>;
  };
};

const accountAdd = {
  channel: "accountAdd",
  request,
  requestValidator,
  result,
} as const;

const accountAddStore: ImmerStateCreator<
  AccountAddSlice,
  ProducerSlices & nodeState_t
> = (_set, get) => {
  const authTextMaxBytes = 2 * 1024 * 1024;
  const errorText = (error: unknown): string => error instanceof Error
    ? error.message
    : String(error);
  const accountAuthPath = (accountId: string): string => get().path_join_nodestate(
    get().app_getPath_userData_nodestate,
    "codex-account-auth",
    accountId,
    "auth.json",
  );
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
  const preparedRead = async (sourceText: string) => {
    if (!sourceText.trim()) throw new Error("auth.json 内容为空");
    if (Buffer.byteLength(sourceText, "utf8") > authTextMaxBytes) {
      throw new Error("auth.json 不能超过 2 MiB");
    }
    const parsed = credentialRead(sourceText);
    const validationHome = await get().fileSystem_mkdtemp_nodestate(get().path_join_nodestate(
      get().app_getPath_temp_nodestate,
      "codex-app-server-validation-",
    ));
    const validationAuth = get().path_join_nodestate(validationHome, "auth.json");
    try {
      await get().fileSystem_writeFile_nodestate(validationAuth, parsed.normalized, {
        encoding: "utf8",
        mode: 0o600,
      });
      const accountRead = await get().connectionActions.request({
        accountId: "account-add-validation",
        authFile: validationAuth,
        method: "account/read",
        params: { refreshToken: false },
        resultValidator: authJsonImport.accountReadResultValidator,
      });
      return { ...parsed, accountRead };
    } catch (error) {
      throw new Error(`auth.json 登录态校验失败：${errorText(error)}`, { cause: error });
    } finally {
      await get().fileSystem_rm_nodestate(validationHome, { force: true, recursive: true })
        .catch(() => undefined);
    }
  };

  return {
    accountAddActions: {
      async authJsonCreate(input) {
        const carrier = authJsonCreate.input.create.parse(input);
        const application = await get().browserActions.applicationRead({
          browserId: carrier.browserId,
        });
        let opened: Awaited<ReturnType<BrowserSlice["browserActions"]["windowOpen"]>>
          | undefined;
        let operation: Awaited<ReturnType<
          AuthJsonCreateSlice["authJsonCreateActions"]["create"]
        >> | undefined;
        try {
          operation = await get().authJsonCreateActions.create(carrier);
          const sourceResult = operation.source.then(
            source => ({ source }),
            error => ({ error }),
          );
          opened = await get().browserActions.windowOpen(
            application.executablePath,
            operation.authUrl,
            application.launchArguments,
          );
          void opened.closed.then(
            () => get().authJsonCreateActions.cancel(),
            () => get().authJsonCreateActions.cancel(),
          );
          const result = await sourceResult;
          if ("error" in result) throw result.error;
          await get().accountAddActions.authJsonImport(result.source);
        } catch (error) {
          get().authJsonCreateActions.cancel();
          await operation?.source.catch(() => undefined);
          throw error;
        } finally {
          await opened?.close().catch(() => false);
        }
      },
      authJsonCreateCancel() {
        return get().authJsonCreateActions.cancel();
      },
      async authJsonImport(input) {
        const source = authJsonImport.sourceValidator.parse({
          sourceFileName: input.sourceFileName,
          sourcePath: input.sourcePath ?? input.sourceFileName,
          sourceText: input.sourceText,
        });
        const prepared = await preparedRead(source.sourceText);
        const id = get().crypto_createHash_nodestate("sha256")
          .update(prepared.credential.tokens.account_id, "utf8")
          .digest("hex")
          .slice(0, 24);
        const targetPath = accountAuthPath(id);
        if (
          input.sourcePath
          && get().path_resolve_nodestate(input.sourcePath).toLowerCase()
            === get().path_resolve_nodestate(targetPath).toLowerCase()
        ) {
          throw new Error("不能把托管副本再次作为导入源");
        }
        await get().fileSystem_mkdir_nodestate(get().path_dirname_nodestate(targetPath), { recursive: true });
        await get().fileSystem_writeFile_nodestate(targetPath, prepared.normalized, {
          encoding: "utf8",
          mode: 0o600,
        });
        const previous = get().account[id];
        get().accountActions.accountSet({
          enabled: previous?.enabled ?? false,
          id,
          importedAt: new Date().toISOString(),
          label: previous?.label
            ?? prepared.accountRead.account.email
            ?? input.sourceFileName.replace(/\.json$/i, ""),
          sourceFileName: get().path_basename_nodestate(input.sourceFileName),
          webAccess: input.webAccess ?? previous?.webAccess ?? null,
        });
        get().accountsActions.accountAdd({ accountId: id });
        get().authSessionsActions.accountDelete({ accountId: id });
        get().rateLimitsActions.accountDelete({ accountId: id });
        get().usageActions.accountDelete({ accountId: id });
        return id;
      },
      async authJsonImportRequest(input) {
        const requestValue = requestValidator.parse(input);
        if (!requestValue.method.startsWith("authJsonImport")) {
          throw new Error("auth.json 导入方法无效");
        }
        const actions = get().authJsonImportActions;
        actions.operationStart();
        try {
          const imported = requestValue.method === "authJsonImportClipboard"
            ? await get().accountAddActions.clipboardImport()
            : requestValue.method === "authJsonImportDefault"
              ? await get().accountAddActions.defaultImport()
              : await get().accountAddActions.selectImport();
          actions.operationSucceed();
          return imported;
        } catch (error) {
          actions.operationFail({ error: error instanceof Error ? error.message : String(error) });
          throw error;
        }
      },
      async clipboardImport() {
        const sourceText = get().clipboard_readText_nodestate();
        if (!sourceText.trim()) throw new Error("剪贴板中没有 auth.json 内容");
        await get().accountAddActions.authJsonImport({
          sourceFileName: "clipboard-auth.json",
          sourceText,
        });
        return true;
      },
      async defaultImport() {
        const codexHome = get().globalSettings.codexHome;
        if (!codexHome) throw new Error("请先配置 CODEX_HOME");
        await get().accountAddActions.pathImport(get().path_join_nodestate(codexHome, "auth.json"));
        return true;
      },
      communicationStart() {
        const contents = get().webContents_nodestate;
        if (!contents || contents.isDestroyed()) {
          throw new Error("CodexAppServer WebContents 不可用");
        }
        contents.ipc.handle(accountAdd.channel, async (_event, input: unknown) => {
          const requestValue = accountAdd.requestValidator.parse(input);
          switch (requestValue.method) {
          case "authJsonCreate":
            await get().accountAddActions.authJsonCreate(requestValue.input);
            return accountAdd.result.create.parse({ created: true });
          case "authJsonCreateCancel":
            return accountAdd.result.cancel.parse({
              canceled: get().accountAddActions.authJsonCreateCancel(),
            });
          case "authJsonImportClipboard":
          case "authJsonImportDefault":
          case "authJsonImportSelect":
            return accountAdd.result.import.parse({
              imported: await get().accountAddActions.authJsonImportRequest(requestValue),
            });
          }
        });
        return () => contents.ipc.removeHandler(accountAdd.channel);
      },
      dispose() {
        get().authJsonCreateActions.dispose();
      },
      async pathImport(sourcePathInput) {
        const sourcePath = get().path_resolve_nodestate(sourcePathInput);
        return get().accountAddActions.authJsonImport({
          sourceFileName: get().path_basename_nodestate(sourcePath),
          sourcePath,
          sourceText: await get().fileSystem_readFile_nodestate(sourcePath, "utf8"),
        });
      },
      async selectImport() {
        const contents = get().webContents_nodestate;
        if (!contents || contents.isDestroyed()) {
          throw new Error("CodexAppServer WebContents 不可用");
        }
        const parent = get().browserWindow_fromWebContents_nodestate(contents);
        if (!parent) throw new Error("无法取得账号管理窗口");
        const codexHome = get().globalSettings.codexHome;
        const result = await get().dialog_showOpenDialog_nodestate(parent, {
          buttonLabel: "导入",
          defaultPath: codexHome ? get().path_join_nodestate(codexHome, "auth.json") : undefined,
          filters: [{ name: "auth.json", extensions: ["json"] }],
          properties: ["openFile"],
          title: "选择 auth.json",
        });
        const sourcePath = result.filePaths[0];
        if (result.canceled || !sourcePath) return false;
        await get().accountAddActions.pathImport(sourcePath);
        return true;
      },
    },
  };
};

export { accountAdd, type AccountAddSlice, type nodeState_t };
export default accountAddStore;
