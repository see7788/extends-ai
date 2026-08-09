import { browser } from "browser-partition-main/browser/store.ts";
import { z, type ZodType } from "zod";

type BrowserApplication = z.infer<typeof browser.browserApplicationsValidator>[number];
type Invoke = <TInput, TResult>(options: {
  channel: string;
  input: TInput;
  inputValidator: ZodType<TInput>;
  resultValidator: ZodType<TResult>;
}) => Promise<TResult>;

const applicationsRead = (invoke: Invoke): Promise<BrowserApplication[]> => invoke({
  channel: browser.channel.applicationsRead,
  input: {},
  inputValidator: browser.input.command,
  resultValidator: browser.browserApplicationsValidator,
});

export default applicationsRead;
