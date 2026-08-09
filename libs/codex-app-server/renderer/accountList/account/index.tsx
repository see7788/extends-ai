import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useStore } from "zustand";
import {
  Alert,
  App as AntdApp,
  Button,
  Card,
  Descriptions,
  Empty,
  Flex,
  Progress,
  Space,
  Tag,
  Typography,
} from "antd";
import { errorText, Shell, timeText } from "../../public.tsx";
import store from "../../store.ts";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import authSessionsIndex from "../authSessions/index.ts";
import rateLimitsIndex from "../rateLimits/index.ts";
import usageIndex from "../usage/index.ts";
import {
  account as accountContract,
  type AccountEnabledSetInput,
  type AccountLabelSetInput,
  type AccountOfficialOpenInput,
} from "./store.ts";

const { Text } = Typography;

const accountIndex = {
  async enabledSet(input: AccountEnabledSetInput): Promise<void> {
    await invoke({
      channel: accountContract.channel.enabledSet,
      input,
      inputValidator: accountContract.input.enabledSet,
      resultValidator: accountContract.resultValidator,
    });
    await accountIndex.stateRead();
  },
  async labelSet(input: AccountLabelSetInput): Promise<void> {
    await invoke({
      channel: accountContract.channel.labelSet,
      input,
      inputValidator: accountContract.input.labelSet,
      resultValidator: accountContract.resultValidator,
    });
    await accountIndex.stateRead();
  },
  async officialOpen(input: AccountOfficialOpenInput): Promise<void> {
    await invoke({
      channel: accountContract.channel.officialOpen,
      input,
      inputValidator: accountContract.input.officialOpen,
      resultValidator: accountContract.resultValidator,
    });
  },
  async stateRead(): Promise<void> {
    const state = await read({
      channel: accountContract.channel.stateRead,
      resultValidator: accountContract.accountValidator,
    });
    store.getState().accountActions.stateSet(state);
  },
  stateSubscribe(): () => void {
    return subscribe({
      channel: accountContract.channel.stateUpdated,
      resultValidator: accountContract.accountValidator,
      run: store.getState().accountActions.stateSet,
    });
  },
};

const Account = () => {
  const { message } = AntdApp.useApp();
  const accountId = accountContract.accountIdValidator.parse(useParams().accountId);
  const account = useStore(store, state => state.account[accountId]);
  const session = authSessionsIndex.use(accountId);
  const limits = rateLimitsIndex.use(accountId);
  const usage = usageIndex.use(accountId);
  const [pending, setPending] = useState<string | null>(null);
  useEffect(() => {
    void Promise.all([
      accountIndex.stateRead(),
      authSessionsIndex.stateRead(),
      rateLimitsIndex.stateRead(),
      usageIndex.stateRead(),
    ]);
    const dispose = [
      accountIndex.stateSubscribe(),
      authSessionsIndex.stateSubscribe(),
      rateLimitsIndex.stateSubscribe(),
      usageIndex.stateSubscribe(),
    ];
    return () => dispose.forEach(run => run());
  }, []);
  const buckets = useMemo(() => {
    const values = Object.values(limits?.value?.rateLimitsByLimitId ?? {});
    const primary = limits?.value?.rateLimits;
    if (primary && !values.some(value => value.limitId === primary.limitId)) {
      values.unshift(primary);
    }
    return values;
  }, [limits]);
  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setPending(key);
    try {
      await action();
      void message.success(success);
    } catch (error) {
      void message.error(errorText(error));
    } finally {
      setPending(null);
    }
  };

  if (!account) {
    return <Shell subtitle="账号详情"><Empty description="账号不存在或已移除" /></Shell>;
  }
  return (
    <Shell subtitle={account.label}>
      <Space direction="vertical" size="large" style={{ width: "100%" }}>
        <Card
          title={(
            <Flex gap={8} align="center">
              <Text strong>{account.label}</Text>
              <Tag color={session?.status === "authenticated"
                ? "green"
                : session?.status === "error" ? "red" : "default"}
              >
                {session?.status ?? "unknown"}
              </Tag>
              {session?.planType && <Tag color="blue">{session.planType}</Tag>}
            </Flex>
          )}
        >
          <Descriptions column={2} size="small">
            <Descriptions.Item label="邮箱">{session?.email ?? "—"}</Descriptions.Item>
            <Descriptions.Item label="最近检查">
              {timeText(session?.lastCheckedAt)}
            </Descriptions.Item>
          </Descriptions>
          <Space wrap>
            <Button loading={pending === "read"} onClick={() => run(
              "read",
              () => authSessionsIndex.read({ accountId }),
              "登录态检查完成",
            )}>检查登录态</Button>
            <Button loading={pending === "limits"} onClick={() => run(
              "limits",
              () => rateLimitsIndex.read({ accountId }),
              "额度查询完成",
            )}>查询额度</Button>
            <Button loading={pending === "usage"} onClick={() => run(
              "usage",
              () => usageIndex.read({ accountId }),
              "用量查询完成",
            )}>查询用量</Button>
          </Space>
          {session?.error && (
            <Alert type="error" showIcon message={session.error} style={{ marginTop: 16 }} />
          )}
        </Card>

        {buckets.length > 0 && (
          <Card title="额度">
            <Flex gap={16} wrap>
              {buckets.map(bucket => {
                const remaining = Math.max(
                  0,
                  Math.min(100, 100 - (bucket.primary?.usedPercent ?? 0)),
                );
                return (
                  <Card key={bucket.limitId} size="small" style={{ width: 280 }}>
                    <Text>{bucket.limitName ?? bucket.limitId}</Text>
                    <Progress percent={remaining} format={value => `剩余 ${value}%`} />
                    <Text type="secondary">
                      重置：{bucket.primary?.resetsAt
                        ? new Date(bucket.primary.resetsAt * 1000).toLocaleString()
                        : "—"}
                    </Text>
                  </Card>
                );
              })}
            </Flex>
          </Card>
        )}

        {usage?.value && (
          <Card title="用量">
            <Descriptions column={3} size="small">
              <Descriptions.Item label="累计 Tokens">
                {usage.value.summary.lifetimeTokens ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label="单日峰值">
                {usage.value.summary.peakDailyTokens ?? "—"}
              </Descriptions.Item>
              <Descriptions.Item label="连续使用">
                {usage.value.summary.currentStreakDays ?? "—"} 天
              </Descriptions.Item>
            </Descriptions>
          </Card>
        )}
      </Space>
    </Shell>
  );
};

export { accountIndex };
export default Account;
