import { Collapse, ConfigProvider, Masonry, Space, Typography } from "antd";
import Hyperspeed from "extends-react/src/Hyperspeed";
import { useStore } from "zustand";
import AuthJsonCreate from "../accountAdd/authJsonCreate/index.tsx";
import AuthJsonImport from "../accountAdd/authJsonImport/index.tsx";
import Account, { useAccount } from "../accountList/account/index.tsx";
import useAccounts, {
  AccountRemove,
  AccountsEmpty,
} from "../accountList/accounts/index.tsx";
import AuthSession, {
  AuthSessionEmail,
  useAuthSessions,
} from "../accountList/authSessions/index.tsx";
import RateLimits, { useRateLimits } from "../accountList/rateLimits/index.tsx";
import Scheduler from "../accountList/scheduler/index.tsx";
import Usage, { useUsage } from "../accountList/usage/index.tsx";
import GlobalSettings from "../globalSettings/index.tsx";
import store from "../store.ts";

const AccountList = () => {
  const order = useAccounts();
  const settings = useStore(store, state => state.globalSettings);
  useAccount();
  useAuthSessions();
  useRateLimits();
  useUsage();
  const items = [
    { key: "global-settings", data: null, children: <GlobalSettings /> },
    {
      key: "scheduler",
      data: null,
      children: (
        <Scheduler
          maintenanceEnabled={settings.maintenanceEnabled}
          maintenanceIntervalHours={settings.maintenanceIntervalHours}
          maintenanceRetryCount={settings.maintenanceRetryCount}
          maintenanceRetryIntervalMinutes={settings.maintenanceRetryIntervalMinutes}
        />
      ),
    },
    { key: "auth-json-create", data: null, children: <AuthJsonCreate /> },
    { key: "auth-json-import", data: null, children: <AuthJsonImport /> },
    ...order.map(accountId => ({
      key: accountId,
      data: null,
      children: (
        <Account
          accountId={accountId}
          actions={<AccountRemove accountId={accountId} />}
          title={(
            <Typography.Text strong style={{ color: "inherit" }}>
              <AuthSessionEmail accountId={accountId} fallback="账号" />
            </Typography.Text>
          )}
        >
          <Space direction="vertical" size={8} style={{ width: "100%" }}>
            <RateLimits accountId={accountId} />
            <Collapse
              ghost
              items={[{
                children: (
                  <Space direction="vertical" size={8} style={{ width: "100%" }}>
                    <AuthSession accountId={accountId} />
                    <Usage accountId={accountId} />
                  </Space>
                ),
                key: "account-details",
                label: <Typography.Text style={{ color: "inherit" }}>账号信息</Typography.Text>,
              }]}
              size="small"
              styles={{ body: { paddingInline: 0 }, header: { paddingInline: 0 } }}
            />
          </Space>
        </Account>
      ),
    })),
    ...(order.length === 0
      ? [{ key: "accounts-empty", data: null, children: <AccountsEmpty /> }]
      : []),
  ];
  return (
    <div style={{ background: "#000", minHeight: "100vh", overflow: "hidden", position: "relative" }}>
      <Hyperspeed />
      <ConfigProvider theme={{
        token: {
          colorBgContainer: "rgba(255, 255, 255, 0.72)",
          colorBorderSecondary: "transparent",
          colorText: "rgba(0, 0, 0, 0.88)",
          colorTextSecondary: "rgba(0, 0, 0, 0.56)",
        },
      }}>
        <div style={{
          boxSizing: "border-box",
          height: "100vh",
          inset: 0,
          overflowY: "auto",
          padding: 28,
          position: "absolute",
        }}>
          <Masonry
            columns={{ xs: 1, sm: 2, md: 3 }}
            fresh
            gutter={20}
            items={items}
          />
        </div>
      </ConfigProvider>
    </div>
  );
};

export default AccountList;
