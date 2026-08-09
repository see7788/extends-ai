import {
  Collapse,
  ConfigProvider,
  Flex,
  Masonry,
  Space,
  Typography,
} from "antd";
import Hyperspeed from "extends-react/src/Hyperspeed";
import { useParams } from "react-router-dom";
import AuthJsonCreate from "../accountAdd/authJsonCreate/index.tsx";
import AuthJsonImport from "../accountAdd/authJsonImport/index.tsx";
import GlobalSettings from "../globalSettings/index.tsx";
import store from "../store.ts";
import Account, { AccountSource } from "./account/index.tsx";
import { account as accountContract } from "./account/store.ts";
import AccountRemove from "./accounts/index.tsx";
import AuthSession from "./authSessions/index.tsx";
import RateLimits from "./rateLimits/index.tsx";
import Scheduler from "./scheduler/index.tsx";
import Usage from "./usage/index.tsx";

const pageStyle = {
  background: "#000",
  minHeight: "100vh",
  overflow: "hidden",
  position: "relative",
} as const;
const contentStyle = {
  boxSizing: "border-box",
  height: "100vh",
  inset: 0,
  overflowY: "auto",
  padding: 28,
  position: "absolute",
} as const;

const AccountPage = () => {
  const accountId = accountContract.accountIdValidator.parse(useParams().accountId);
  const authSession = store(
    state => state.authSessions.byAccountId[accountId],
  );
  return (
    <div style={pageStyle}>
      <Hyperspeed />
      <div style={contentStyle}>
        <Masonry
          columns={1}
          gutter={16}
          items={[{
            children: (
              <Account
                accountId={accountId}
                title={authSession?.email ?? "账号"}
              >
                <Space orientation="vertical" size="large" style={{ width: "100%" }}>
                  <AuthSession accountId={accountId} interactive />
                  <RateLimits accountId={accountId} interactive />
                  <Usage accountId={accountId} interactive />
                </Space>
              </Account>
            ),
            data: null,
            key: accountId,
          }]}
        />
      </div>
    </div>
  );
};

const AccountListItem = ({ accountId }: { accountId: string }) => {
  const authSession = store(
    state => state.authSessions.byAccountId[accountId],
  );
  return (
    <Account
      accountId={accountId}
      summary={(
        <Flex align="center" justify="space-between">
          {authSession?.planType ? (
            <Typography.Text>{authSession.planType}</Typography.Text>
          ) : null}
          <AccountRemove accountId={accountId} />
        </Flex>
      )}
      title={<Typography.Text strong>{authSession?.email ?? "账号"}</Typography.Text>}
    >
      <Space orientation="vertical" size={8} style={{ width: "100%" }}>
        <RateLimits accountId={accountId} />
        <Collapse
          ghost
          items={[{
            children: (
              <Space orientation="vertical" size={8} style={{ width: "100%" }}>
                <AccountSource accountId={accountId} />
                <AuthSession accountId={accountId} />
                <Usage accountId={accountId} />
              </Space>
            ),
            key: "account-details",
            label: "账号信息",
          }]}
          size="small"
          styles={{ body: { paddingInline: 0 }, header: { paddingInline: 0 } }}
        />
      </Space>
    </Account>
  );
};

const AccountsPage = () => {
  const order = store(state => state.accounts.order);
  const settings = store(state => state.globalSettings);
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
      children: <AccountListItem accountId={accountId} />,
    })),
  ];
  return (
    <div style={pageStyle}>
      <Hyperspeed />
      <ConfigProvider theme={{
        token: {
          colorBgContainer: "rgba(255, 255, 255, 0.72)",
          colorBorderSecondary: "transparent",
        },
      }}>
        <div style={contentStyle}>
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

export { AccountPage };
export default AccountsPage;
