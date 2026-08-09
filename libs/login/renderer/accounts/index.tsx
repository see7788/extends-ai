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
import browserPartitionRenderer from "browser-partition-renderer/public.ts";
import { useEffect } from "react";
import { useStore } from "zustand";
import GlassCard from "../public/GlassCard.tsx";
import store from "../store.ts";
import { accounts } from "./store.ts";

const stateSet = (input: unknown): void => {
  store.getState().accountsActions.stateSet(
    accounts.accountsValidator.parse(input),
  );
};

const statusText = {
  expired: "已过期",
  unknown: "待确认",
  valid: "有效",
} as const;

const useAccounts = () => {
  const { message } = AntdApp.useApp();
  const accountsState = useStore(store, state => state.accounts);
  const errorShow = (error: unknown): void => {
    void message.error(error instanceof Error ? error.message : String(error));
  };
  useEffect(() => {
    void browserPartitionRenderer.read({
      channel: accounts.channel.stateRead,
      resultValidator: accounts.accountsValidator,
    }).then(stateSet).catch(errorShow);
    return browserPartitionRenderer.subscribe({
      channel: accounts.channel.stateUpdated,
      resultValidator: accounts.accountsValidator,
      run: stateSet,
    });
  }, []);

  const accountItems = accountsState.order
    .map(email => accountsState.byEmail[email])
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
                onClick={() => void browserPartitionRenderer.invoke({
                  channel: accounts.channel.open,
                  input: { email: account.email },
                  inputValidator: accounts.input.email,
                  resultValidator: accounts.result.command,
                }).catch(errorShow)}
              >
                打开
              </Button>
              <Button
                icon={<SafetyCertificateOutlined />}
                type="text"
                onClick={() => void browserPartitionRenderer.invoke({
                  channel: accounts.channel.validate,
                  input: { email: account.email },
                  inputValidator: accounts.input.email,
                  resultValidator: accounts.result.command,
                }).catch(errorShow)}
              >
                验证
              </Button>
              <Popconfirm
                description="只移除本应用保存的隔离登录态"
                title="移除账号？"
                onConfirm={() => browserPartitionRenderer.invoke({
                  channel: accounts.channel.remove,
                  input: { email: account.email },
                  inputValidator: accounts.input.email,
                  resultValidator: accounts.result.command,
                }).catch(errorShow)}
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
  return {
    cookieImportConsume: async () => (await browserPartitionRenderer.invoke({
      channel: accounts.channel.cookieImportConsume,
      input: {},
      inputValidator: accounts.input.command,
      resultValidator: accounts.result.account,
    })).account,
    identifiedBrowserIds: new Set(accountsState.order.flatMap(email => (
      accountsState.byEmail[email]?.sources.map(
        source => source.browserId,
      ) ?? []
    ))),
    items: accountItems,
  };
};

export default useAccounts;
