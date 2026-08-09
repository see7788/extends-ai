import loginRenderer from "browser-partition-renderer/public.ts";
import store from "../store.ts";
import { login } from "./store.ts";

const stateSet = (input: unknown): void => {
  store.getState().loginActions.stateSet(login.loginValidator.parse(input));
};

const loginIndex = {
  async cancel(): Promise<boolean> {
    const result = await loginRenderer.invoke({
      channel: login.channel.cancel,
      input: {},
      inputValidator: login.input.command,
      resultValidator: login.result.cancel,
    });
    return result.canceled;
  },
  async stateRead(): Promise<void> {
    stateSet(await loginRenderer.read({
      channel: login.channel.stateRead,
      resultValidator: login.loginValidator,
    }));
  },
  async start(): Promise<boolean> {
    return (await loginRenderer.invoke({
      channel: login.channel.start,
      input: {},
      inputValidator: login.input.command,
      resultValidator: login.result.start,
    })).completed;
  },
  stateSubscribe(): () => void {
    return loginRenderer.subscribe({
      channel: login.channel.stateUpdated,
      resultValidator: login.loginValidator,
      run: stateSet,
    });
  },
};

export default loginIndex;
