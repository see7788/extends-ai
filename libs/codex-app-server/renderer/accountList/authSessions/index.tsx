import { App as AntdApp, Button, Flex, Space, Tag, Typography } from "antd";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { errorText } from "../../public/index.ts";
import store from "../../store.ts";
import { authSessions, type AuthSessionsCommandInput } from "./store.ts";

const authSessionsIndex = {
  async read(input: AuthSessionsCommandInput): Promise<void> {
    await invoke({
      channel: authSessions.channel.read,
      input,
      inputValidator: authSessions.input.command,
      resultValidator: authSessions.resultValidator,
    });
    await authSessionsIndex.stateRead();
  },
  async stateRead(): Promise<void> {
    const state = await read({
      channel: authSessions.channel.stateRead,
      resultValidator: authSessions.authSessionsValidator,
    });
    store.getState().authSessionsActions.stateSet(state);
  },
  stateSubscribe(): () => void {
    return subscribe({
      channel: authSessions.channel.stateUpdated,
      resultValidator: authSessions.authSessionsValidator,
      run: store.getState().authSessionsActions.stateSet,
    });
  },
};

const useAuthSessions = (): void => {
  const { message } = AntdApp.useApp();
  useEffect(() => {
    void authSessionsIndex.stateRead().catch(error => {
      void message.error(errorText(error));
    });
    return authSessionsIndex.stateSubscribe();
  }, []);
};

const statusText = {
  authenticated: "已登录",
  checking: "检查中",
  error: "异常",
  requiresLogin: "需要登录",
  unknown: "等待检查",
} as const;
const timeText = (value: string | null | undefined): string => value
  ? new Date(value).toLocaleString("zh-CN")
  : "—";

type AuthSessionProps = {
  accountId: string;
  interactive?: boolean;
  secondaryColor?: string;
};

const AuthSession = ({
  accountId,
  interactive = false,
  secondaryColor = "inherit",
}: AuthSessionProps) => {
  const { message } = AntdApp.useApp();
  const value = useStore(store, state => state.authSessions.byAccountId[accountId]);
  const [pending, setPending] = useState(false);
  const refresh = async (): Promise<void> => {
    setPending(true);
    try {
      await authSessionsIndex.read({ accountId });
      void message.success("登录态检查完成");
    } catch (error) {
      void message.error(errorText(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <Space direction="vertical" size={4} style={{ width: "100%" }}>
      <Flex align="center" gap={4} wrap>
        <Tag color={value?.status === "authenticated"
          ? "green"
          : value?.status === "error" || value?.status === "requiresLogin"
            ? "red"
            : "default"}
        >
          {value ? statusText[value.status] : statusText.unknown}
        </Tag>
        {value?.planType ? <Tag>{value.planType}</Tag> : null}
      </Flex>
      <Typography.Text style={{ color: secondaryColor }}>
        认证：{value?.authMode ?? value?.accountType ?? "—"}
        {` · 官方认证：${value?.requiresOpenaiAuth === null
          || value?.requiresOpenaiAuth === undefined
          ? "—"
          : value.requiresOpenaiAuth ? "需要" : "有效"}`}
      </Typography.Text>
      <Typography.Text style={{ color: secondaryColor }}>
        检查：{timeText(value?.lastCheckedAt)}
      </Typography.Text>
      {value?.error ? <Typography.Text type="danger">{value.error}</Typography.Text> : null}
      {interactive ? (
        <Button loading={pending} onClick={() => void refresh()}>检查登录态</Button>
      ) : null}
    </Space>
  );
};

const AuthSessionEmail = ({ accountId, fallback }: {
  accountId: string;
  fallback: string;
}) => {
  const email = useStore(store, state => state.authSessions.byAccountId[accountId]?.email);
  return <>{email ?? fallback}</>;
};

export { AuthSessionEmail, useAuthSessions };
export default AuthSession;
