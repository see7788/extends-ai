import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { z } from "zod";

const loginValidator = z.object({
  partition: z.string().trim().min(1).nullable(),
  status: z.enum(["idle", "open"]),
});
const operationStartValidator = loginValidator.pick({ partition: true });
const commandValidator = z.object({});
type Login = z.infer<typeof loginValidator>;
type LoginSlice = {
  login: Login;
  loginActions: {
    operationCancel(): void;
    operationSucceed(): void;
    operationStart(input: z.infer<typeof operationStartValidator>): void;
  };
};

const initial: Login = { partition: null, status: "idle" };
const login = {
  channel: {
    cancel: "login:login:cancel",
    start: "login:login:start",
    stateRead: "login:login:state-read",
    stateUpdated: "login:login:state-updated",
  },
  initial,
  input: {
    command: commandValidator,
    operationStart: operationStartValidator,
  },
  loginValidator,
  result: {
    cancel: z.object({ canceled: z.boolean() }),
    start: z.object({ completed: z.boolean() }),
  },
};

const loginStore: ImmerStateCreator<LoginSlice> = set => ({
  login: structuredClone(initial),
  loginActions: {
    operationCancel() {
      set(state => {
        state.login = structuredClone(initial);
      });
    },
    operationSucceed() {
      set(state => {
        if (state.login.status === "open" && state.login.partition) {
          state.login = structuredClone(initial);
        }
      });
    },
    operationStart(input) {
      const value = operationStartValidator.parse(input);
      set(state => {
        state.login = { partition: value.partition, status: "open" };
      });
    },
  },
});

export { login };
export default loginStore;
