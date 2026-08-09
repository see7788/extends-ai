import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { account as producer } from "codex-app-server-main/accountList/account/store.ts";
import { z } from "zod";

const accountValidator = producer.accountStateValidator;
type Account = z.infer<typeof producer.accountValidator>;
type AccountState = z.infer<typeof accountValidator>;
type AccountEnabledSetInput = z.infer<typeof producer.input.enabledSet>;
type AccountLabelSetInput = z.infer<typeof producer.input.labelSet>;
type AccountOfficialOpenInput = z.infer<typeof producer.input.officialOpen>;
type AccountSlice = {
  account: AccountState;
  accountActions: {
    stateSet(input: AccountState): void;
  };
};

const account = {
  accountIdValidator: producer.accountIdValidator,
  accountValidator,
  channel: producer.channel,
  input: producer.input,
  resultValidator: producer.resultValidator,
};
const accountStore: ImmerStateCreator<AccountSlice> = set => ({
  account: structuredClone(producer.initial),
  accountActions: {
    stateSet(input) {
      const value = accountValidator.parse(input);
      set(state => {
        state.account = value;
      });
    },
  },
});

export {
  account,
  type Account,
  type AccountEnabledSetInput,
  type AccountLabelSetInput,
  type AccountOfficialOpenInput,
};
export default accountStore;
