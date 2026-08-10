import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { ZodType } from "zod";

type Preload = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
  on(channel: string, listener: (value: unknown) => void): number;
  removeListener(channel: string, listenerId: number): void;
};

type IpcSlice = {
  ipcActions: {
    invoke<TInput, TResult>(options: {
      channel: string;
      input: TInput;
      inputValidator: ZodType<TInput>;
      resultValidator: ZodType<TResult>;
    }): Promise<TResult>;
    subscribe<TResult>(options: {
      channel: string;
      resultValidator: ZodType<TResult>;
      run(value: TResult): void;
    }): () => void;
  };
  ipcPrivateActions: {
    preloadRead(): Preload;
  };
};

const ipcStore: ImmerStateCreator<
  IpcSlice
> = (_set, get) => ({
  ipcActions: {
    async invoke(options) {
      const input = options.inputValidator.parse(options.input);
      const result = await get().ipcPrivateActions.preloadRead()
        .invoke(options.channel, input);
      return options.resultValidator.parse(result);
    },
    subscribe(options) {
      const preload = get().ipcPrivateActions.preloadRead();
      const listener = (value: unknown): void => {
        options.run(options.resultValidator.parse(value));
      };
      const listenerId = preload.on(options.channel, listener);
      return () => preload.removeListener(options.channel, listenerId);
    },
  },
  ipcPrivateActions: {
    preloadRead() {
      const value: unknown = Reflect.get(window, "electron");
      if (
        !value
        || typeof value !== "object"
        || typeof Reflect.get(value, "invoke") !== "function"
        || typeof Reflect.get(value, "on") !== "function"
        || typeof Reflect.get(value, "removeListener") !== "function"
      ) {
        throw new Error("Electron preload 不可用");
      }
      return value as Preload;
    },
  },
});

export type { IpcSlice };
export default ipcStore;
