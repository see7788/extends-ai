import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { z } from "zod";

const accountIdValidator = z.string().regex(/^[a-f0-9]{24}$/);
const accountsValidator = z.object({
  order: z.array(accountIdValidator),
});
const accountInputValidator = z.object({
  accountId: accountIdValidator,
});
const resultValidator = z.object({ ok: z.literal(true) });

type Accounts = z.infer<typeof accountsValidator>;
type AccountInput = z.infer<typeof accountInputValidator>;
type AccountsSlice = {
  accounts: Accounts;
  accountsActions: {
    accountAdd(input: AccountInput): void;
    accountDelete(input: AccountInput): void;
  };
};

const initial: Accounts = { order: [] };
const accounts = {
  accountsValidator,
  channel: {
    accountDelete: "account-list:accounts-delete",
    stateRead: "account-list:accounts-state-read",
    stateUpdated: "account-list:accounts-state-updated",
  },
  initial,
  input: {
    accountAdd: accountInputValidator,
    accountDelete: accountInputValidator,
  },
  resultValidator,
  stateValidator: accountsValidator,
};

const accountsStore: ImmerStateCreator<AccountsSlice> = (set, get) => ({
  accounts: structuredClone(initial),
  accountsActions: {
    accountAdd(input) {
      const { accountId } = accountInputValidator.parse(input);
      set(state => {
        if (!state.accounts.order.includes(accountId)) {
          state.accounts.order.push(accountId);
        }
      });
    },
    accountDelete(input) {
      const { accountId } = accountInputValidator.parse(input);
      set(state => {
        state.accounts.order = state.accounts.order.filter(id => id !== accountId);
      });
    },
  },
});

export { accounts };
export default accountsStore;
