import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { globalSettings as producer } from "codex-app-server-main/globalSettings/store.ts";
import { invoke } from "browser-partition-renderer/public.ts";
import { z } from "zod";

const globalSettingsValidator = producer.globalSettingsValidator;
const globalSettingsStateValidator = globalSettingsValidator.extend({
  codexHomeVisible: z.boolean(),
});
const codexHomeVisibleSetValidator = globalSettingsStateValidator.pick({
  codexHomeVisible: true,
});
type GlobalSettings = z.infer<typeof globalSettingsStateValidator>;
type GlobalSettingsInput = z.infer<typeof globalSettingsValidator>;
type GlobalSettingsSlice = {
  globalSettings: GlobalSettings;
  globalSettingsActions: {
    codexHomeDefaultRestore(): Promise<void>;
    codexHomeDelete(): Promise<void>;
    codexHomeSet(input: z.infer<typeof producer.input.codexHomeSet>): Promise<void>;
    codexHomeVisibleSet(input: z.infer<typeof codexHomeVisibleSetValidator>): void;
    maintenanceEnabledSet(input: z.infer<typeof producer.input.maintenanceEnabledSet>): Promise<void>;
    maintenanceIntervalHoursSet(
      input: z.infer<typeof producer.input.maintenanceIntervalHoursSet>,
    ): Promise<void>;
    maintenanceRetryCountSet(
      input: z.infer<typeof producer.input.maintenanceRetryCountSet>,
    ): Promise<void>;
    maintenanceRetryIntervalMinutesSet(
      input: z.infer<typeof producer.input.maintenanceRetryIntervalMinutesSet>,
    ): Promise<void>;
    stateSet(input: GlobalSettingsInput): void;
  };
};

const globalSettings = {
  channel: producer.channel,
  globalSettingsValidator,
  input: producer.input,
  resultValidator: producer.resultValidator,
};

const globalSettingsStore: ImmerStateCreator<GlobalSettingsSlice> = set => ({
  globalSettings: globalSettingsStateValidator.parse({
    ...structuredClone(producer.initial),
    codexHomeVisible: false,
  }),
  globalSettingsActions: {
    async codexHomeDefaultRestore() {
      await invoke({
        channel: globalSettings.channel.codexHomeDefaultRestore,
        input: {},
        inputValidator: globalSettings.input.command,
        resultValidator: globalSettings.resultValidator,
      });
    },
    async codexHomeDelete() {
      await invoke({
        channel: globalSettings.channel.codexHomeDelete,
        input: {},
        inputValidator: globalSettings.input.command,
        resultValidator: globalSettings.resultValidator,
      });
    },
    async codexHomeSet(input) {
      await invoke({
        channel: globalSettings.channel.codexHomeSet,
        input,
        inputValidator: globalSettings.input.codexHomeSet,
        resultValidator: globalSettings.resultValidator,
      });
    },
    codexHomeVisibleSet(input) {
      const value = codexHomeVisibleSetValidator.parse(input);
      set(state => {
        state.globalSettings.codexHomeVisible = value.codexHomeVisible;
      });
    },
    async maintenanceEnabledSet(input) {
      await invoke({
        channel: globalSettings.channel.maintenanceEnabledSet,
        input,
        inputValidator: globalSettings.input.maintenanceEnabledSet,
        resultValidator: globalSettings.resultValidator,
      });
    },
    async maintenanceIntervalHoursSet(input) {
      await invoke({
        channel: globalSettings.channel.maintenanceIntervalHoursSet,
        input,
        inputValidator: globalSettings.input.maintenanceIntervalHoursSet,
        resultValidator: globalSettings.resultValidator,
      });
    },
    async maintenanceRetryCountSet(input) {
      await invoke({
        channel: globalSettings.channel.maintenanceRetryCountSet,
        input,
        inputValidator: globalSettings.input.maintenanceRetryCountSet,
        resultValidator: globalSettings.resultValidator,
      });
    },
    async maintenanceRetryIntervalMinutesSet(input) {
      await invoke({
        channel: globalSettings.channel.maintenanceRetryIntervalMinutesSet,
        input,
        inputValidator: globalSettings.input.maintenanceRetryIntervalMinutesSet,
        resultValidator: globalSettings.resultValidator,
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

export { globalSettings };
export default globalSettingsStore;
