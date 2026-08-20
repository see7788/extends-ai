import type BrowserPartitionWindow from "browser-partition-main/BrowserWindow.ts";
import { browser } from "browser-partition-main/browser/store.ts";
import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import type {
  BrowserWindow as ElectronBrowserWindow,
  session as electronSession,
} from "electron";
import { z } from "zod";

const accountStatusValidator = z.enum(["valid", "expired", "unknown"]);
const accountSourceValidator = z.object({
  browserId: browser.browserIdValidator,
  browserName: z.string().trim().min(1).max(120),
  importedAt: z.string().datetime({ offset: true }),
});
const accountValidator = z.object({
  checkedAt: z.string().datetime({ offset: true }),
  email: z.string().email(),
  error: z.string().nullable(),
  partition: z.string().trim().min(1),
  sources: z.array(accountSourceValidator),
  status: accountStatusValidator,
});
const accountsValidator = z.object({
  byEmail: z.record(z.string().email(), accountValidator),
  order: z.array(z.string().email()),
});
const accountSetValidator = accountValidator;
const accountStatusSetValidator = accountValidator.pick({
  checkedAt: true,
  email: true,
  error: true,
  status: true,
});
const emailValidator = accountValidator.pick({ email: true });
const candidateValidator = z.object({
  partition: z.string().trim().min(1),
  source: accountSourceValidator.omit({ importedAt: true }).optional(),
});
const accountSessionValidator = z.object({
  user: z.object({ email: z.string().email() }).passthrough().nullable().optional(),
}).passthrough();
const commandValidator = z.object({});
const request = {
  open: z.object({ input: emailValidator, method: z.literal("open") }),
  stateRead: z.object({ method: z.literal("stateRead") }),
  validate: z.object({ input: emailValidator, method: z.literal("validate") }),
};
const requestValidator = z.discriminatedUnion("method", [
  request.open,
  request.stateRead,
  request.validate,
]);
const result = {
  account: z.object({ account: accountValidator.nullable() }),
  command: z.object({ completed: z.boolean() }),
};

type Accounts = z.infer<typeof accountsValidator>;
type Account = z.infer<typeof accountValidator>;
type AccountResult = z.infer<typeof result.account>["account"];
type Candidate = z.infer<typeof candidateValidator>;
type EmailInput = z.infer<typeof emailValidator>;
type Verification = {
  checkedAt: string;
  email: string | null;
  error: string | null;
  status: "valid" | "expired" | "unknown";
};
type AccountsContract = {
  accountSessionValidator: typeof accountSessionValidator;
  accountStatusValidator: typeof accountStatusValidator;
  accountValidator: typeof accountValidator;
  accountsValidator: typeof accountsValidator;
  channel: "accounts";
  initial: Accounts;
  input: {
    candidate: typeof candidateValidator;
    command: typeof commandValidator;
    email: typeof emailValidator;
  };
  request: typeof request;
  requestValidator: typeof requestValidator;
  result: typeof result;
};
type nodeState_t = {
  browserPartitionWindow_open_nodestate: typeof BrowserPartitionWindow.open;
  browserPartitionWindow_storageClear_nodestate: typeof BrowserPartitionWindow.storageClear;
  loginWindow_nodestate?: ElectronBrowserWindow;
  session_fromPartition_nodestate: typeof electronSession.fromPartition;
};
type AccountsSlice = {
  accounts: Accounts;
  accountsActions: {
    accountRemove(input: z.infer<typeof emailValidator>): string | undefined;
    accountSet(input: z.infer<typeof accountSetValidator>): string | undefined;
    accountStatusSet(input: z.infer<typeof accountStatusSetValidator>): void;
    candidateConsume(
      input: unknown,
      signal?: AbortSignal,
    ): Promise<Account>;
    communicationStart(): () => void;
    dispose(): void;
    loginIdentify(partition: string): Promise<boolean>;
    open(input: unknown): Promise<boolean>;
    remove(input: unknown): Promise<boolean>;
    validate(input: unknown): Promise<boolean>;
  };
  accountsPrivateActions: {
    accountWindowDispose(): void;
    accountWindowOpen(input: { email: string; partition: string }): Promise<void>;
    canceled(error: unknown): boolean;
    errorText(error: unknown): string;
    partitionClear(partition: string): Promise<void>;
    stateSend(): void;
    verificationRead(partition: string, signal?: AbortSignal): Promise<Verification>;
  };
};

