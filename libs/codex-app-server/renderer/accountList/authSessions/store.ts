import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { authSessions as producer } from "codex-app-server-main/accountList/authSessions/store.ts";
import { z } from "zod";

const authSessionsValidator = producer.authSessionsValidator;
type AuthSessions = z.infer<typeof authSessionsValidator>;
type AuthSessionsCommandInput = z.infer<typeof producer.input.command>;
type AuthSessionsSlice = {
  authSessions: AuthSessions;
  authSessionsActions: {
    stateSet(input: AuthSessions): void;
  };
};

const authSessions = {
  authSessionsValidator,
  channel: producer.channel,
  input: producer.input,
  resultValidator: producer.resultValidator,
};
const authSessionsStore: ImmerStateCreator<AuthSessionsSlice> = set => ({
  authSessions: structuredClone(producer.initial),
  authSessionsActions: {
    stateSet(input) {
      const value = authSessionsValidator.parse(input);
      set(state => {
        state.authSessions = value;
      });
    },
  },
});

export { authSessions, type AuthSessionsCommandInput };
export default authSessionsStore;
