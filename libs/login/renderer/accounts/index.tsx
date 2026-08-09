import {
  DeleteOutlined,
  GlobalOutlined,
  SafetyCertificateOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Flex,
  Popconfirm,
  Tag,
  Typography,
} from "antd";
import { useEffect } from "react";
import { useStore } from "zustand";
import GlassCard from "../public/GlassCard.tsx";
import store from "../store.ts";
import accountsIndex from "./index.ts";

const statusText = {
  expired: "已过期",
  unknown: "待确认",
  valid: "有效",
} as const;

const useAccounts = () => {
  const { message } = AntdApp.useApp();
  const accounts = useStore(store, state => state.accounts);
  const errorShow = (error: unknown): void => {
    void message.error(error instanceof Error ? error.message : String(error));
  };
  useEffect(() => {
    void accountsIndex.stateRead().catch(errorShow);
    return accountsIndex.stateSubscribe();
  }, []);

  return accounts.order
    .map(email => accounts.byEmail[email])
    .filter(account => account !== undefined)
    .map(account => ({
      children: (
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
                onClick={() => void accountsIndex.open(account.email).catch(errorShow)}
              >
                打开
              </Button>
              <Button
                icon={<SafetyCertificateOutlined />}
                type="text"
                onClick={() => void accountsIndex.validate(account.email).catch(errorShow)}
              >
                验证
              </Button>
              <Popconfirm
                description="只移除本应用保存的隔离登录态"
                title="移除账号？"
                onConfirm={() => accountsIndex.remove(account.email).catch(errorShow)}
              >
                <Button danger icon={<DeleteOutlined />} type="text">移除</Button>
              </Popconfirm>
            </Flex>
          </Flex>
        </GlassCard>
      ),
      data: null,
      key: `account:${account.email}`,
    }));
};

export default useAccounts;
