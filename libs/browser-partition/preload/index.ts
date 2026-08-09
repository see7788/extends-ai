import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

type Listener = (value: unknown) => void;
type IpcListener = (event: IpcRendererEvent, value: unknown) => void;

const listeners = new Map<number, { channel: string; listener: IpcListener }>();
let listenerId = 0;
const bridge = {
  invoke(channel: string, ...args: unknown[]) {
    return ipcRenderer.invoke(channel, ...args);
  },
  on(channel: string, listener: Listener): number {
    const proxy = (_event: IpcRendererEvent, value: unknown): void => listener(value);
    const id = ++listenerId;
    listeners.set(id, { channel, listener: proxy });
    ipcRenderer.on(channel, proxy);
    return id;
  },
  removeListener(channel: string, id: number): void {
    const item = listeners.get(id);
    if (!item || item.channel !== channel) return;
    ipcRenderer.removeListener(channel, item.listener);
    listeners.delete(id);
  },
};

contextBridge.exposeInMainWorld("electron", bridge);

export default bridge;