const initial = { byEmail: {}, order: [] } satisfies Accounts;
const accounts = {
  accountSessionValidator,
  accountStatusValidator,
  accountValidator,
  accountsValidator,
  channel: "accounts",
  initial,
  input: {
    candidate: candidateValidator,
    command: commandValidator,
    email: emailValidator,
  },
  request,
  requestValidator,
  result,
} satisfies AccountsContract;

const accountsStore: ImmerStateCreator<AccountsSlice, nodeState_t> = (set, get) => {
  let accountWindow: Awaited<ReturnType<typeof BrowserPartitionWindow.open>> | undefined;

  return {
    accounts: structuredClone(initial),
    accountsActions: {
      accountRemove(input) {
        const { email } = emailValidator.parse(input);
        let partition: string | undefined;
        set(state => {
          partition = state.accounts.byEmail[email]?.partition;
          delete state.accounts.byEmail[email];
          state.accounts.order = state.accounts.order.filter(value => value !== email);
        });
        get().accountsPrivateActions.stateSend();
        return partition;
      },
      accountSet(input) {
        const value = accountSetValidator.parse(input);
        let previousPartition: string | undefined;
        set(state => {
          previousPartition = state.accounts.byEmail[value.email]?.partition;
          state.accounts.byEmail[value.email] = value;
          if (!state.accounts.order.includes(value.email)) state.accounts.order.push(value.email);
        });
        get().accountsPrivateActions.stateSend();
        return previousPartition;
      },
      accountStatusSet(input) {
        const value = accountStatusSetValidator.parse(input);
        set(state => {
          const account = state.accounts.byEmail[value.email];
          if (!account) return;
          account.checkedAt = value.checkedAt;
          account.error = value.error;
          account.status = value.status;
        });
        get().accountsPrivateActions.stateSend();
      },
      async candidateConsume(input, signal) {
        const candidate: Candidate = candidateValidator.parse(input);
        const verification = await get().accountsPrivateActions.verificationRead(
          candidate.partition,
          signal,
        );
        if (verification.status !== "valid" || !verification.email) {
          throw new Error(verification.error ?? "未检测到有效的 ChatGPT 登录态");
        }
        const previous = get().accounts.byEmail[verification.email];
        const sources = candidate.source
          ? [
              ...(previous?.sources.filter(
                source => source.browserId !== candidate.source?.browserId,
              ) ?? []),
              { ...candidate.source, importedAt: new Date().toISOString() },
            ]
          : previous?.sources ?? [];
        const value = accountValidator.parse({
          checkedAt: verification.checkedAt,
          email: verification.email,
          error: null,
          partition: candidate.partition,
          sources,
          status: "valid",
        });
        const previousPartition = get().accountsActions.accountSet(value);
        if (previousPartition && previousPartition !== value.partition) {
          await get().accountsPrivateActions.partitionClear(previousPartition).catch(() => undefined);
        }
        return value;
      },
      communicationStart() {
        const contents = get().loginWindow_nodestate?.webContents;
        if (!contents || contents.isDestroyed()) throw new Error("Login WebContents 不可用");
        contents.ipc.handle(accounts.channel, async (_event, input: unknown) => {
          const requestValue = accounts.requestValidator.parse(input);
          switch (requestValue.method) {
          case "open":
            return accounts.result.command.parse({
              completed: await get().accountsActions.open(requestValue.input),
            });
          case "stateRead":
            return accounts.accountsValidator.parse(get().accounts);
          case "validate":
            return accounts.result.command.parse({
              completed: await get().accountsActions.validate(requestValue.input),
            });
          }
        });
        return () => contents.ipc.removeHandler(accounts.channel);
      },
      dispose() {
        get().accountsPrivateActions.accountWindowDispose();
      },
      async loginIdentify(partition) {
        const candidate = candidateValidator.parse({ partition });
        const verification = await get().accountsPrivateActions.verificationRead(
          candidate.partition,
        );
        if (verification.status !== "valid" || !verification.email) return false;
        const previous = get().accounts.byEmail[verification.email];
        const value = accountValidator.parse({
          checkedAt: verification.checkedAt,
          email: verification.email,
          error: null,
          partition: candidate.partition,
          sources: previous?.sources ?? [],
          status: "valid",
        });
        const previousPartition = get().accountsActions.accountSet(value);
        if (previousPartition && previousPartition !== value.partition) {
          await get().accountsPrivateActions.partitionClear(previousPartition).catch(() => undefined);
        }
        return true;
      },
      async open(input) {
        const { email } = emailValidator.parse(input);
        const value = get().accounts.byEmail[email];
        if (!value) throw new Error("账号不存在");
        await get().accountsPrivateActions.accountWindowOpen({
          email,
          partition: value.partition,
        });
        return true;
      },
      async remove(input) {
        const value = emailValidator.parse(input);
        const partition = get().accountsActions.accountRemove(value);
        if (!partition) return false;
        get().accountsPrivateActions.accountWindowDispose();
        await get().accountsPrivateActions.partitionClear(partition).catch(() => undefined);
        return true;
      },
      async validate(input) {
        const { email } = emailValidator.parse(input);
        const value = get().accounts.byEmail[email];
        if (!value) throw new Error("账号不存在");
        const verification = await get().accountsPrivateActions.verificationRead(value.partition);
        const identityChanged = verification.email !== null && verification.email !== email;
        get().accountsActions.accountStatusSet({
          checkedAt: verification.checkedAt,
          email,
          error: identityChanged ? "隔离分区中的账号身份已经变化" : verification.error,
          status: identityChanged ? "unknown" : verification.status,
        });
        return true;
      },
    },
    accountsPrivateActions: {
      accountWindowDispose() {
        accountWindow?.dispose();
        accountWindow = undefined;
      },
      async accountWindowOpen(input) {
        const parent = get().loginWindow_nodestate;
        if (!parent || parent.isDestroyed()) throw new Error("Login 父窗口不可用");
        get().accountsPrivateActions.accountWindowDispose();
        accountWindow = await get().browserPartitionWindow_open_nodestate({
          height: 760,
          minHeight: 520,
          minWidth: 760,
          onClose: () => {
            accountWindow = undefined;
          },
          parent,
          partition: input.partition,
          title: input.email,
          url: "https://chatgpt.com/",
          width: 920,
        });
      },
      canceled(error) {
        return error instanceof Error && error.name === "AbortError";
      },
      errorText(error) {
        return error instanceof Error ? error.message : String(error);
      },
      async partitionClear(partition) {
        await get().browserPartitionWindow_storageClear_nodestate(partition);
      },
      stateSend() {
        const contents = get().loginWindow_nodestate?.webContents;
        if (!contents || contents.isDestroyed()) return;
        contents.send(accounts.channel, accountsValidator.parse(get().accounts));
      },
      async verificationRead(partition, signal) {
        const checkedAt = new Date().toISOString();
        try {
          const response = await get().session_fromPartition_nodestate(partition).fetch(
            "https://chatgpt.com/api/auth/session",
            {
              credentials: "include",
              ...(signal ? { signal } : {}),
            },
          );
          if (response.status === 401) {
            return { checkedAt, email: null, error: null, status: "expired" };
          }
          if (!response.ok) {
            return {
              checkedAt,
              email: null,
              error: `ChatGPT 登录态检查失败：${response.status}`,
              status: "unknown",
            };
          }
          let parsed: z.infer<typeof accountSessionValidator>;
          try {
            parsed = accountSessionValidator.parse(await response.json() as unknown);
          } catch {
            return {
              checkedAt,
              email: null,
              error: "ChatGPT 登录态响应中没有可识别的账号",
              status: "unknown",
            };
          }
          if (!parsed.user) {
            return { checkedAt, email: null, error: null, status: "expired" };
          }
          return {
            checkedAt,
            email: parsed.user.email,
            error: null,
            status: "valid",
          };
        } catch (error) {
          if (get().accountsPrivateActions.canceled(error)) throw error;
          return {
            checkedAt,
            email: null,
            error: get().accountsPrivateActions.errorText(error),
            status: "unknown",
          };
        }
      },
    },
  };
};

export {
  accounts,
  type Account,
  type AccountResult,
  type AccountsSlice,
  type Accounts,
  type EmailInput,
  type nodeState_t,
};
export default accountsStore;
