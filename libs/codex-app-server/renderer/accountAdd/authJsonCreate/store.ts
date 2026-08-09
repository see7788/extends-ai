import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { authJsonCreate as producer } from "codex-app-server-main/accountAdd/authJsonCreate/store.ts";

type AuthJsonCreate = ReturnType<typeof producer.authJsonCreateValidator.parse>;
type AuthJsonCreateSlice = {
  authJsonCreate: AuthJsonCreate;
  authJsonCreateActions: {
    stateSet(input: AuthJsonCreate): void;
  };
};

const authJsonCreateStore: ImmerStateCreator<AuthJsonCreateSlice> = set => ({
  authJsonCreate: structuredClone(producer.initial),
  authJsonCreateActions: {
    stateSet(input) {
      set(state => {
        state.authJsonCreate = structuredClone(input);
      });
    },
  },
});

export { producer as authJsonCreate };
export default authJsonCreateStore;
