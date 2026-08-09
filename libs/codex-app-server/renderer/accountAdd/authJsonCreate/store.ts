import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { browser } from "browser-partition-main/browser/store.ts";
import { z } from "zod";

const authJsonCreateValidator = z.object({
  applications: browser.browserApplicationsValidator,
  browserLoading: z.boolean(),
  pending: z.enum(["browser", "electron"]).nullable(),
});
const applicationsSetValidator = authJsonCreateValidator.pick({ applications: true });
const browserLoadingSetValidator = authJsonCreateValidator.pick({ browserLoading: true });
const pendingSetValidator = authJsonCreateValidator.pick({ pending: true });

type AuthJsonCreate = z.infer<typeof authJsonCreateValidator>;
type AuthJsonCreateSlice = {
  authJsonCreate: AuthJsonCreate;
  authJsonCreateActions: {
    applicationsSet(input: z.infer<typeof applicationsSetValidator>): void;
    browserLoadingSet(input: z.infer<typeof browserLoadingSetValidator>): void;
    pendingSet(input: z.infer<typeof pendingSetValidator>): void;
  };
};

const initial: AuthJsonCreate = {
  applications: [],
  browserLoading: false,
  pending: null,
};
const authJsonCreate = {
  authJsonCreateValidator,
  initial,
  input: {
    applicationsSet: applicationsSetValidator,
    browserLoadingSet: browserLoadingSetValidator,
    pendingSet: pendingSetValidator,
  },
};

const authJsonCreateStore: ImmerStateCreator<AuthJsonCreateSlice> = set => ({
  authJsonCreate: structuredClone(initial),
  authJsonCreateActions: {
    applicationsSet(input) {
      const value = applicationsSetValidator.parse(input);
      set(state => {
        state.authJsonCreate.applications = value.applications;
      });
    },
    browserLoadingSet(input) {
      const value = browserLoadingSetValidator.parse(input);
      set(state => {
        state.authJsonCreate.browserLoading = value.browserLoading;
      });
    },
    pendingSet(input) {
      const value = pendingSetValidator.parse(input);
      set(state => {
        state.authJsonCreate.pending = value.pending;
      });
    },
  },
});

export { authJsonCreate };
export default authJsonCreateStore;
