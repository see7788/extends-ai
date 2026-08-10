import BrowserPartitionWindow from "browser-partition-main/BrowserWindow.ts";
import type { nodeState_t as BrowserNodeState } from "browser-partition-main/browser/store.ts";
import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { app, session, type WebContents } from "electron";
import * as childProcess from "node:child_process";
import * as crypto from "node:crypto";
import * as fileSystem from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import process from "node:process";
import type { nodeState_t as AccountsNodeState } from "../accounts/store.ts";
import type { nodeState_t as CookieImportNodeState } from "../cookieImport/store.ts";
import type { nodeState_t as LoginNodeState } from "../login/store.ts";

type NodeState = AccountsNodeState & BrowserNodeState & CookieImportNodeState & LoginNodeState & {
  electronRendererUrl?: string;
  webContents?: WebContents;
};

const nodeState: ImmerStateCreator<NodeState> = () => ({
  browserApp: {
    getPath: app.getPath.bind(app),
  },
  browserChildProcess: {
    execFile: childProcess.execFile,
    spawn: childProcess.spawn,
  },
  browserCrypto: {
    createHash: crypto.createHash,
  },
  browserFileSystem: {
    access: fileSystem.access,
  },
  browserOs: {
    homedir: os.homedir,
  },
  browserPartitionWindow: {
    open: BrowserPartitionWindow.open.bind(BrowserPartitionWindow),
    storageClear: BrowserPartitionWindow.storageClear.bind(BrowserPartitionWindow),
  },
  browserPath: {
    basename: path.basename,
    join: path.join,
    resolve: path.resolve,
  },
  browserProcess: {
    env: { ...process.env },
    platform: process.platform,
  },
  electronRendererUrl: process.env.ELECTRON_RENDERER_URL?.trim() || undefined,
  electronSession: {
    fromPartition: session.fromPartition.bind(session),
  },
  fileSystem: {
    readFile: fileSystem.readFile,
    stat: fileSystem.stat,
  },
  loginWindow: undefined,
  webContents: undefined,
});

export default nodeState;
