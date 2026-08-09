import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { globalSettings as producer } from "codex-app-server-main/globalSettings/store.ts";
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
    codexHomeVisibleSet(input: z.infer<typeof codexHomeVisibleSetValidator>): void;
    stateSet(input: GlobalSettingsInput): void;
  };
};

const globalSettings = {
  channel: producer.channel,
  globalSettingsValidator,
  input: producer.input,
  resultValidator: producer.resultValidator,
};

const globalSettingsStore: ImmerStateCreator<GlobalSettingsSlice> = (set, get) => ({
  globalSettings: globalSettingsStateValidator.parse({
    ...structuredClone(producer.initial),
    codexHomeVisible: false,
  }),
  globalSettingsActions: {
    codexHomeVisibleSet(input) {
      const value = codexHomeVisibleSetValidator.parse(input);
      set(state => {
        state.globalSettings.codexHomeVisible = value.codexHomeVisible;
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
