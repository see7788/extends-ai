import { authJsonCreate } from "codex-app-server-main/accountAdd/authJsonCreate/store.ts";
import browserIndex from "browser-partition-renderer/browser/index.ts";
import { z } from "zod";
import { invoke } from "browser-partition-renderer/public.ts";

type BrowserApplication = Awaited<ReturnType<typeof browserIndex.applicationsRead>>[number];

const authJsonCreateIndex = {
  applicationsRead(): Promise<BrowserApplication[]> {
    return browserIndex.applicationsRead(invoke);
  },
  async cancel(): Promise<boolean> {
    const result = await invoke({
      channel: authJsonCreate.channel.cancel,
      input: {},
      inputValidator: authJsonCreate.input.command,
      resultValidator: authJsonCreate.result.cancel,
    });
    return result.canceled;
  },
  async create(input: z.infer<typeof authJsonCreate.input.create>): Promise<boolean> {
    const result = await invoke({
      channel: authJsonCreate.channel.create,
      input,
      inputValidator: authJsonCreate.input.create,
      resultValidator: authJsonCreate.result.create,
    });
    return result.created;
  },
};

export default authJsonCreateIndex;
