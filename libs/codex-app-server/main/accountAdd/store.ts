import type { BrowserSlice } from "browser-partition-main/browser/store.ts";
import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
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
  appTemp: string;
  appUserData: string;
  crypto: Pick<typeof import("node:crypto"), "createHash">;
  electron: {
    BrowserWindow: Pick<typeof import("electron").BrowserWindow, "fromWebContents">;
    clipboard: Pick<import("electron").Clipboard, "readText">;
    dialog: Pick<typeof import("electron").dialog, "showOpenDialog">;
  };
  fileSystem: Pick<
    typeof import("node:fs/promises"),
    "mkdir" | "mkdtemp" | "readFile" | "rm" | "writeFile"
  >;
  path: Pick<typeof import("node:path"), "basename" | "dirname" | "join" | "resolve">;
  webContents?: WebContents;
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
type AccountAddSlice = {
  accountAddActions: {
    authJsonCreate(input: unknown): Promise<void>;
    authJsonCreateCancel(): boolean;
    authJsonImport(input: AuthJsonSource): Promise<string>;
    clipboardImport(): Promise<boolean>;
    defaultImport(): Promise<boolean>;
    dispose(): void;
    pathImport(sourcePath: string): Promise<string>;
    selectImport(): Promise<boolean>;
  };
};

const accountAddStore: ImmerStateCreator<
  AccountAddSlice,
  ProducerSlices & nodeState_t
> = (_set, get) => {
  const authTextMaxBytes = 2 * 1024 * 1024;
  const errorText = (error: unknown): string => error instanceof Error
    ? error.message
    : String(error);
  const accountAuthPath = (accountId: string): string => get().path.join(
    get().appUserData,
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
    const validationHome = await get().fileSystem.mkdtemp(get().path.join(
      get().appTemp,
      "codex-app-server-validation-",
    ));
    const validationAuth = get().path.join(validationHome, "auth.json");
    try {
      await get().fileSystem.writeFile(validationAuth, parsed.normalized, {
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
      await get().fileSystem.rm(validationHome, { force: true, recursive: true })
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
        const id = get().crypto.createHash("sha256")
          .update(prepared.credential.tokens.account_id, "utf8")
          .digest("hex")
          .slice(0, 24);
        const targetPath = accountAuthPath(id);
        if (
          input.sourcePath
          && get().path.resolve(input.sourcePath).toLowerCase()
            === get().path.resolve(targetPath).toLowerCase()
        ) {
          throw new Error("不能把托管副本再次作为导入源");
        }
        await get().fileSystem.mkdir(get().path.dirname(targetPath), { recursive: true });
        await get().fileSystem.writeFile(targetPath, prepared.normalized, {
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
          sourceFileName: get().path.basename(input.sourceFileName),
          webAccess: input.webAccess ?? previous?.webAccess ?? null,
        });
        get().accountsActions.accountAdd({ accountId: id });
        get().authSessionsActions.accountDelete({ accountId: id });
        get().rateLimitsActions.accountDelete({ accountId: id });
        get().usageActions.accountDelete({ accountId: id });
        return id;
      },
      async clipboardImport() {
        const sourceText = get().electron.clipboard.readText();
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
        await get().accountAddActions.pathImport(get().path.join(codexHome, "auth.json"));
        return true;
      },
      dispose() {
        get().authJsonCreateActions.dispose();
      },
      async pathImport(sourcePathInput) {
        const sourcePath = get().path.resolve(sourcePathInput);
        return get().accountAddActions.authJsonImport({
          sourceFileName: get().path.basename(sourcePath),
          sourcePath,
          sourceText: await get().fileSystem.readFile(sourcePath, "utf8"),
        });
      },
      async selectImport() {
        const contents = get().webContents;
        if (!contents || contents.isDestroyed()) {
          throw new Error("CodexAppServer WebContents 不可用");
        }
        const parent = get().electron.BrowserWindow.fromWebContents(contents);
        if (!parent) throw new Error("无法取得账号管理窗口");
        const codexHome = get().globalSettings.codexHome;
        const result = await get().electron.dialog.showOpenDialog(parent, {
          buttonLabel: "导入",
          defaultPath: codexHome ? get().path.join(codexHome, "auth.json") : undefined,
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

export type { AccountAddSlice, nodeState_t };
export default accountAddStore;
