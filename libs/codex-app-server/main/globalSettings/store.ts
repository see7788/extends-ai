import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import { z } from "zod";

const globalSettingsValidator = z.object({
  codexHome: z.string().nullable(),
  maintenanceEnabled: z.boolean(),
  maintenanceIntervalHours: z.number().int().min(1).max(720),
  maintenanceRetryCount: z.number().int().min(0).max(5),
  maintenanceRetryIntervalMinutes: z.number().int().min(1).max(1_440),
});
const codexHomeSetValidator = z.object({ codexHome: z.string().trim().min(1) });
const maintenanceEnabledSetValidator = globalSettingsValidator.pick({ maintenanceEnabled: true });
const maintenanceIntervalHoursSetValidator = globalSettingsValidator.pick({ maintenanceIntervalHours: true });
const maintenanceRetryCountSetValidator = globalSettingsValidator.pick({ maintenanceRetryCount: true });
const maintenanceRetryIntervalMinutesSetValidator = globalSettingsValidator.pick({ maintenanceRetryIntervalMinutes: true });
const resultValidator = z.object({ ok: z.literal(true) });
const requestValidator = z.discriminatedUnion("method", [
  z.object({ method: z.literal("stateRead") }),
  maintenanceEnabledSetValidator.extend({ method: z.literal("maintenanceEnabledSet") }),
  maintenanceIntervalHoursSetValidator.extend({ method: z.literal("maintenanceIntervalHoursSet") }),
  maintenanceRetryCountSetValidator.extend({ method: z.literal("maintenanceRetryCountSet") }),
  maintenanceRetryIntervalMinutesSetValidator.extend({
    method: z.literal("maintenanceRetryIntervalMinutesSet"),
  }),
]);
const messageValidator = z.object({
  method: z.literal("stateUpdated"),
  value: globalSettingsValidator,
});

type GlobalSettings = z.infer<typeof globalSettingsValidator>;
type CodexHomeSetInput = z.infer<typeof codexHomeSetValidator>;
type MaintenanceEnabledSetInput = z.infer<typeof maintenanceEnabledSetValidator>;
type MaintenanceIntervalHoursSetInput = z.infer<typeof maintenanceIntervalHoursSetValidator>;
type MaintenanceRetryCountSetInput = z.infer<typeof maintenanceRetryCountSetValidator>;
type MaintenanceRetryIntervalMinutesSetInput = z.infer<typeof maintenanceRetryIntervalMinutesSetValidator>;
type GlobalSettingsSlice = {
  globalSettings: GlobalSettings;
  globalSettingsActions: {
    codexHomeMove(input: CodexHomeSetInput): Promise<{ oldPathCleanupFailed: boolean }>;
    codexHomeSet(input: CodexHomeSetInput): void;
    communicationStart(): () => void;
    initialize(input: GlobalSettings): void;
    maintenanceEnabledSet(input: MaintenanceEnabledSetInput): void;
    maintenanceIntervalHoursSet(input: MaintenanceIntervalHoursSetInput): void;
    maintenanceRetryCountSet(input: MaintenanceRetryCountSetInput): void;
    maintenanceRetryIntervalMinutesSet(input: MaintenanceRetryIntervalMinutesSetInput): void;
  };
};
type nodeState_t = {
  crypto: Pick<typeof import("node:crypto"), "randomUUID">;
  fileSystem: Pick<
    typeof import("node:fs/promises"),
    "cp" | "mkdir" | "open" | "readdir" | "rename" | "rm" | "stat" | "unlink"
  >;
  path: Pick<
    typeof import("node:path"),
    "dirname" | "isAbsolute" | "join" | "relative" | "resolve"
  >;
  process: Pick<NodeJS.Process, "platform">;
  webContents?: WebContents;
};

const initial: GlobalSettings = {
  codexHome: "",
  maintenanceEnabled: false,
  maintenanceIntervalHours: 48,
  maintenanceRetryCount: 2,
  maintenanceRetryIntervalMinutes: 15,
};
const globalSettings = {
  channel: "globalSettings",
  globalSettingsValidator,
  initial,
  input: {
    codexHomeSet: codexHomeSetValidator,
    maintenanceEnabledSet: maintenanceEnabledSetValidator,
    maintenanceIntervalHoursSet: maintenanceIntervalHoursSetValidator,
    maintenanceRetryCountSet: maintenanceRetryCountSetValidator,
    maintenanceRetryIntervalMinutesSet: maintenanceRetryIntervalMinutesSetValidator,
  },
  messageValidator,
  requestValidator,
  resultValidator,
};

