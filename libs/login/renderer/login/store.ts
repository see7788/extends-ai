import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { login as producer } from "login-main/login/store.ts";

type LoginSlice = {
  login: ReturnType<typeof producer.loginValidator.parse>;
  loginActions: {
    stateSet(input: ReturnType<typeof producer.loginValidator.parse>): void;
  };
};

const loginStore: ImmerStateCreator<LoginSlice> = set => ({
  login: structuredClone(producer.initial),
  loginActions: {
    stateSet(input) {
      set(state => {
        state.login = structuredClone(input);
      });
    },
  },
});

export { producer as login };
export default loginStore;
