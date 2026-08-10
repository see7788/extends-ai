import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import { z } from "zod";
import { accounts, type AccountsSlice } from "../accounts/store.ts";
import type { CookieImportSlice } from "../cookieImport/store.ts";

const request = {
  remove: z.object({ input: accounts.input.email, method: z.literal("remove") }),
};
const requestValidator = z.discriminatedUnion("method", [request.remove]);
const result = { command: z.object({ completed: z.boolean() }) };

type ProducerSlices = AccountsSlice & CookieImportSlice;
type nodeState_t = { webContents_nodestate?: WebContents };
type AccountListSlice = {
  accountListActions: {
    communicationStart(): () => void;
    remove(input: unknown): Promise<boolean>;
  };
};

const accountList = {
  channel: "accountList",
  request,
  requestValidator,
  result,
} as const;

const accountListStore: ImmerStateCreator<
  AccountListSlice,
  ProducerSlices & nodeState_t
> = (_set, get) => ({
  accountListActions: {
    communicationStart() {
      const contents = get().webContents_nodestate;
      if (!contents || contents.isDestroyed()) throw new Error("Login WebContents 不可用");
      contents.ipc.handle(accountList.channel, async (_event, input: unknown) => {
        const requestValue = accountList.requestValidator.parse(input);
        switch (requestValue.method) {
        case "remove":
          return accountList.result.command.parse({
            completed: await get().accountListActions.remove(requestValue.input),
          });
        }
      });
      return () => contents.ipc.removeHandler(accountList.channel);
    },
    async remove(input) {
      const value = accounts.input.email.parse(input);
      const sources = get().accounts.byEmail[value.email]?.sources ?? [];
      const completed = await get().accountsActions.remove(value);
      if (!completed) return false;
      for (const source of sources) {
        await get().cookieImportActions.historyRemove({ browserId: source.browserId });
      }
      return true;
    },
  },
});

export { accountList, type AccountListSlice, type nodeState_t };
export default accountListStore;
