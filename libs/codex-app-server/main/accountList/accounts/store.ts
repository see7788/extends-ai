import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import { z } from "zod";

const accountIdValidator = z.string().regex(/^[a-f0-9]{24}$/);
const accountsValidator = z.object({
  order: z.array(accountIdValidator),
});
const accountInputValidator = z.object({
  accountId: accountIdValidator,
});
const requestValidator = z.discriminatedUnion("method", [
  z.object({ method: z.literal("stateRead") }),
]);
const messageValidator = z.object({
  method: z.literal("stateUpdated"),
  value: accountsValidator,
});

type Accounts = z.infer<typeof accountsValidator>;
type AccountInput = z.infer<typeof accountInputValidator>;
type AccountsSlice = {
  accounts: Accounts;
  accountsActions: {
    accountAdd(input: AccountInput): void;
    accountDelete(input: AccountInput): void;
    communicationStart(): () => void;
  };
};

const initial: Accounts = { order: [] };
const accounts = {
  accountsValidator,
  channel: "accounts",
  initial,
  input: {
    accountAdd: accountInputValidator,
    accountDelete: accountInputValidator,
  },
  messageValidator,
  requestValidator,
  stateValidator: accountsValidator,
};

const accountsStore: ImmerStateCreator<
  AccountsSlice,
  { webContents_nodestate?: WebContents }
> = (set, get) => {
  const stateSend = (): void => get().webContents_nodestate?.send(
    accounts.channel,
    messageValidator.parse({ method: "stateUpdated", value: get().accounts }),
  );
  return ({
  accounts: structuredClone(initial),
  accountsActions: {
    accountAdd(input) {
      const { accountId } = accountInputValidator.parse(input);
      set(state => {
        if (!state.accounts.order.includes(accountId)) {
          state.accounts.order.push(accountId);
        }
      });
      stateSend();
    },
    accountDelete(input) {
      const { accountId } = accountInputValidator.parse(input);
      set(state => {
        state.accounts.order = state.accounts.order.filter(id => id !== accountId);
      });
      stateSend();
    },
    communicationStart() {
      const contents = get().webContents_nodestate;
      if (!contents || contents.isDestroyed()) throw new Error("WebContents 不可用");
      contents.ipc.handle(accounts.channel, (_event, input: unknown) => {
        accounts.requestValidator.parse(input);
        return accounts.stateValidator.parse(get().accounts);
      });
      return () => contents.ipc.removeHandler(accounts.channel);
    },
  },
  });
};

export { accounts, type AccountInput, type Accounts, type AccountsSlice };
export default accountsStore;
