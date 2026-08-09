import { GlobalOutlined } from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  ConfigProvider,
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
} from "./store.ts";

const timeText = (value: string): string => new Date(value).toLocaleString("zh-CN");

const useAccount = (): void => {
  const { message } = AntdApp.useApp();
  useEffect(() => {
    void read({
      channel: accountContract.channel.stateRead,
      resultValidator: accountContract.accountValidator,
    }).then(store.getState().accountActions.stateSet).catch(error => {
      void message.error(errorText(error));
    });
    return subscribe({
      channel: accountContract.channel.stateUpdated,
      resultValidator: accountContract.accountValidator,
      run: store.getState().accountActions.stateSet,
    });
  }, []);
};

const Account = ({ accountId, children, summary, title }: {
  accountId: string;
  children?: ReactNode;
  summary?: ReactNode;
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
      await invoke({
        channel: accountContract.channel.enabledSet,
        input: { accountId, enabled },
        inputValidator: accountContract.input.enabledSet,
        resultValidator: accountContract.resultValidator,
      });
      store.getState().accountActions.stateSet(await read({
        channel: accountContract.channel.stateRead,
        resultValidator: accountContract.accountValidator,
      }));
    } catch (error) {
      void message.error(errorText(error));
    }
  };
  const officialOpen = async (): Promise<void> => {
    setOfficialOpening(true);
    try {
      await invoke({
        channel: accountContract.channel.officialOpen,
        input: { accountId },
        inputValidator: accountContract.input.officialOpen,
        resultValidator: accountContract.resultValidator,
      });
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
              type="text"
              onClick={() => void officialOpen()}
            >
              访问官网
            </Button>
          ) : null}
        </Flex>
      )}
      style={account.enabled ? {
        background: colorPrimary,
        color: "#ffffff",
      } : undefined}
      title={title ?? <Typography.Text strong>{account.label}</Typography.Text>}
    >
      {summary}
      {children}
    </GlassCard>
  );
  return account.enabled ? (
    <ConfigProvider theme={{
      token: {
        colorText: "#ffffff",
        colorTextSecondary: "#ffffff",
      },
    }}>
      {card}
    </ConfigProvider>
  ) : card;
};

const AccountSource = ({ accountId }: { accountId: string }) => {
  const account = useStore(store, state => state.account[accountId]);
  if (!account) return null;
  return (
    <Typography.Text>
      来源：{account.sourceFileName} · 导入：{timeText(account.importedAt)}
    </Typography.Text>
  );
};

export { AccountSource, useAccount };
export default Account;
