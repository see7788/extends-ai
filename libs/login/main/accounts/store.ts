import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type {
  BrowserWindow as ElectronBrowserWindow,
  WebContents,
} from "electron";
import { z } from "zod";
import {
  accountWindowDispose,
  accountWindowOpen,
  partitionClear,
  verificationRead,
} from "./process.ts";
import {
  accountSetValidator,
  accountStatusSetValidator,
  accounts,
  candidateValidator,
  emailValidator,
} from "./public.ts";

type Accounts = z.infer<typeof accounts.accountsValidator>;
type Candidate = z.infer<typeof candidateValidator>;
type AccountsSlice = {
  accounts: Accounts;
  accountsActions: {
    accountRemove(input: z.infer<typeof emailValidator>): string | undefined;
    accountSet(input: z.infer<typeof accountSetValidator>): string | undefined;
    accountStatusSet(input: z.infer<typeof accountStatusSetValidator>): void;
    candidateConsume(
      input: unknown,
      signal?: AbortSignal,
    ): Promise<z.infer<typeof accounts.accountValidator>>;
    dispose(): void;
    loginIdentify(partition: string): Promise<boolean>;
    open(input: unknown, parent: ElectronBrowserWindow): Promise<boolean>;
    remove(input: unknown): Promise<boolean>;
    validate(input: unknown): Promise<boolean>;
  };
};

const accountsStore: ImmerStateCreator<
  AccountsSlice,
  { webContents?: WebContents }
> = (set, get) => {
  const stateSend = (): void => get().webContents?.send(
    accounts.channel.stateUpdated,
    accounts.accountsValidator.parse(get().accounts),
  );
  return ({
  accounts: structuredClone(accounts.initial),
  accountsActions: {
    accountRemove(input) {
      const { email } = emailValidator.parse(input);
      let partition: string | undefined;
      set(state => {
        partition = state.accounts.byEmail[email]?.partition;
        delete state.accounts.byEmail[email];
        state.accounts.order = state.accounts.order.filter(value => value !== email);
      });
      stateSend();
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
      stateSend();
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
      stateSend();
    },
    async candidateConsume(input, signal) {
      const candidate: Candidate = candidateValidator.parse(input);
      const verification = await verificationRead(
        candidate.partition,
        accounts.accountSessionValidator.parse,
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
      const value = accounts.accountValidator.parse({
        checkedAt: verification.checkedAt,
        email: verification.email,
        error: null,
        partition: candidate.partition,
        sources,
        status: "valid",
      });
      const previousPartition = get().accountsActions.accountSet(value);
      if (previousPartition && previousPartition !== value.partition) {
        await partitionClear(previousPartition).catch(() => undefined);
      }
      return value;
    },
    dispose() {
      accountWindowDispose();
    },
    async loginIdentify(partition) {
      const candidate = candidateValidator.parse({ partition });
      const verification = await verificationRead(
        candidate.partition,
        accounts.accountSessionValidator.parse,
      );
      if (verification.status !== "valid" || !verification.email) return false;
      const previous = get().accounts.byEmail[verification.email];
      const value = accounts.accountValidator.parse({
        checkedAt: verification.checkedAt,
        email: verification.email,
        error: null,
        partition: candidate.partition,
        sources: previous?.sources ?? [],
        status: "valid",
      });
      const previousPartition = get().accountsActions.accountSet(value);
      if (previousPartition && previousPartition !== value.partition) {
        await partitionClear(previousPartition).catch(() => undefined);
      }
      return true;
    },
    async open(input, parent) {
      const { email } = emailValidator.parse(input);
      const value = get().accounts.byEmail[email];
      if (!value) throw new Error("账号不存在");
      await accountWindowOpen({
        email,
        parent,
        partition: value.partition,
      });
      return true;
    },
    async remove(input) {
      const value = emailValidator.parse(input);
      const partition = get().accountsActions.accountRemove(value);
      if (!partition) return false;
      accountWindowDispose();
      await partitionClear(partition).catch(() => undefined);
      return true;
    },
    async validate(input) {
      const { email } = emailValidator.parse(input);
      const value = get().accounts.byEmail[email];
      if (!value) throw new Error("账号不存在");
      const verification = await verificationRead(
        value.partition,
        accounts.accountSessionValidator.parse,
      );
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
};

export { accounts };
export default accountsStore;
