import { App as AntdApp, Button, Space, Tag, Typography } from "antd";
import { useState } from "react";
import { errorText, timeText } from "../../public/index.ts";
import store from "../../store.ts";

const statusText = {
  authenticated: "已登录",
  checking: "检查中",
  error: "异常",
  requiresLogin: "需要登录",
  unknown: "等待检查",
} as const;
type AuthSessionProps = {
  accountId: string;
  interactive?: boolean;
};

const AuthSession = ({
  accountId,
  interactive = false,
}: AuthSessionProps) => {
  const { message } = AntdApp.useApp();
  const value = store(state => state.authSessions.byAccountId[accountId]);
  const read = store(state => state.authSessionsActions.read);
  const [pending, setPending] = useState(false);
  const refresh = async (): Promise<void> => {
    setPending(true);
    try {
      await read({ accountId });
    } catch (error) {
      void message.error(errorText(error));
    } finally {
      setPending(false);
    }
  };
  return (
    <Space orientation="vertical" size={4} style={{ width: "100%" }}>
      {value?.status && value.status !== "authenticated" ? (
        <Tag color={value.status === "error" || value.status === "requiresLogin"
          ? "red"
          : "default"}
        >
          {statusText[value.status]}
        </Tag>
      ) : null}
      <Typography.Text>
        认证：{value?.authMode ?? value?.accountType ?? "—"}
        {` · 官方认证：${value?.requiresOpenaiAuth === null
          || value?.requiresOpenaiAuth === undefined
          ? "—"
          : value.requiresOpenaiAuth ? "需要" : "有效"}`}
      </Typography.Text>
      <Typography.Text>
        检查：{timeText(value?.lastCheckedAt)}
      </Typography.Text>
      {value?.error ? <Typography.Text type="danger">{value.error}</Typography.Text> : null}
      {interactive ? (
        <Button loading={pending} onClick={() => void refresh()}>检查登录态</Button>
      ) : null}
    </Space>
  );
};

export default AuthSession;