const globalSettingsStore: ImmerStateCreator<GlobalSettingsSlice, nodeState_t> = (set, get) => {
  const stateSend = (): void => get().webContents?.send(
    globalSettings.channel,
    messageValidator.parse({ method: "stateUpdated", value: get().globalSettings }),
  );
  const pathExists = async (value: string): Promise<boolean> => {
    try {
      await get().fileSystem.stat(value);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
      throw error;
    }
  };
  const pathNormalize = (value: string): string => {
    if (!get().path.isAbsolute(value)) {
      throw new Error(`CODEX_HOME 必须是绝对路径：${value}`);
    }
    return get().path.resolve(value);
  };
  const pathSame = (left: string, right: string): boolean => get().process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
  const pathInside = (parent: string, child: string): boolean => {
    const value = get().path.relative(parent, child);
    return Boolean(value) && !value.startsWith("..") && !get().path.isAbsolute(value);
  };
  const directoryWritableAssert = async (directory: string): Promise<void> => {
    const probe = get().path.join(
      directory,
      `.codex-app-server-write-${get().crypto.randomUUID()}.tmp`,
    );
    try {
      await get().fileSystem.mkdir(directory, { recursive: true });
      const handle = await get().fileSystem.open(probe, "wx");
      await handle.close();
      await get().fileSystem.unlink(probe);
    } catch (error) {
      await get().fileSystem.unlink(probe).catch(() => undefined);
      throw new Error(`目录不可写：${directory}`, { cause: error });
    }
  };
  const pathWritableAssert = async (value: string): Promise<void> => {
    let existing = value;
    while (!await pathExists(existing)) {
      const parent = get().path.dirname(existing);
      if (parent === existing) throw new Error(`找不到可写的父目录：${value}`);
      existing = parent;
    }
    const state = await get().fileSystem.stat(existing);
    if (!state.isDirectory()) throw new Error(`路径不是目录：${existing}`);
    await directoryWritableAssert(existing);
  };
  return {
    globalSettings: structuredClone(initial),
    globalSettingsActions: {
      communicationStart() {
        const contents = get().webContents;
        if (!contents || contents.isDestroyed()) throw new Error("WebContents 不可用");
        contents.ipc.handle(globalSettings.channel, (_event, input: unknown) => {
          const requestValue = globalSettings.requestValidator.parse(input);
          switch (requestValue.method) {
          case "stateRead":
            return globalSettings.globalSettingsValidator.parse(get().globalSettings);
          case "maintenanceEnabledSet":
            get().globalSettingsActions.maintenanceEnabledSet(requestValue);
            break;
          case "maintenanceIntervalHoursSet":
            get().globalSettingsActions.maintenanceIntervalHoursSet(requestValue);
            break;
          case "maintenanceRetryCountSet":
            get().globalSettingsActions.maintenanceRetryCountSet(requestValue);
            break;
          case "maintenanceRetryIntervalMinutesSet":
            get().globalSettingsActions.maintenanceRetryIntervalMinutesSet(requestValue);
            break;
          }
          return globalSettings.resultValidator.parse({ ok: true });
        });
        return () => contents.ipc.removeHandler(globalSettings.channel);
      },
      async codexHomeMove(input) {
        const target = pathNormalize(codexHomeSetValidator.parse(input).codexHome);
        const source = get().globalSettings.codexHome;
        let oldPathCleanupFailed = false;
        if (source && !pathSame(source, target)) {
          if (pathInside(source, target) || pathInside(target, source)) {
            throw new Error("新旧 CODEX_HOME 不能互相嵌套");
          }
          await pathWritableAssert(target);
          if (await pathExists(source)) {
            if (!(await get().fileSystem.stat(source)).isDirectory()) {
              throw new Error(`原 CODEX_HOME 不是目录：${source}`);
            }
            if (await pathExists(target)) {
              if (!(await get().fileSystem.stat(target)).isDirectory()) {
                throw new Error(`新 CODEX_HOME 不是目录：${target}`);
              }
              if ((await get().fileSystem.readdir(target)).length > 0) {
                throw new Error(`新 CODEX_HOME 不是空目录：${target}`);
              }
              await get().fileSystem.rm(target, { recursive: true });
            }
            await get().fileSystem.mkdir(get().path.dirname(target), { recursive: true });
            try {
              await get().fileSystem.rename(source, target);
            } catch (error) {
              if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
              try {
                await get().fileSystem.cp(source, target, {
                  errorOnExist: true,
                  force: false,
                  recursive: true,
                });
              } catch (copyError) {
                await get().fileSystem.rm(target, { force: true, recursive: true });
                throw new Error("CODEX_HOME 复制失败，原目录保持不变", {
                  cause: copyError,
                });
              }
              await get().fileSystem.rm(source, { recursive: true }).catch(() => {
                oldPathCleanupFailed = true;
              });
            }
          }
        } else if (!source) {
          await pathWritableAssert(target);
        }
        set(state => { state.globalSettings.codexHome = target; });
        stateSend();
        return { oldPathCleanupFailed };
      },
      codexHomeSet(input) {
        const value = codexHomeSetValidator.parse(input);
        set(state => { state.globalSettings.codexHome = pathNormalize(value.codexHome); });
        stateSend();
      },
      initialize(input) {
        const value = globalSettingsValidator.parse(input);
        if (value.codexHome) value.codexHome = pathNormalize(value.codexHome);
        set(state => { state.globalSettings = value; });
        stateSend();
      },
      maintenanceEnabledSet(input) {
        const value = maintenanceEnabledSetValidator.parse(input);
        set(state => { state.globalSettings.maintenanceEnabled = value.maintenanceEnabled; });
        stateSend();
      },
      maintenanceIntervalHoursSet(input) {
        const value = maintenanceIntervalHoursSetValidator.parse(input);
        set(state => {
          state.globalSettings.maintenanceIntervalHours = value.maintenanceIntervalHours;
        });
        stateSend();
      },
      maintenanceRetryCountSet(input) {
        const value = maintenanceRetryCountSetValidator.parse(input);
        set(state => {
          state.globalSettings.maintenanceRetryCount = value.maintenanceRetryCount;
        });
        stateSend();
      },
      maintenanceRetryIntervalMinutesSet(input) {
        const value = maintenanceRetryIntervalMinutesSetValidator.parse(input);
        set(state => {
          state.globalSettings.maintenanceRetryIntervalMinutes = value.maintenanceRetryIntervalMinutes;
        });
        stateSend();
      },
    },
  };
};

export type {
  CodexHomeSetInput,
  GlobalSettings,
  GlobalSettingsSlice,
  MaintenanceEnabledSetInput,
  MaintenanceIntervalHoursSetInput,
  MaintenanceRetryCountSetInput,
  MaintenanceRetryIntervalMinutesSetInput,
  nodeState_t,
};
export { globalSettings };
export default globalSettingsStore;
