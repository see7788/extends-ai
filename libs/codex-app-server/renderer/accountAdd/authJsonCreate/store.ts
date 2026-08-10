import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { authJsonCreate as producer } from "codex-app-server-main/accountAdd/authJsonCreate/public.ts";
import { browser } from "browser-partition-main/browser/public.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";

type AuthJsonCreate = ReturnType<typeof producer.authJsonCreateValidator.parse>;
type BrowserApplications = ReturnType<typeof browser.browserApplicationsValidator.parse>;
type AuthJsonCreateSlice = {
  authJsonCreate: AuthJsonCreate;
  authJsonCreateActions: {
    applicationsRead(): Promise<BrowserApplications>;
    cancel(): Promise<void>;
    connect(): () => void;
    create(input: ReturnType<typeof producer.input.create.parse>): Promise<void>;
    stateSet(input: AuthJsonCreate): void;
  };
};

const authJsonCreateStore: ImmerStateCreator<
  AuthJsonCreateSlice,
  IpcSlice
> = (set, get) => ({
  authJsonCreate: structuredClone(producer.initial),
  authJsonCreateActions: {
    async applicationsRead() {
      return get().ipcActions.invoke({
        channel: browser.channel.applicationsRead,
        input: {},
        inputValidator: browser.input.command,
        resultValidator: browser.browserApplicationsValidator,
      });
    },
    async cancel() {
      await get().ipcActions.invoke({
        channel: producer.channel.cancel,
        input: {},
        inputValidator: producer.input.command,
        resultValidator: producer.result.cancel,
      });
    },
    connect() {
      return get().ipcActions.stateConnect({
        error: console.error,
        readChannel: producer.channel.stateRead,
        stateSet: get().authJsonCreateActions.stateSet,
        stateUpdatedChannel: producer.channel.stateUpdated,
        validator: producer.authJsonCreateValidator,
      });
    },
    async create(input) {
      await get().ipcActions.invoke({
        channel: producer.channel.create,
        input,
        inputValidator: producer.input.create,
        resultValidator: producer.result.create,
      });
    },
    stateSet(input) {
      set(state => {
        state.authJsonCreate = structuredClone(input);
      });
    },
  },
});

export { producer as authJsonCreate };
export default authJsonCreateStore;
