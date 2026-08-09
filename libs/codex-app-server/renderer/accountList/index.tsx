import { Card, ConfigProvider } from "antd";
import Hyperspeed from "extends-react/src/Hyperspeed";
import AccountAdd from "../accountAdd/index.tsx";
import GlobalSettings from "../globalSettings/index.tsx";
import Accounts from "./accounts/index.tsx";
import useSchedulerTreeSection from "./scheduler/index.tsx";

const AccountList = () => {
  const schedulerTreeSection = useSchedulerTreeSection();
  return (
    <div style={{
      background: "#000000",
      minHeight: "100vh",
      overflow: "hidden",
      position: "relative",
    }}>
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
          <Accounts leadingItems={[
            {
              key: "global-settings",
              data: null,
              children: (
                <Card
                  style={{
                    backdropFilter: "blur(20px) saturate(140%)",
                    background: "rgba(255, 255, 255, 0.72)",
                    WebkitBackdropFilter: "blur(20px) saturate(140%)",
                  }}
                  title="全局设置"
                  variant="borderless"
                >
                  <GlobalSettings section={schedulerTreeSection} />
                </Card>
              ),
            },
            {
              key: "account-add",
              data: null,
              children: <AccountAdd variant="card" />,
            },
          ]} />
        </div>
      </ConfigProvider>
    </div>
  );
};

export default AccountList;
