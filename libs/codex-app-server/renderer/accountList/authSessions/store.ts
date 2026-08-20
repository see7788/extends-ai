import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import {
  type AccountCommandInput,
  authSessions as producer,
  type AuthSessions,
} from "codex-app-server-main/accountList/authSessions/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
import { accountList } from "codex-app-server-main/accountList/store.ts";
type AuthSessionsSlice = {
  authSessions: AuthSessions;
  authSessionsActions: {
    connect(): () => void;
    read(input: AccountCommandInput): Promise<void>;
    stateSet(input: AuthSessions): void;
  };
};

const authSessionsStore: ImmerStateCreator<
  AuthSessionsSlice,
  IpcSlice
> = (set, get) => ({
  authSessions: structuredClone(producer.initial),
  authSessionsActions: {
    connect() {
      void get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "stateRead" as const },
        inputValidator: producer.requestValidator,
        resultValidator: producer.authSessionsValidator,
      }).then(get().authSessionsActions.stateSet).catch(console.error);
      return get().ipcActions.subscribe({
        channel: producer.channel,
        resultValidator: producer.messageValidator,
        run: message => get().authSessionsActions.stateSet(message.value),
      });
    },
    async read(input) {
      await get().ipcActions.invoke({
        channel: accountList.channel,
        input: { input, method: "authSessionsRead" as const },
        inputValidator: accountList.request.authSessionsRead,
        resultValidator: accountList.result.command,
      });
    },
    stateSet(input) {
      const value = producer.authSessionsValidator.parse(input);
      set(state => {
        state.authSessions = value;
      });
    },
  },
});

export default authSessionsStore;
