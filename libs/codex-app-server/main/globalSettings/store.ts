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
  z.object({ method: z.literal("codexHomeSelect") }),
  z.object({ method: z.literal("codexHomeDefaultRestore") }),
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
    codexHomeSet(input: CodexHomeSetInput): void;
    initialize(input: GlobalSettings): void;
    maintenanceEnabledSet(input: MaintenanceEnabledSetInput): void;
    maintenanceIntervalHoursSet(input: MaintenanceIntervalHoursSetInput): void;
    maintenanceRetryCountSet(input: MaintenanceRetryCountSetInput): void;
    maintenanceRetryIntervalMinutesSet(input: MaintenanceRetryIntervalMinutesSetInput): void;
  };
};
type nodeState_t = { webContents?: WebContents };

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
  return {
    globalSettings: structuredClone(initial),
    globalSettingsActions: {
      codexHomeSet(input) {
        const value = codexHomeSetValidator.parse(input);
        set(state => { state.globalSettings.codexHome = value.codexHome; });
        stateSend();
      },
      initialize(input) {
        const value = globalSettingsValidator.parse(input);
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
