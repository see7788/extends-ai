import { browser } from "browser-partition-main/browser/public.ts";
import { z } from "zod";

const sourceValidator = z.object({
  sourceFileName: z.literal("auth.json"),
  sourcePath: z.string().trim().min(1),
  sourceText: z.string().min(1),
});
const authJsonCreateValidator = z.object({
  activeBrowserId: browser.browserIdValidator.nullable(),
  authorizationExpiresAt: z.string().min(1).nullable(),
  authorizationTimeoutSeconds: z.number().int().min(1).max(3_600),
  history: z.record(browser.browserIdValidator, z.object({
    browserId: browser.browserIdValidator,
    completedAt: z.string().min(1),
  })),
  status: z.enum(["idle", "working"]),
});
const createInputValidator = z.object({ browserId: browser.browserIdValidator });
const authJsonCreate = {
  authJsonCreateValidator,
  channel: {
    cancel: "account-add:auth-json-create:cancel",
    create: "account-add:auth-json-create:create",
    stateRead: "account-add:auth-json-create:state-read",
    stateUpdated: "account-add:auth-json-create:state-updated",
  },
  initial: {
    activeBrowserId: null,
    authorizationExpiresAt: null,
    authorizationTimeoutSeconds: 59,
    history: {},
    status: "idle",
  } satisfies z.infer<typeof authJsonCreateValidator>,
  input: {
    command: z.object({}),
    create: createInputValidator,
  },
  result: {
    cancel: z.object({ canceled: z.boolean() }),
    create: z.object({ created: z.boolean() }),
  },
  sourceValidator,
};

type AuthJsonCreateInput = z.infer<typeof createInputValidator>;

export { authJsonCreate, type AuthJsonCreateInput };
