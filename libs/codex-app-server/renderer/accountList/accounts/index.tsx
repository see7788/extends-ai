import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { DeleteOutlined, GlobalOutlined } from "@ant-design/icons";
import {
  App as AntdApp,
  BorderBeam,
  Button,
  Card,
  Collapse,
  Empty,
  Flex,
  Masonry,
  Popconfirm,
  Progress,
  Space,
  Switch,
  Tag,
  Typography,
  type MasonryProps,
} from "antd";
import { errorText } from "../../public.tsx";
import store from "../../store.ts";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import { accountIndex } from "../account/index.tsx";
import type { Account } from "../account/store.ts";
import authSessionsIndex from "../authSessions/index.ts";
import rateLimitsIndex from "../rateLimits/index.ts";
import usageIndex from "../usage/index.ts";
import { accounts, type AccountsDeleteInput } from "./store.ts";

const { Text } = Typography;

const accountsIndex = {
  async delete(input: AccountsDeleteInput): Promise<void> {
    await invoke({
      channel: accounts.channel.accountDelete,
      input,
      inputValidator: accounts.input.accountDelete,
      resultValidator: accounts.resultValidator,
    });
    await Promise.all([accountsIndex.stateRead(), accountIndex.stateRead()]);
  },
  async stateRead(): Promise<void> {
    const state = await read({
      channel: accounts.channel.stateRead,
      resultValidator: accounts.accountsValidator,
    });
    store.getState().accountsActions.stateSet(state);
  },
  stateSubscribe(): () => void {
    return subscribe({
      channel: accounts.channel.stateUpdated,
      resultValidator: accounts.accountsValidator,
      run: store.getState().accountsActions.stateSet,
    });
  },
};

type AccountCardProps = {
  account: Account;
  officialOpening: boolean;
  onOfficialOpen(): void;
  onRemove(): void;
};

const statusText = {
  authenticated: "已登录",
  checking: "检查中",
  error: "异常",
  requiresLogin: "需要登录",
  unknown: "等待检查",
} as const;
const numberText = (value: number | null | undefined): string => value === null || value === undefined
  ? "—"
  : new Intl.NumberFormat("zh-CN").format(value);
