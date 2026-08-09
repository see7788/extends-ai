import loginRenderer from "browser-partition-renderer/public.ts";
import store from "../store.ts";
import { cookieImport } from "./store.ts";

const stateSet = (input: unknown): void => {
  store.getState().cookieImportActions.stateSet(
    cookieImport.cookieImportValidator.parse(input),
  );
};
const cookieImportIndex = {
  async authorizationTimeoutSecondsSet(
    authorizationTimeoutSeconds: number,
  ): Promise<void> {
    await loginRenderer.invoke({
      channel: cookieImport.channel.authorizationTimeoutSecondsSet,
      input: { authorizationTimeoutSeconds },
      inputValidator: cookieImport.input.authorizationTimeoutSecondsSet,
      resultValidator: cookieImport.result.setting,
    });
  },
  async cancel(): Promise<boolean> {
    const result = await loginRenderer.invoke({
      channel: cookieImport.channel.cancel,
      input: {},
      inputValidator: cookieImport.input.command,
      resultValidator: cookieImport.result.cancel,
    });
    return result.canceled;
  },
  async stateRead(): Promise<void> {
    stateSet(await loginRenderer.read({
      channel: cookieImport.channel.stateRead,
      resultValidator: cookieImport.cookieImportValidator,
    }));
  },
  async start(browserId: string): Promise<boolean> {
    return (await loginRenderer.invoke({
      channel: cookieImport.channel.start,
      input: { browserId },
      inputValidator: cookieImport.input.create,
      resultValidator: cookieImport.result.start,
    })).completed;
  },
  stateSubscribe(): () => void {
    return loginRenderer.subscribe({
      channel: cookieImport.channel.stateUpdated,
      resultValidator: cookieImport.cookieImportValidator,
      run: stateSet,
    });
  },
};

export default cookieImportIndex;
