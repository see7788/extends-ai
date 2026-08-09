import store from "../../store/index.ts";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import { authJsonImport } from "./store.ts";

const stateSet = (input: unknown): void => {
  store.setState({ authJsonImport: authJsonImport.authJsonImportValidator.parse(input) });
};
const invokeImport = async (channel: string): Promise<boolean> => {
  const result = await invoke({
    channel,
    input: {},
    inputValidator: authJsonImport.input.command,
    resultValidator: authJsonImport.result.import,
  });
  return result.imported;
};
const authJsonImportIndex = {
  clipboard: () => invokeImport(authJsonImport.channel.clipboard),
  default: () => invokeImport(authJsonImport.channel.default),
  select: () => invokeImport(authJsonImport.channel.select),
  async stateRead(): Promise<void> {
    stateSet(await read({
      channel: authJsonImport.channel.stateRead,
      resultValidator: authJsonImport.authJsonImportValidator,
    }));
  },
  stateSubscribe(): () => void {
    return subscribe({
      channel: authJsonImport.channel.stateUpdated,
      resultValidator: authJsonImport.authJsonImportValidator,
      run: stateSet,
    });
  },
};

export default authJsonImportIndex;
