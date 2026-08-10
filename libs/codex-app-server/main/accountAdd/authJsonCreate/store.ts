import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import { z } from "zod";
import { authJsonCreate as authJsonCreateProcess } from "./process.ts";
import { authJsonCreate, type AuthJsonCreateInput } from "./public.ts";

type AuthJsonCreate = z.infer<typeof authJsonCreate.authJsonCreateValidator>;
type AuthJsonCreateOptions = {
  browserId: AuthJsonCreateInput["browserId"];
  openAuthUrl(authUrl: string, signal: AbortSignal): Promise<void>;
};
type AuthJsonCreateSlice = {
  authJsonCreate: AuthJsonCreate;
  authJsonCreateActions: {
    cancel(): boolean;
    create(options: AuthJsonCreateOptions): Promise<z.infer<typeof authJsonCreate.sourceValidator>>;
    dispose(): void;
  };
};

const canceledError = (): Error => {
  const error = new Error("Codex 登录已取消");
  error.name = "AbortError";
  return error;
};

let active: AbortController | undefined;

const authJsonCreateStore: ImmerStateCreator<
  AuthJsonCreateSlice,
  { webContents?: WebContents }
> = (set, get) => {
  const stateSend = (): void => get().webContents?.send(
    authJsonCreate.channel.stateUpdated,
    authJsonCreate.authJsonCreateValidator.parse(get().authJsonCreate),
  );
  return ({
  authJsonCreate: structuredClone(authJsonCreate.initial),
  authJsonCreateActions: {
    cancel() {
      if (!active || active.signal.aborted) return false;
      active.abort();
      return true;
    },
    async create(options) {
      if (active) throw new Error("已有 auth.json 创建操作正在进行");
      const controller = new AbortController();
      active = controller;
      set(state => {
        state.authJsonCreate.activeBrowserId = options.browserId;
        state.authJsonCreate.authorizationExpiresAt = new Date(
          Date.now() + state.authJsonCreate.authorizationTimeoutSeconds * 1_000,
        ).toISOString();
        state.authJsonCreate.status = "working";
      });
      stateSend();
      const timeout = setTimeout(
        () => controller.abort(),
        get().authJsonCreate.authorizationTimeoutSeconds * 1_000,
      );
      try {
        const source = authJsonCreate.sourceValidator.parse(await authJsonCreateProcess({
          openAuthUrl: authUrl => options.openAuthUrl(authUrl, controller.signal),
          signal: controller.signal,
        }));
        if (controller.signal.aborted) throw canceledError();
        set(state => {
          state.authJsonCreate.history[options.browserId] = {
            browserId: options.browserId,
            completedAt: new Date().toISOString(),
          };
        });
        stateSend();
        return source;
      } finally {
        clearTimeout(timeout);
        if (active === controller) active = undefined;
        set(state => {
          state.authJsonCreate.activeBrowserId = null;
          state.authJsonCreate.authorizationExpiresAt = null;
          state.authJsonCreate.status = "idle";
        });
        stateSend();
      }
    },
    dispose() {
      active?.abort();
      active = undefined;
    },
  },
  });
};

export { authJsonCreate, type AuthJsonCreateInput };
export default authJsonCreateStore;
