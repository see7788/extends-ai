import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { BrowserWindow as ElectronBrowserWindow, session } from "electron";
import BrowserPartitionWindow from "browser-partition-main/BrowserWindow/index.ts";
import { z } from "zod";
import { browser } from "browser-partition-main/browser/store.ts";

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
const commandValidator = z.object({});
const candidateValidator = z.object({
  partition: z.string().trim().min(1),
  source: accountSourceValidator.omit({ importedAt: true }).optional(),
});
const accountSessionValidator = z.object({
  user: z.object({ email: z.string().email() }).passthrough().nullable().optional(),
}).passthrough();
const commandResultValidator = z.object({ completed: z.boolean() });
const accountResultValidator = z.object({
  account: accountValidator.nullable(),
});

type Accounts = z.infer<typeof accountsValidator>;
type Verification = {
  checkedAt: string;
  email: string | null;
  error: string | null;
  status: "valid" | "expired" | "unknown";
};
type Candidate = z.infer<typeof candidateValidator>;
type AccountWindow = { dispose(): void };
type AccountsSlice = {
  accounts: Accounts;
  accountsActions: {
    accountRemove(input: z.infer<typeof emailValidator>): string | undefined;
    accountSet(input: z.infer<typeof accountSetValidator>): string | undefined;
    accountStatusSet(input: z.infer<typeof accountStatusSetValidator>): void;
    candidateConsume(
      input: unknown,
      signal?: AbortSignal,
    ): Promise<z.infer<typeof accountValidator>>;
    dispose(): void;
    loginIdentify(partition: string): Promise<boolean>;
    open(input: unknown, parent: ElectronBrowserWindow): Promise<boolean>;
    remove(input: unknown): Promise<boolean>;
    validate(input: unknown): Promise<boolean>;
  };
};

const initial: Accounts = { byEmail: {}, order: [] };
const accounts = {
  accountSessionValidator,
  accountStatusValidator,
  accountValidator,
  accountsValidator,
  channel: {
    cookieImportConsume: "login:accounts:cookie-import-consume",
    open: "login:accounts:open",
    remove: "login:accounts:remove",
    stateRead: "login:accounts:state-read",
    stateUpdated: "login:accounts:state-updated",
    validate: "login:accounts:validate",
  },
  initial,
  input: {
    candidate: candidateValidator,
    command: commandValidator,
    email: emailValidator,
  },
  result: {
    account: accountResultValidator,
    command: commandResultValidator,
  },
};

const errorText = (error: unknown): string => error instanceof Error
  ? error.message
  : String(error);
const canceled = (error: unknown): boolean => (
  error instanceof Error && error.name === "AbortError"
);
const verificationRead = async (
  partition: string,
  signal?: AbortSignal,
): Promise<Verification> => {
  const checkedAt = new Date().toISOString();
  try {
    const response = await session.fromPartition(partition).fetch(
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
    const parsed = accountSessionValidator.safeParse(await response.json() as unknown);
    if (!parsed.success) {
      return {
        checkedAt,
        email: null,
        error: "ChatGPT 登录态响应中没有可识别的账号",
        status: "unknown",
      };
    }
    if (!parsed.data.user) {
      return { checkedAt, email: null, error: null, status: "expired" };
    }
    return {
      checkedAt,
      email: parsed.data.user.email,
      error: null,
      status: "valid",
    };
  } catch (error) {
    if (canceled(error)) throw error;
    return {
      checkedAt,
      email: null,
      error: errorText(error),
      status: "unknown",
    };
  }
};

let accountWindow: AccountWindow | undefined;
const accountsStore: ImmerStateCreator<AccountsSlice> = (set, get) => ({
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
    },
    async candidateConsume(input, signal) {
      const candidate: Candidate = candidateValidator.parse(input);
      const verification = await verificationRead(candidate.partition, signal);
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
      const account = accountValidator.parse({
        checkedAt: verification.checkedAt,
        email: verification.email,
        error: null,
        partition: candidate.partition,
        sources,
        status: "valid",
      });
      const previousPartition = get().accountsActions.accountSet(account);
      if (previousPartition && previousPartition !== account.partition) {
        await BrowserPartitionWindow.storageClear(previousPartition).catch(() => undefined);
      }
      return account;
    },
    dispose() {
      accountWindow?.dispose();
      accountWindow = undefined;
    },
    async loginIdentify(partition) {
      const candidate = candidateValidator.parse({ partition });
      const verification = await verificationRead(candidate.partition);
      if (verification.status !== "valid" || !verification.email) return false;
      const previous = get().accounts.byEmail[verification.email];
      const account = accountValidator.parse({
        checkedAt: verification.checkedAt,
        email: verification.email,
        error: null,
        partition: candidate.partition,
        sources: previous?.sources ?? [],
        status: "valid",
      });
      const previousPartition = get().accountsActions.accountSet(account);
      if (previousPartition && previousPartition !== account.partition) {
        await BrowserPartitionWindow.storageClear(previousPartition).catch(() => undefined);
      }
      return true;
    },
    async open(input, parent) {
      const { email } = emailValidator.parse(input);
      const account = get().accounts.byEmail[email];
      if (!account) throw new Error("账号不存在");
      accountWindow?.dispose();
      accountWindow = await BrowserPartitionWindow.open({
        height: 760,
        minHeight: 520,
        minWidth: 760,
        onClose: () => {
          accountWindow = undefined;
        },
        parent,
        partition: account.partition,
        title: email,
        url: "https://chatgpt.com/",
        width: 920,
      });
      return true;
    },
    async remove(input) {
      const value = emailValidator.parse(input);
      const partition = get().accountsActions.accountRemove(value);
      if (!partition) return false;
      accountWindow?.dispose();
      accountWindow = undefined;
      await BrowserPartitionWindow.storageClear(partition).catch(() => undefined);
      return true;
    },
    async validate(input) {
      const { email } = emailValidator.parse(input);
      const account = get().accounts.byEmail[email];
      if (!account) throw new Error("账号不存在");
      const verification = await verificationRead(account.partition);
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
});

export { accounts };
export default accountsStore;
