import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
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
type AccountsSlice = {
  accounts: Accounts;
  accountsActions: {
    accountRemove(input: z.infer<typeof emailValidator>): string | undefined;
    accountSet(input: z.infer<typeof accountSetValidator>): string | undefined;
    accountStatusSet(input: z.infer<typeof accountStatusSetValidator>): void;
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
    loginConsume: "login:accounts:login-consume",
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

const accountsStore: ImmerStateCreator<AccountsSlice> = set => ({
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
  },
});

export { accounts };
export default accountsStore;
