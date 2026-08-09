import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { rateLimits as producer } from "codex-app-server-main/accountList/rateLimits/store.ts";
import { z } from "zod";

const rateLimitsValidator = producer.rateLimitsValidator;
type RateLimits = z.infer<typeof rateLimitsValidator>;
type RateLimitsReadInput = z.infer<typeof producer.input.command>;
type RateLimitsSlice = {
  rateLimits: RateLimits;
  rateLimitsActions: {
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
