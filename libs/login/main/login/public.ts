import { z } from "zod";

const loginValidator = z.object({
  partition: z.string().trim().min(1).nullable(),
  status: z.enum(["idle", "open"]),
});
const operationStartValidator = loginValidator.pick({ partition: true });
const login = {
  channel: {
    cancel: "login:login:cancel",
    start: "login:login:start",
    stateRead: "login:login:state-read",
    stateUpdated: "login:login:state-updated",
  },
  initial: { partition: null, status: "idle" } satisfies z.infer<typeof loginValidator>,
  input: {
    command: z.object({}),
    operationStart: operationStartValidator,
  },
  loginValidator,
  result: {
    cancel: z.object({ canceled: z.boolean() }),
    start: z.object({ completed: z.boolean() }),
  },
};

export { login, operationStartValidator };
