import { browser } from "browser-partition-main/browser/store.ts";
import { z, type ZodType } from "zod";

type BrowserApplication = z.infer<typeof browser.browserApplicationsValidator>[number];
type Invoke = <TInput, TResult>(options: {
  channel: string;
  input: TInput;
  inputValidator: ZodType<TInput>;
  resultValidator: ZodType<TResult>;
}) => Promise<TResult>;

const browserIndex = {
  async applicationsRead(invoke: Invoke): Promise<BrowserApplication[]> {
    return invoke({
      channel: browser.channel.applicationsRead,
      input: {},
      inputValidator: browser.input.command,
      resultValidator: browser.browserApplicationsValidator,
    });
  },
};

export default browserIndex;
