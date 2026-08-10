import { browser } from "browser-partition-main/browser/public.ts";
import { z } from "zod";

const candidateValidator = z.object({
  browserId: browser.browserIdValidator,
  browserName: z.string().trim().min(1).max(120),
  partition: z.string().trim().min(1),
});
const importHistoryValidator = z.record(
  browser.browserIdValidator,
  candidateValidator.omit({ partition: true }).extend({
    importedAt: z.string().datetime({ offset: true }),
  }),
);
const cookieImportValidator = z.object({
  activeBrowserId: browser.browserIdValidator.nullable(),
  authorizationExpiresAt: z.string().datetime({ offset: true }).nullable(),
  authorizationTimeoutSeconds: z.number().int().min(1).max(3_600),
  candidate: candidateValidator.nullable(),
  error: z.string().nullable(),
  errorBrowserId: browser.browserIdValidator.nullable(),
  history: importHistoryValidator.default({}),
  status: z.enum(["idle", "working", "ready", "error"]),
});
const createValidator = z.object({ browserId: browser.browserIdValidator });
const candidateClearValidator = candidateValidator.pick({ partition: true });
const authorizationTimeoutSecondsSetValidator = cookieImportValidator.pick({
  authorizationTimeoutSeconds: true,
});
const authorizationStartValidator = z.object({
  expiresAt: z.string().datetime({ offset: true }),
});
const operationFailValidator = z.object({ error: z.string().min(1) });
const devToolsMessageValidator = z.object({
  id: z.number().int().positive().optional(),
  sessionId: z.string().min(1).optional(),
  result: z.unknown().optional(),
  error: z.object({
    code: z.number().int(),
    message: z.string().min(1),
  }).passthrough().optional(),
}).passthrough();
const devToolsTargetsValidator = z.object({
  targetInfos: z.array(z.object({
    targetId: z.string().min(1),
    type: z.string().min(1),
    url: z.string(),
  }).passthrough()),
});
const devToolsAttachedValidator = z.object({ sessionId: z.string().min(1) });
const browserCookiesValidator = z.object({
  cookies: z.array(z.object({
    name: z.string().min(1).max(4096),
    value: z.string().max(1024 * 1024),
    domain: z.string().trim().min(1).max(255),
    path: z.string().max(4096),
    expires: z.number().finite(),
    httpOnly: z.boolean(),
    secure: z.boolean(),
    session: z.boolean(),
    sameSite: z.enum(["Strict", "Lax", "None"]).optional(),
    partitionKey: z.unknown().optional(),
  }).passthrough()).max(512),
});

const channel = "login:cookie-import";
const request = {
  authorizationTimeoutSecondsSet: z.object({
    method: z.literal("authorizationTimeoutSecondsSet"),
    input: authorizationTimeoutSecondsSetValidator,
  }),
  cancel: z.object({ method: z.literal("cancel") }),
  start: z.object({
    method: z.literal("start"),
    input: createValidator,
  }),
  stateRead: z.object({ method: z.literal("stateRead") }),
};
const requestValidator = z.discriminatedUnion("method", [
  request.authorizationTimeoutSecondsSet,
  request.cancel,
  request.start,
  request.stateRead,
]);
const result = {
  cancel: z.object({ canceled: z.boolean() }),
  setting: z.object({ updated: z.boolean() }),
  start: z.object({ completed: z.boolean() }),
};
type CookieImportContract = {
  candidateValidator: typeof candidateValidator;
  channel: typeof channel;
  cookieImportValidator: typeof cookieImportValidator;
  cookiesValidator: typeof browserCookiesValidator;
  devToolsAttachedValidator: typeof devToolsAttachedValidator;
  devToolsMessageValidator: typeof devToolsMessageValidator;
  devToolsTargetsValidator: typeof devToolsTargetsValidator;
  importHistoryValidator: typeof importHistoryValidator;
  initial: z.infer<typeof cookieImportValidator>;
  input: {
    authorizationStart: typeof authorizationStartValidator;
    authorizationTimeoutSecondsSet: typeof authorizationTimeoutSecondsSetValidator;
    candidateClear: typeof candidateClearValidator;
    create: typeof createValidator;
    operationFail: typeof operationFailValidator;
  };
  request: typeof request;
  requestValidator: typeof requestValidator;
  result: typeof result;
};

const cookieImport = {
  candidateValidator,
  channel,
  cookieImportValidator,
  cookiesValidator: browserCookiesValidator,
  devToolsAttachedValidator,
  devToolsMessageValidator,
  devToolsTargetsValidator,
  importHistoryValidator,
  initial: {
    activeBrowserId: null,
    authorizationExpiresAt: null,
    authorizationTimeoutSeconds: 59,
    candidate: null,
    error: null,
    errorBrowserId: null,
    history: {},
    status: "idle",
  } satisfies z.infer<typeof cookieImportValidator>,
  input: {
    authorizationStart: authorizationStartValidator,
    authorizationTimeoutSecondsSet: authorizationTimeoutSecondsSetValidator,
    candidateClear: candidateClearValidator,
    create: createValidator,
    operationFail: operationFailValidator,
  },
  request,
  requestValidator,
  result,
} satisfies CookieImportContract;

export {
  authorizationStartValidator,
  authorizationTimeoutSecondsSetValidator,
  candidateClearValidator,
  cookieImport,
  createValidator,
  operationFailValidator,
};
