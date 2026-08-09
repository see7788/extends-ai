import browserPartitionRenderer from "browser-partition-renderer/public.ts";
import store from "../store.ts";
import { accounts } from "./store.ts";

const stateSet = (input: unknown): void => {
  store.getState().accountsActions.stateSet(
    accounts.accountsValidator.parse(input),
  );
};
const accountsIndex = {
  async cookieImportConsume() {
    return (await browserPartitionRenderer.invoke({
      channel: accounts.channel.cookieImportConsume,
      input: {},
      inputValidator: accounts.input.command,
      resultValidator: accounts.result.account,
    })).account;
  },
  async loginConsume() {
    return (await browserPartitionRenderer.invoke({
      channel: accounts.channel.loginConsume,
      input: {},
      inputValidator: accounts.input.command,
      resultValidator: accounts.result.account,
    })).account;
  },
  async open(email: string): Promise<boolean> {
    return (await browserPartitionRenderer.invoke({
      channel: accounts.channel.open,
      input: { email },
      inputValidator: accounts.input.email,
      resultValidator: accounts.result.command,
    })).completed;
  },
  async remove(email: string): Promise<boolean> {
    return (await browserPartitionRenderer.invoke({
      channel: accounts.channel.remove,
      input: { email },
      inputValidator: accounts.input.email,
      resultValidator: accounts.result.command,
    })).completed;
  },
  async stateRead(): Promise<void> {
    stateSet(await browserPartitionRenderer.read({
      channel: accounts.channel.stateRead,
      resultValidator: accounts.accountsValidator,
    }));
  },
  stateSubscribe(): () => void {
    return browserPartitionRenderer.subscribe({
      channel: accounts.channel.stateUpdated,
      resultValidator: accounts.accountsValidator,
      run: stateSet,
    });
  },
  async validate(email: string): Promise<boolean> {
    return (await browserPartitionRenderer.invoke({
      channel: accounts.channel.validate,
      input: { email },
      inputValidator: accounts.input.email,
      resultValidator: accounts.result.command,
    })).completed;
  },
};

export default accountsIndex;