const dateTimeText = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) return "—";
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN");
};
const shortDateTimeText = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) return "—";
  const date = new Date(typeof value === "number" ? value * 1000 : value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "short",
  }).format(date);
};
const durationText = (minutes: number): string => {
  if (minutes % 1_440 === 0) return `${minutes / 1_440} 天`;
  if (minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${minutes} 分钟`;
};
const secondsText = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds >= 3_600) return `${(seconds / 3_600).toFixed(1)} 小时`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)} 分钟`;
  return `${seconds} 秒`;
};

const AccountOverview = ({ account, officialOpening, onOfficialOpen, onRemove, selected }: {
  account: Account;
  officialOpening: boolean;
  onOfficialOpen(): void;
  onRemove(): void;
  selected: boolean;
}) => {
  const session = authSessionsIndex.use(account.id);
  const limits = rateLimitsIndex.use(account.id);
  const usage = usageIndex.use(account.id);
  const color = selected ? "#ffffff" : "rgba(0, 0, 0, 0.88)";
  const secondaryColor = selected ? "rgba(255, 255, 255, 0.78)" : "rgba(0, 0, 0, 0.56)";
  const buckets = Object.values(limits?.value?.rateLimitsByLimitId ?? {});
  const primary = limits?.value?.rateLimits;
  if (primary && !buckets.some(bucket => bucket.limitId === primary.limitId)) {
    buckets.unshift(primary);
  }
  const resetCredits = limits?.value?.rateLimitResetCredits;
  const summary = usage?.value?.summary;
  return (
    <Space direction="vertical" size={8} style={{ width: "100%" }}>
      <Flex align="center" gap={4}>
        <Tag color={session?.status === "authenticated"
          ? "green"
          : session?.status === "error" || session?.status === "requiresLogin"
            ? "red"
            : "default"}
        >
          {session ? statusText[session.status] : statusText.unknown}
        </Tag>
        {session?.planType && <Tag>{session.planType}</Tag>}
        <Popconfirm
          title="移出账号管理"
          description="只移除管理记录，不删除托管文件。"
          okText="移出"
          cancelText="取消"
          onConfirm={onRemove}
        >
          <Button
            icon={<DeleteOutlined />}
            size="small"
            style={{ color, marginInlineStart: "auto" }}
            type="text"
          >
            移出管理
          </Button>
        </Popconfirm>
        {account.webAccess && (
          <Button
            icon={<GlobalOutlined />}
            loading={officialOpening}
            onClick={onOfficialOpen}
            size="small"
            style={{ color }}
            type="text"
          >
            访问官网
          </Button>
        )}
      </Flex>
      {buckets.map(bucket => {
        return (
          <Space direction="vertical" key={bucket.limitId} size={4} style={{ width: "100%" }}>
            {(["primary", "secondary"] as const).map((name, index) => {
              const window = bucket[name];
              if (!window) return null;
              const remaining = Math.max(0, Math.min(100, 100 - window.usedPercent));
              const quotaText = `${bucket.limitName ?? bucket.limitId} · ${durationText(
                window.windowDurationMins,
              )}${index === 0 ? "额度" : "次级额度"}`;
              const remainingText = `剩余 ${remaining}% · ${shortDateTimeText(window.resetsAt)} 重置`;
              const remainingTooltip = `剩余 ${remaining}% · ${dateTimeText(window.resetsAt)} 重置`;
              return (
                <div key={name}>
                  <Flex align="center" justify="space-between" gap={8}>
                    <Text
                      ellipsis={{ tooltip: quotaText }}
                      style={{ color, flex: "1 1 44%", minWidth: 0 }}
                    >
                      {quotaText}
                    </Text>
                    <Text
                      ellipsis={{ tooltip: remainingTooltip }}
                      style={{
                        color: secondaryColor,
                        flex: "0 0 auto",
                        textAlign: "right",
                      }}
                    >
                      {remainingText}
                    </Text>
                    {bucket.rateLimitReachedType && (
                      <Tag color="red">{bucket.rateLimitReachedType}</Tag>
                    )}
                  </Flex>
                  <Progress
                    percent={remaining}
                    showInfo={false}
                    size="small"
                    strokeColor={selected ? "#ffffff" : undefined}
                    trailColor={selected ? "rgba(255, 255, 255, 0.24)" : undefined}
                  />
                </div>
              );
            })}
          </Space>
        );
      })}
      {resetCredits && (
        <Space direction="vertical" size={2} style={{ width: "100%" }}>
          <Text style={{ color }}>可用重置额度：{resetCredits.availableCount}</Text>
          {resetCredits.credits?.map(credit => (
            <Text key={credit.id} style={{ color: secondaryColor }}>
              {credit.title ?? credit.resetType} · {credit.status}
              {` · ${dateTimeText(credit.grantedAt)} 获得`}
              {credit.expiresAt ? ` · ${dateTimeText(credit.expiresAt)} 到期` : ""}
              {credit.description ? ` · ${credit.description}` : ""}
            </Text>
          ))}
        </Space>
      )}
      <Collapse
        ghost
        items={[{
          key: "account-details",
          label: <Text style={{ color }}>账号信息</Text>,
          children: (
            <Space direction="vertical" size={8} style={{ width: "100%" }}>
              <Text style={{ color: secondaryColor }}>
                认证：{session?.authMode ?? session?.accountType ?? "—"}
                {` · 官方认证：${session?.requiresOpenaiAuth === null
                  || session?.requiresOpenaiAuth === undefined
                  ? "—"
                  : session.requiresOpenaiAuth ? "需要" : "有效"}`}
              </Text>
              <Text style={{ color: secondaryColor }}>
                来源：{account.sourceFileName} · 导入：{dateTimeText(account.importedAt)}
              </Text>
              <Text style={{ color: secondaryColor }}>
                检查：{dateTimeText(session?.lastCheckedAt)}
              </Text>
              {summary && (
                <Flex gap={10} wrap>
                  <Text style={{ color: secondaryColor }}>
                    累计 {numberText(summary.lifetimeTokens)} Tokens
                  </Text>
                  <Text style={{ color: secondaryColor }}>
                    单日峰值 {numberText(summary.peakDailyTokens)}
                  </Text>
                  <Text style={{ color: secondaryColor }}>
                    当前连续 {numberText(summary.currentStreakDays)} 天
                  </Text>
                  <Text style={{ color: secondaryColor }}>
                    最长连续 {numberText(summary.longestStreakDays)} 天
                  </Text>
                  <Text style={{ color: secondaryColor }}>
                    最长任务 {secondsText(summary.longestRunningTurnSec)}
                  </Text>
                </Flex>
              )}
              {usage?.value?.dailyUsageBuckets && usage.value.dailyUsageBuckets.length > 0 && (
                <Space direction="vertical" size={2} style={{ width: "100%" }}>
                  <Text style={{ color }}>每日用量</Text>
                  <Flex gap={12} wrap>
                    {usage.value.dailyUsageBuckets.map(bucket => (
                      <Text key={bucket.startDate} style={{ color: secondaryColor }}>
                        {bucket.startDate} · {numberText(bucket.tokens)}
                      </Text>
                    ))}
                  </Flex>
                </Space>
              )}
              <Flex gap={8} wrap>
                {limits?.updatedAt && (
                  <Text style={{ color: secondaryColor }}>
                    额度更新：{dateTimeText(limits.updatedAt)}
                  </Text>
                )}
                {usage?.updatedAt && (
                  <Text style={{ color: secondaryColor }}>
                    用量更新：{dateTimeText(usage.updatedAt)}
                  </Text>
                )}
              </Flex>
              {session?.error && <Text type="danger">{session.error}</Text>}
              {limits?.error && <Text type="danger">额度：{limits.error}</Text>}
              {usage?.error && <Text type="danger">用量：{usage.error}</Text>}
            </Space>
          ),
        }]}
        size="small"
        styles={{
          body: { paddingInline: 0 },
          header: { paddingInline: 0 },
        }}
      />
    </Space>
  );
};

const SelectedAccountCard = ({
  account,
  colorPrimary,
  colorPrimaryGlass,
  officialOpening,
  onOfficialOpen,
  onRemove,
}: AccountCardProps & {
  colorPrimary: string;
  colorPrimaryGlass: string;
}) => {
  const session = authSessionsIndex.use(account.id);
  return (
    <BorderBeam
    color={[
      { color: colorPrimary, percent: 0 },
      { color: "#ffffff", percent: 50 },
      { color: colorPrimary, percent: 100 },
    ]}
    duration={7}
    lineWidth={2}
    outset={0}
    size={120}
  >
    <Card
      extra={(
        <Switch
          checked
          checkedChildren="使用中"
          disabled
          unCheckedChildren="启用"
        />
      )}
      style={{
        backdropFilter: "blur(22px) saturate(155%)",
        background: colorPrimaryGlass,
        boxShadow: `0 18px 48px color-mix(in srgb, ${colorPrimary} 34%, transparent)`,
        color: "#ffffff",
        position: "relative",
        WebkitBackdropFilter: "blur(22px) saturate(155%)",
      }}
      title={(
        <Text strong style={{ color: "#ffffff" }}>
          {session?.email ?? account.label}
        </Text>
      )}
      variant="borderless"
    >
      <AccountOverview
        account={account}
        officialOpening={officialOpening}
        onOfficialOpen={onOfficialOpen}
        onRemove={onRemove}
        selected
      />
    </Card>
    </BorderBeam>
  );
};

const UnselectedAccountCard = ({
  account,
  officialOpening,
  onEnable,
  onOfficialOpen,
  onRemove,
}: AccountCardProps & { onEnable(): void }) => {
  const session = authSessionsIndex.use(account.id);
  return (
    <Card
    extra={(
      <Switch
        checked={false}
        checkedChildren="使用中"
        unCheckedChildren="启用"
        onChange={enabled => {
          if (enabled) onEnable();
        }}
      />
    )}
    style={{
      backdropFilter: "blur(20px) saturate(140%)",
      background: "rgba(255, 255, 255, 0.76)",
      color: "rgba(0, 0, 0, 0.88)",
      WebkitBackdropFilter: "blur(20px) saturate(140%)",
    }}
    title={<Text strong>{session?.email ?? account.label}</Text>}
    variant="borderless"
  >
    <AccountOverview
      account={account}
      officialOpening={officialOpening}
      onOfficialOpen={onOfficialOpen}
      onRemove={onRemove}
      selected={false}
    />
  </Card>
  );
};

const Accounts = ({ leadingItems }: {
  leadingItems: NonNullable<MasonryProps<null>["items"]>;
}) => {
  const { message } = AntdApp.useApp();
  const order = useStore(store, state => state.accounts.order);
  const account = useStore(store, state => state.account);
  const colorPrimary = useStore(store, state => state.theme.colorPrimary);
  const colorPrimaryGlass = useStore(store, state => state.theme.colorPrimaryGlass);
  const [officialOpening, setOfficialOpening] = useState<string | null>(null);
  useEffect(() => {
    void Promise.all([
      accountIndex.stateRead(),
      accountsIndex.stateRead(),
      authSessionsIndex.stateRead(),
      rateLimitsIndex.stateRead(),
      usageIndex.stateRead(),
    ]);
    const dispose = [
      accountIndex.stateSubscribe(),
      accountsIndex.stateSubscribe(),
      authSessionsIndex.stateSubscribe(),
      rateLimitsIndex.stateSubscribe(),
      usageIndex.stateSubscribe(),
    ];
    return () => dispose.forEach(run => run());
  }, []);
  const items = order.flatMap(accountId => account[accountId]
    ? [account[accountId]]
    : []);
  const remove = async (accountId: string) => {
    try {
      await accountsIndex.delete({ accountId });
      void message.success("账号已移出管理，托管文件未删除");
    } catch (error) {
      void message.error(errorText(error));
    }
  };
  const enabledSet = async (accountId: string, enabled: boolean) => {
    try {
      await accountIndex.enabledSet({ accountId, enabled });
    } catch (error) {
      void message.error(errorText(error));
    }
  };
  const officialOpen = async (accountId: string) => {
    setOfficialOpening(accountId);
    try {
      await accountIndex.officialOpen({ accountId });
    } catch (error) {
      void message.error(errorText(error));
    } finally {
      setOfficialOpening(null);
    }
  };

  const accountItems = items.map(item => ({
    key: item.id,
    data: null,
    children: item.enabled ? (
      <SelectedAccountCard
        account={item}
        colorPrimary={colorPrimary}
        colorPrimaryGlass={colorPrimaryGlass}
        officialOpening={officialOpening === item.id}
        onOfficialOpen={() => void officialOpen(item.id)}
        onRemove={() => remove(item.id)}
      />
    ) : (
      <UnselectedAccountCard
        account={item}
        officialOpening={officialOpening === item.id}
        onEnable={() => void enabledSet(item.id, true)}
        onOfficialOpen={() => void officialOpen(item.id)}
        onRemove={() => remove(item.id)}
      />
    ),
  }));
  const emptyItems = items.length === 0 ? [{
    key: "accounts-empty",
    data: null,
    children: (
      <Card
        style={{
          backdropFilter: "blur(20px) saturate(140%)",
          background: "rgba(255, 255, 255, 0.72)",
          WebkitBackdropFilter: "blur(20px) saturate(140%)",
        }}
        title="已有账号"
        variant="borderless"
      >
        <Empty description="尚未添加账号" />
      </Card>
    ),
  }] : [];

  return (
    <Masonry
      columns={{ xs: 1, sm: 2, md: 3 }}
      fresh
      gutter={20}
      items={[...leadingItems, ...accountItems, ...emptyItems]}
    />
  );
};

export { accountsIndex };
export default Accounts;
