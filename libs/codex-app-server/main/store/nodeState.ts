import type { nodeState_t as BrowserNodeState } from "browser-partition-main/browser/store.ts";
import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import * as electron from "electron";
import { app, type WebContents } from "electron";
import * as childProcess from "node:child_process";
import * as crypto from "node:crypto";
import * as fileSystem from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import process from "node:process";
import * as readLine from "node:readline";
import type { nodeState_t as AccountListNodeState } from "../accountList/store.ts";
import type { nodeState_t as AccountNodeState } from "../accountList/account/store.ts";
import type { nodeState_t as ConnectionNodeState } from "../accountList/connection/store.ts";
import type { nodeState_t as AccountAddNodeState } from "../accountAdd/store.ts";
import type { nodeState_t as GlobalSettingsNodeState } from "../globalSettings/store.ts";
import BrowserPartitionWindow from "browser-partition-main/BrowserWindow.ts";

type NodeState = AccountAddNodeState
  & AccountNodeState
  & AccountListNodeState
  & BrowserNodeState
  & ConnectionNodeState
  & GlobalSettingsNodeState & {
  webContents?: WebContents;
};

const nodeState: ImmerStateCreator<NodeState> = () => ({
  appHome: app.getPath("home"),
  appUserData: app.getPath("userData"),
  appTemp: app.getPath("temp"),
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
  browserPath: {
    basename: path.basename,
    join: path.join,
    resolve: path.resolve,
  },
  browserProcess: {
    env: { ...process.env },
    platform: process.platform,
  },
  browserPartitionWindow: {
    open: BrowserPartitionWindow.open.bind(BrowserPartitionWindow),
  },
  childProcess: {
    execFile: childProcess.execFile,
    spawn: childProcess.spawn,
  },
  crypto: {
    createHash: crypto.createHash,
    randomUUID: crypto.randomUUID,
  },
  electronBrowserWindow: {
    fromWebContents: electron.BrowserWindow.fromWebContents.bind(electron.BrowserWindow),
  },
  electron: {
    BrowserWindow: {
      fromWebContents: electron.BrowserWindow.fromWebContents.bind(electron.BrowserWindow),
    },
    clipboard: {
      readText: electron.clipboard.readText.bind(electron.clipboard),
    },
    dialog: {
      showOpenDialog: electron.dialog.showOpenDialog.bind(electron.dialog),
    },
  },
  fileSystem: {
    access: fileSystem.access,
    cp: fileSystem.cp,
    mkdir: fileSystem.mkdir,
    mkdtemp: fileSystem.mkdtemp,
    open: fileSystem.open,
    readFile: fileSystem.readFile,
    readdir: fileSystem.readdir,
    rename: fileSystem.rename,
    rm: fileSystem.rm,
    stat: fileSystem.stat,
    unlink: fileSystem.unlink,
    writeFile: fileSystem.writeFile,
  },
  os: {
    homedir: os.homedir,
    tmpdir: os.tmpdir,
  },
  path: {
    basename: path.basename,
    dirname: path.dirname,
    isAbsolute: path.isAbsolute,
    join: path.join,
    relative: path.relative,
    resolve: path.resolve,
  },
  process: {
    env: { ...process.env },
    platform: process.platform,
  },
  readLine: {
    createInterface: readLine.createInterface,
  },
  webContents: undefined,
});

export default nodeState;
