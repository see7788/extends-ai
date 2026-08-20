import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";
import {
  globalSettings as producer,
  type GlobalSettings as GlobalSettingsInput,
  type MaintenanceEnabledSetInput,
  type MaintenanceIntervalHoursSetInput,
  type MaintenanceRetryCountSetInput,
  type MaintenanceRetryIntervalMinutesSetInput,
} from "codex-app-server-main/globalSettings/store.ts";
import type { IpcSlice } from "browser-partition-renderer/public.ts";
import { z } from "zod";
import { accountList } from "codex-app-server-main/accountList/store.ts";

const globalSettingsValidator = producer.globalSettingsValidator;
const globalSettingsStateValidator = globalSettingsValidator.extend({
  codexHomeVisible: z.boolean(),
});
const codexHomeVisibleSetValidator = globalSettingsStateValidator.pick({
  codexHomeVisible: true,
});
type GlobalSettings = z.infer<typeof globalSettingsStateValidator>;
type GlobalSettingsSlice = {
  globalSettings: GlobalSettings;
  globalSettingsActions: {
    connect(): () => void;
    codexHomeDefaultRestore(): Promise<void>;
    codexHomeSelect(): Promise<void>;
    codexHomeVisibleSet(input: z.infer<typeof codexHomeVisibleSetValidator>): void;
    maintenanceEnabledSet(input: MaintenanceEnabledSetInput): Promise<void>;
    maintenanceIntervalHoursSet(input: MaintenanceIntervalHoursSetInput): Promise<void>;
    maintenanceRetryCountSet(input: MaintenanceRetryCountSetInput): Promise<void>;
    maintenanceRetryIntervalMinutesSet(input: MaintenanceRetryIntervalMinutesSetInput): Promise<void>;
    stateSet(input: GlobalSettingsInput): void;
  };
};

const globalSettingsStore: ImmerStateCreator<
  GlobalSettingsSlice,
  IpcSlice
> = (set, get) => ({
  globalSettings: globalSettingsStateValidator.parse({
    ...structuredClone(producer.initial),
    codexHomeVisible: false,
  }),
  globalSettingsActions: {
    connect() {
      void get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "stateRead" as const },
        inputValidator: producer.requestValidator,
        resultValidator: producer.globalSettingsValidator,
      }).then(get().globalSettingsActions.stateSet).catch(console.error);
      return get().ipcActions.subscribe({
        channel: producer.channel,
        resultValidator: producer.messageValidator,
        run: message => get().globalSettingsActions.stateSet(message.value),
      });
    },
    async codexHomeDefaultRestore() {
      await get().ipcActions.invoke({
        channel: accountList.channel,
        input: { method: "codexHomeDefaultRestore" as const },
        inputValidator: accountList.request.codexHomeDefaultRestore,
        resultValidator: accountList.result.command,
      });
    },
    async codexHomeSelect() {
      await get().ipcActions.invoke({
        channel: accountList.channel,
        input: { method: "codexHomeSelect" as const },
        inputValidator: accountList.request.codexHomeSelect,
        resultValidator: accountList.result.command,
      });
    },
    codexHomeVisibleSet(input) {
      const value = codexHomeVisibleSetValidator.parse(input);
      set(state => {
        state.globalSettings.codexHomeVisible = value.codexHomeVisible;
      });
    },
    async maintenanceEnabledSet(input) {
      await get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "maintenanceEnabledSet" as const, ...input },
        inputValidator: producer.requestValidator,
        resultValidator: producer.resultValidator,
      });
    },
    async maintenanceIntervalHoursSet(input) {
      await get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "maintenanceIntervalHoursSet" as const, ...input },
        inputValidator: producer.requestValidator,
        resultValidator: producer.resultValidator,
      });
    },
    async maintenanceRetryCountSet(input) {
      await get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "maintenanceRetryCountSet" as const, ...input },
        inputValidator: producer.requestValidator,
        resultValidator: producer.resultValidator,
      });
    },
    async maintenanceRetryIntervalMinutesSet(input) {
      await get().ipcActions.invoke({
        channel: producer.channel,
        input: { method: "maintenanceRetryIntervalMinutesSet" as const, ...input },
        inputValidator: producer.requestValidator,
        resultValidator: producer.resultValidator,
      });
    },
    stateSet(input) {
      const value = globalSettingsValidator.parse(input);
      set(state => {
        Object.assign(state.globalSettings, value);
      });
    },
  },
});

export default globalSettingsStore;
