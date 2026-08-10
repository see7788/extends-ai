import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import type { WebContents } from "electron";
import { z } from "zod";

const accountIdValidator = z.string().regex(/^[a-f0-9]{24}$/);
const partitionValidator = z.string().regex(
  /^persist:codex-app-server\.account\.[a-z0-9-]{1,80}$/,
);
const webAccessValidator = z.object({
  type: z.literal("electron"),
  partition: partitionValidator,
});
const accountValidator = z.object({
  id: accountIdValidator,
  label: z.string().trim().min(1).max(120),
  enabled: z.boolean(),
  importedAt: z.string().datetime({ offset: true }),
  sourceFileName: z.string().trim().min(1).max(255),
  webAccess: webAccessValidator.nullable().default(null),
});
const accountStateValidator = z.record(accountIdValidator, accountValidator);
const readValidator = z.object({ accountId: accountIdValidator });
const labelSetValidator = readValidator.extend({
  label: z.string().trim().min(1).max(120),
});
const enabledSetValidator = readValidator.extend({ enabled: z.boolean() });
const resultValidator = z.object({ ok: z.literal(true) });

type Account = z.infer<typeof accountValidator>;
type WebAccess = z.infer<typeof webAccessValidator>;
type AccountState = z.infer<typeof accountStateValidator>;
type LabelSetInput = z.infer<typeof labelSetValidator>;
type EnabledSetInput = z.infer<typeof enabledSetValidator>;
type AccountSlice = {
  account: AccountState;
  accountActions: {
    accountSet(input: Account): void;
    accountDelete(input: z.infer<typeof readValidator>): void;
    enabledClear(): void;
    normalize(): void;
    labelSet(input: LabelSetInput): void;
    enabledSet(input: EnabledSetInput): void;
  };
};

const initial: AccountState = {};
const account = {
  accountIdValidator,
  accountStateValidator,
  accountValidator,
  channel: {
    enabledSet: "account-list:account-enabled-set",
    labelSet: "account-list:account-label-set",
    officialOpen: "account-list:account-official-open",
    stateRead: "account-list:account-state-read",
    stateUpdated: "account-list:account-state-updated",
  },
  initial,
  input: {
    enabledSet: enabledSetValidator,
    labelSet: labelSetValidator,
    officialOpen: readValidator,
    read: readValidator,
  },
  webAccessValidator,
  resultValidator,
};

const accountStore: ImmerStateCreator<
  AccountSlice,
  { webContents?: WebContents }
> = (set, get) => {
  const stateSend = (): void => get().webContents?.send(
    account.channel.stateUpdated,
    accountStateValidator.parse(get().account),
  );
  return ({
  account: structuredClone(initial),
  accountActions: {
    accountSet(input) {
      const value = accountValidator.parse(input);
      set(state => {
        if (value.enabled) {
          for (const current of Object.values(state.account)) {
            current.enabled = false;
          }
        }
        state.account[value.id] = value;
      });
      stateSend();
    },
    accountDelete(input) {
      const { accountId } = readValidator.parse(input);
      set(state => {
        delete state.account[accountId];
      });
      stateSend();
    },
    enabledClear() {
      set(state => {
        for (const item of Object.values(state.account)) item.enabled = false;
      });
      stateSend();
    },
    normalize() {
      const value = accountStateValidator.parse(get().account);
      set(state => {
        state.account = value;
      });
      stateSend();
    },
    labelSet(input) {
      const value = labelSetValidator.parse(input);
      set(state => {
        const current = state.account[value.accountId];
        if (!current) throw new Error(`账号不存在: ${value.accountId}`);
        current.label = value.label;
      });
      stateSend();
    },
    enabledSet(input) {
      const value = enabledSetValidator.parse(input);
      set(state => {
        const current = state.account[value.accountId];
        if (!current) throw new Error(`账号不存在: ${value.accountId}`);
        if (!value.enabled) return;
        for (const item of Object.values(state.account)) {
          item.enabled = item.id === value.accountId;
        }
      });
      stateSend();
    },
  },
  });
};

export { account, type WebAccess };
export default accountStore;
