import { browser } from "browser-partition-main/browser/public.ts";
import { z } from "zod";

const accountStatusValidator = z.enum(["valid", "expired", "unknown"]);
const accountSourceValidator = z.object({
  browserId: browser.browserIdValidator,
  browserName: z.string().trim().min(1).max(120),
  importedAt: z.string().datetime({ offset: true }),
});
const accountValidator = z.object({
  checkedAt: z.string().datetime({ offset: true }),
  email: z.string().email(),
  error: z.string().nullable(),
  partition: z.string().trim().min(1),
  sources: z.array(accountSourceValidator),
  status: accountStatusValidator,
});
const accountsValidator = z.object({
  byEmail: z.record(z.string().email(), accountValidator),
  order: z.array(z.string().email()),
});
const accountSetValidator = accountValidator;
const accountStatusSetValidator = accountValidator.pick({
  checkedAt: true,
  email: true,
  error: true,
  status: true,
});
const emailValidator = accountValidator.pick({ email: true });
const candidateValidator = z.object({
  partition: z.string().trim().min(1),
  source: accountSourceValidator.omit({ importedAt: true }).optional(),
});
const accountSessionValidator = z.object({
  user: z.object({ email: z.string().email() }).passthrough().nullable().optional(),
}).passthrough();

const accounts = {
  accountSessionValidator,
  accountStatusValidator,
  accountValidator,
  accountsValidator,
  channel: {
    cookieImportConsume: "login:accounts:cookie-import-consume",
    open: "login:accounts:open",
    remove: "login:accounts:remove",
    stateRead: "login:accounts:state-read",
    stateUpdated: "login:accounts:state-updated",
    validate: "login:accounts:validate",
  },
  initial: { byEmail: {}, order: [] } satisfies z.infer<typeof accountsValidator>,
  input: {
    candidate: candidateValidator,
    command: z.object({}),
    email: emailValidator,
  },
  result: {
    account: z.object({ account: accountValidator.nullable() }),
    command: z.object({ completed: z.boolean() }),
  },
};

export {
  accountSetValidator,
  accountStatusSetValidator,
  accounts,
  candidateValidator,
  emailValidator,
};
