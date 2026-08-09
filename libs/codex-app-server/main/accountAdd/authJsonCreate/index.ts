import { randomUUID } from "node:crypto";
import { type BrowserWindow as ElectronBrowserWindow } from "electron";
import BrowserPartitionWindow from "browser-partition-main/BrowserWindow/index.ts";
import { open as browserOpen } from "browser-partition-main/browser/index.ts";
import { z } from "zod";
import store from "../../store.ts";
import { authJsonCreate } from "./store.ts";

const create = async (input: {
    carrier: z.infer<typeof authJsonCreate.input.create>;
    controller: AbortController;
    parent: ElectronBrowserWindow;
  }) => {
    const carrier = input.carrier;
    const electron = carrier.type === "electron";
    const partition = electron
      ? `persist:codex-app-server.auth-json-create.${randomUUID()}`
      : undefined;
    let committed = false;
    let window: BrowserPartitionWindow | undefined;
    try {
      const source = await store.getState().authJsonCreateActions.create({
        openAuthUrl: electron
          ? async authUrl => {
              window = await BrowserPartitionWindow.open({
                height: 760,
                minHeight: 520,
                minWidth: 760,
                onClose: () => input.controller.abort(),
                parent: input.parent,
                partition: partition!,
                title: "Codex 登录",
                url: authUrl,
                width: 920,
              });
            }
          : authUrl => browserOpen({
              browserId: carrier.browserId,
              url: authUrl,
            }),
        signal: input.controller.signal,
      });
      await window?.storageFlush();
      committed = true;
      return {
        source,
        webAccess: partition
          ? { partition, type: "electron" as const }
          : undefined,
      };
    } finally {
      window?.dispose();
      if (!committed && partition) {
        await BrowserPartitionWindow.storageClear(partition).catch(() => undefined);
      }
    }
};

export default create;
