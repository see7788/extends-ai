import { Masonry, Space } from "antd";
import Hyperspeed from "extends-react/src/Hyperspeed";
import { useParams } from "react-router-dom";
import Account, { useAccount } from "../accountList/account/index.tsx";
import AuthSession, {
  AuthSessionEmail,
  useAuthSessions,
} from "../accountList/authSessions/index.tsx";
import RateLimits, { useRateLimits } from "../accountList/rateLimits/index.tsx";
import Usage, { useUsage } from "../accountList/usage/index.tsx";
import { account as accountContract } from "../accountList/account/store.ts";

const AccountPage = () => {
  const accountId = accountContract.accountIdValidator.parse(useParams().accountId);
  useAccount();
  useAuthSessions();
  useRateLimits();
  useUsage();
  return (
    <div style={{ background: "#000", minHeight: "100vh", overflow: "hidden", position: "relative" }}>
      <Hyperspeed />
      <div style={{
        boxSizing: "border-box",
        height: "100vh",
        inset: 0,
        overflowY: "auto",
        padding: 28,
        position: "absolute",
      }}>
        <Masonry
          columns={1}
          gutter={16}
          items={[{
            children: (
              <Account
                accountId={accountId}
                title={<AuthSessionEmail accountId={accountId} fallback="账号" />}
              >
                <Space direction="vertical" size="large" style={{ width: "100%" }}>
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

export default AccountPage;
