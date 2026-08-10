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
const commandValidator = z.object({});
const resultValidator = z.object({ ok: z.literal(true) });

type GlobalSettings = z.infer<typeof globalSettingsValidator>;
type GlobalSettingsSlice = {
  globalSettings: GlobalSettings;
  globalSettingsActions: {
    codexHomeSet(input: z.infer<typeof codexHomeSetValidator>): void;
    install(): () => void;
    initialize(input: GlobalSettings): void;
    maintenanceEnabledSet(input: z.infer<typeof maintenanceEnabledSetValidator>): void;
    maintenanceIntervalHoursSet(input: z.infer<typeof maintenanceIntervalHoursSetValidator>): void;
    maintenanceRetryCountSet(input: z.infer<typeof maintenanceRetryCountSetValidator>): void;
    maintenanceRetryIntervalMinutesSet(input: z.infer<typeof maintenanceRetryIntervalMinutesSetValidator>): void;
  };
};

const initial: GlobalSettings = {
  codexHome: "",
  maintenanceEnabled: false,
  maintenanceIntervalHours: 48,
  maintenanceRetryCount: 2,
  maintenanceRetryIntervalMinutes: 15,
};
const globalSettings = {
  channel: {
    codexHomeSelect: "global-settings:codex-home-select",
    codexHomeDefaultRestore: "global-settings:codex-home-default-restore",
    maintenanceEnabledSet: "global-settings:maintenance-enabled-set",
    maintenanceIntervalHoursSet: "global-settings:maintenance-interval-hours-set",
    maintenanceRetryCountSet: "global-settings:maintenance-retry-count-set",
    maintenanceRetryIntervalMinutesSet: "global-settings:maintenance-retry-interval-minutes-set",
    stateRead: "global-settings:state-read",
    stateUpdated: "global-settings:state-updated",
  },
  globalSettingsValidator,
  initial,
  input: {
    codexHomeSet: codexHomeSetValidator,
    command: commandValidator,
    maintenanceEnabledSet: maintenanceEnabledSetValidator,
    maintenanceIntervalHoursSet: maintenanceIntervalHoursSetValidator,
    maintenanceRetryCountSet: maintenanceRetryCountSetValidator,
    maintenanceRetryIntervalMinutesSet: maintenanceRetryIntervalMinutesSetValidator,
  },
  resultValidator,
};

const globalSettingsStore: ImmerStateCreator<
  GlobalSettingsSlice,
  { webContents?: WebContents }
> = (set, get) => {
  const stateSend = (): void => get().webContents?.send(
    globalSettings.channel.stateUpdated,
    globalSettingsValidator.parse(get().globalSettings),
  );
  return ({
  globalSettings: structuredClone(initial),
  globalSettingsActions: {
    codexHomeSet(input) {
      const value = codexHomeSetValidator.parse(input);
      set(state => {
        state.globalSettings.codexHome = value.codexHome;
      });
      stateSend();
    },
    install() {
      const contents = get().webContents;
      if (!contents || contents.isDestroyed()) {
        throw new Error("CodexAppServer WebContents 不可用");
      }
      contents.ipc.handle(
        globalSettings.channel.maintenanceEnabledSet,
        (_event, input: unknown) => {
          get().globalSettingsActions.maintenanceEnabledSet(
            maintenanceEnabledSetValidator.parse(input),
          );
          return resultValidator.parse({ ok: true });
        },
      );
      contents.ipc.handle(
        globalSettings.channel.maintenanceIntervalHoursSet,
        (_event, input: unknown) => {
          get().globalSettingsActions.maintenanceIntervalHoursSet(
            maintenanceIntervalHoursSetValidator.parse(input),
          );
          return resultValidator.parse({ ok: true });
        },
      );
      contents.ipc.handle(
        globalSettings.channel.maintenanceRetryCountSet,
        (_event, input: unknown) => {
          get().globalSettingsActions.maintenanceRetryCountSet(
            maintenanceRetryCountSetValidator.parse(input),
          );
          return resultValidator.parse({ ok: true });
        },
      );
      contents.ipc.handle(
        globalSettings.channel.maintenanceRetryIntervalMinutesSet,
        (_event, input: unknown) => {
          get().globalSettingsActions.maintenanceRetryIntervalMinutesSet(
            maintenanceRetryIntervalMinutesSetValidator.parse(input),
          );
          return resultValidator.parse({ ok: true });
        },
      );
      contents.ipc.handle(globalSettings.channel.stateRead, () => (
        globalSettingsValidator.parse(get().globalSettings)
      ));
      return () => {
        contents.ipc.removeHandler(globalSettings.channel.maintenanceEnabledSet);
        contents.ipc.removeHandler(globalSettings.channel.maintenanceIntervalHoursSet);
        contents.ipc.removeHandler(globalSettings.channel.maintenanceRetryCountSet);
        contents.ipc.removeHandler(globalSettings.channel.maintenanceRetryIntervalMinutesSet);
        contents.ipc.removeHandler(globalSettings.channel.stateRead);
      };
    },
    initialize(input) {
      const value = globalSettingsValidator.parse(input);
      set(state => {
        state.globalSettings = value;
      });
      stateSend();
    },
    maintenanceEnabledSet(input) {
      const value = maintenanceEnabledSetValidator.parse(input);
      set(state => {
        state.globalSettings.maintenanceEnabled = value.maintenanceEnabled;
      });
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
  });
};

export type { GlobalSettingsSlice };
export { globalSettings };
export default globalSettingsStore;
