import {
  DeleteOutlined,
  GlobalOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Flex,
  Tag,
  Typography,
} from "antd";
import GlassCard from "../public/GlassCard.tsx";
import store from "../store.ts";

const statusText = {
  expired: "已过期",
  unknown: "待确认",
  valid: "有效",
} as const;

const Account = ({ email }: { email: string }) => {
  const { message } = AntdApp.useApp();
  const account = store(state => state.accounts.byEmail[email]);
  const actions = store(state => state.accountsActions);
  const errorShow = (error: unknown): void => {
    void message.error(error instanceof Error ? error.message : String(error));
  };
  if (!account) return null;

  return (
    <GlassCard title={account.email}>
      <Flex gap={8} vertical>
        <Flex align="center" gap={8} wrap>
          <Tag>{statusText[account.status]}</Tag>
          <Typography.Text>
            {account.sources.map(source => source.browserName).join("、") || "内嵌登录"}
          </Typography.Text>
        </Flex>
        <Typography.Text>
          检查于 {new Date(account.checkedAt).toLocaleString()}
        </Typography.Text>
        {account.error ? <Typography.Text>{account.error}</Typography.Text> : null}
        <Flex gap={4} wrap>
          <Button
            icon={<GlobalOutlined />}
            type="text"
            onClick={() => void actions.open({ email: account.email }).catch(errorShow)}
          >
            打开
          </Button>
          <Button
            icon={<SafetyCertificateOutlined />}
            type="text"
            onClick={() => void actions.validate({ email: account.email }).catch(errorShow)}
          >
            验证
          </Button>
          <Button
            icon={<DeleteOutlined />}
            type="text"
            onClick={() => void actions.remove({ email: account.email }).catch(errorShow)}
          >
            移除
          </Button>
        </Flex>
      </Flex>
    </GlassCard>
  );
};

export default Account;
