import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { rateLimits as producer } from "codex-app-server-main/accountList/rateLimits/store.ts";
import { invoke } from "browser-partition-renderer/public.ts";
import { z } from "zod";

const rateLimitsValidator = producer.rateLimitsValidator;
type RateLimits = z.infer<typeof rateLimitsValidator>;
type RateLimitsReadInput = z.infer<typeof producer.input.command>;
type RateLimitsSlice = {
  rateLimits: RateLimits;
  rateLimitsActions: {
    read(input: RateLimitsReadInput): Promise<void>;
    stateSet(input: RateLimits): void;
  };
};

const rateLimits = {
  channel: producer.channel,
  commandResultValidator: producer.commandResultValidator,
  input: producer.input,
  rateLimitsValidator,
};
const rateLimitsStore: ImmerStateCreator<RateLimitsSlice> = set => ({
  rateLimits: structuredClone(producer.initial),
  rateLimitsActions: {
    async read(input) {
      await invoke({
        channel: rateLimits.channel.read,
        input,
        inputValidator: rateLimits.input.command,
        resultValidator: rateLimits.commandResultValidator,
      });
    },
    stateSet(input) {
      const value = rateLimitsValidator.parse(input);
      set(state => {
        state.rateLimits = value;
      });
    },
  },
});

export { rateLimits, type RateLimitsReadInput };
export default rateLimitsStore;
