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
    read<TResult>(options: {
      channel: string;
      resultValidator: ZodType<TResult>;
    }): Promise<TResult>;
    stateConnect<TState>(options: {
      error(error: unknown): void;
      readChannel: string;
      stateSet(value: TState): void;
      stateUpdatedChannel: string;
      validator: ZodType<TState>;
    }): () => void;
    subscribe<TResult>(options: {
      channel: string;
      resultValidator: ZodType<TResult>;
      run(value: TResult): void;
    }): () => void;
  };
};

const preloadRead = (): Preload => {
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
};

const ipcStore: ImmerStateCreator<
  IpcSlice
> = () => {
  const actions: IpcSlice["ipcActions"] = {
    async invoke(options) {
      const input = options.inputValidator.parse(options.input);
      const result = await preloadRead().invoke(options.channel, input);
      return options.resultValidator.parse(result);
    },
    async read(options) {
      const result = await preloadRead().invoke(options.channel);
      return options.resultValidator.parse(result);
    },
    stateConnect(options) {
      void actions.read({
        channel: options.readChannel,
        resultValidator: options.validator,
      }).then(options.stateSet).catch(options.error);
      return actions.subscribe({
        channel: options.stateUpdatedChannel,
        resultValidator: options.validator,
        run: options.stateSet,
      });
    },
    subscribe(options) {
      const preload = preloadRead();
      const listener = (value: unknown): void => {
        options.run(options.resultValidator.parse(value));
      };
      const listenerId = preload.on(options.channel, listener);
      return () => preload.removeListener(options.channel, listenerId);
    },
  };

  return { ipcActions: actions };
};

export type { IpcSlice };
export default ipcStore;
