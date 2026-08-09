import { GlobalOutlined } from "@ant-design/icons";
import {
  App as AntdApp,
  BorderBeam,
  Button,
  Empty,
  Flex,
  Switch,
  theme,
  Typography,
} from "antd";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { errorText } from "../../public/index.ts";
import GlassCard from "../../public/GlassCard.tsx";
import store from "../../store.ts";
import {
  account as accountContract,
  type AccountEnabledSetInput,
  type AccountLabelSetInput,
  type AccountOfficialOpenInput,
} from "./store.ts";

const timeText = (value: string): string => new Date(value).toLocaleString("zh-CN");

const accountIndex = {
  async enabledSet(input: AccountEnabledSetInput): Promise<void> {
    await invoke({
      channel: accountContract.channel.enabledSet,
      input,
      inputValidator: accountContract.input.enabledSet,
      resultValidator: accountContract.resultValidator,
    });
    await accountIndex.stateRead();
  },
  async labelSet(input: AccountLabelSetInput): Promise<void> {
    await invoke({
      channel: accountContract.channel.labelSet,
      input,
      inputValidator: accountContract.input.labelSet,
      resultValidator: accountContract.resultValidator,
    });
    await accountIndex.stateRead();
  },
  async officialOpen(input: AccountOfficialOpenInput): Promise<void> {
    await invoke({
      channel: accountContract.channel.officialOpen,
      input,
      inputValidator: accountContract.input.officialOpen,
      resultValidator: accountContract.resultValidator,
    });
  },
  async stateRead(): Promise<void> {
    const state = await read({
      channel: accountContract.channel.stateRead,
      resultValidator: accountContract.accountValidator,
    });
    store.getState().accountActions.stateSet(state);
  },
  stateSubscribe(): () => void {
    return subscribe({
      channel: accountContract.channel.stateUpdated,
      resultValidator: accountContract.accountValidator,
      run: store.getState().accountActions.stateSet,
    });
  },
};

const useAccount = (): void => {
  const { message } = AntdApp.useApp();
  useEffect(() => {
    void accountIndex.stateRead().catch(error => {
      void message.error(errorText(error));
    });
    return accountIndex.stateSubscribe();
  }, []);
};

const Account = ({ accountId, actions, children, title }: {
  accountId: string;
  actions?: ReactNode;
  children?: ReactNode;
  title?: ReactNode;
}) => {
  const { message } = AntdApp.useApp();
  const account = useStore(store, state => state.account[accountId]);
  const { token } = theme.useToken();
  const colorPrimary = token.colorPrimary;
  const [officialOpening, setOfficialOpening] = useState(false);
  if (!account) return <GlassCard><Empty description="账号不存在或已移除" /></GlassCard>;
  const enabledSet = async (enabled: boolean): Promise<void> => {
    try {
      await accountIndex.enabledSet({ accountId, enabled });
    } catch (error) {
      void message.error(errorText(error));
    }
  };
  const officialOpen = async (): Promise<void> => {
    setOfficialOpening(true);
    try {
      await accountIndex.officialOpen({ accountId });
    } catch (error) {
      void message.error(errorText(error));
    } finally {
      setOfficialOpening(false);
    }
  };
  const card = (
    <GlassCard
      extra={(
        <Flex gap={4}>
          {actions}
          <Switch
            checked={account.enabled}
            checkedChildren="使用中"
            disabled={account.enabled}
            unCheckedChildren="启用"
            onChange={enabled => {
              if (enabled) void enabledSet(true);
            }}
          />
          {account.webAccess ? (
            <Button
              icon={<GlobalOutlined />}
              loading={officialOpening}
              style={{ color: account.enabled ? "#ffffff" : undefined }}
              type="text"
              onClick={() => void officialOpen()}
            >
              访问官网
            </Button>
          ) : null}
        </Flex>
      )}
      style={account.enabled ? {
        backdropFilter: "blur(22px) saturate(155%)",
        background: `color-mix(in srgb, ${colorPrimary} 72%, transparent)`,
        boxShadow: `0 18px 48px color-mix(in srgb, ${colorPrimary} 34%, transparent)`,
        color: "#ffffff",
        position: "relative",
        WebkitBackdropFilter: "blur(22px) saturate(155%)",
      } : undefined}
      title={title ?? <Typography.Text strong>{account.label}</Typography.Text>}
    >
      <Typography.Text style={{ color: "inherit" }}>
        来源：{account.sourceFileName} · 导入：{timeText(account.importedAt)}
      </Typography.Text>
      {children}
    </GlassCard>
  );
  return account.enabled ? (
    <BorderBeam
      color={[
        { color: colorPrimary, percent: 0 },
        { color: "#ffffff", percent: 50 },
        { color: colorPrimary, percent: 100 },
      ]}
      duration={7}
      lineWidth={2}
      outset={0}
      size={120}
    >
      {card}
    </BorderBeam>
  ) : card;
};

export { useAccount };
export default Account;
