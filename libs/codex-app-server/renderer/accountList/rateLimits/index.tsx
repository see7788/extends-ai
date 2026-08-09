import { App as AntdApp, Button, Flex, Progress, Space, Tag, Typography } from "antd";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import { useEffect, useState } from "react";
import { errorText } from "../../public/index.ts";
import store from "../../store.ts";
import { rateLimits } from "./store.ts";

const useRateLimits = (): void => {
  const { message } = AntdApp.useApp();
  useEffect(() => {
    void read({
      channel: rateLimits.channel.stateRead,
      resultValidator: rateLimits.rateLimitsValidator,
    }).then(store.getState().rateLimitsActions.stateSet).catch(error => {
      void message.error(errorText(error));
    });
    return subscribe({
      channel: rateLimits.channel.stateUpdated,
      resultValidator: rateLimits.rateLimitsValidator,
      run: store.getState().rateLimitsActions.stateSet,
    });
  }, []);
};

const dateTimeText = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) return "—";
  const date = new Date(typeof value === "number" ? value * 1_000 : value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN");
};
const shortDateTimeText = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) return "—";
  const date = new Date(typeof value === "number" ? value * 1_000 : value);
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

type RateLimitsProps = {
  accountId: string;
  color?: string;
  interactive?: boolean;
  secondaryColor?: string;
};

const RateLimits = ({
  accountId,
  color = "inherit",
  interactive = false,
  secondaryColor = "inherit",
}: RateLimitsProps) => {
  const { message } = AntdApp.useApp();
  const value = store(state => state.rateLimits.byAccountId[accountId]);
  const [pending, setPending] = useState(false);
  const refresh = async (): Promise<void> => {
    setPending(true);
    try {
      await invoke({
        channel: rateLimits.channel.read,
        input: { accountId },
        inputValidator: rateLimits.input.command,
        resultValidator: rateLimits.commandResultValidator,
      });
      store.getState().rateLimitsActions.stateSet(await read({
        channel: rateLimits.channel.stateRead,
        resultValidator: rateLimits.rateLimitsValidator,
      }));
      void message.success("额度查询完成");
    } catch (error) {
      void message.error(errorText(error));
    } finally {
      setPending(false);
    }
  };
  const buckets = Object.values(value?.value?.rateLimitsByLimitId ?? {});
  const primary = value?.value?.rateLimits;
  if (primary && !buckets.some(bucket => bucket.limitId === primary.limitId)) {
    buckets.unshift(primary);
  }
  const resetCredits = value?.value?.rateLimitResetCredits;
  return (
    <Space direction="vertical" size={4} style={{ width: "100%" }}>
      {buckets.map(bucket => (
        <Space direction="vertical" key={bucket.limitId} size={4} style={{ width: "100%" }}>
          {(["primary", "secondary"] as const).map((name, index) => {
            const window = bucket[name];
            if (!window) return null;
            const remaining = Math.max(0, Math.min(100, 100 - window.usedPercent));
            const quotaText = `${bucket.limitName ?? bucket.limitId} · ${durationText(
              window.windowDurationMins,
            )}${index === 0 ? "额度" : "次级额度"}`;
            const remainingText = `剩余 ${remaining}% · ${shortDateTimeText(window.resetsAt)} 重置`;
            return (
              <div key={name}>
                <Flex align="center" gap={8} justify="space-between">
                  <Typography.Text ellipsis={{ tooltip: quotaText }} style={{ color, minWidth: 0 }}>
                    {quotaText}
                  </Typography.Text>
                  <Typography.Text
                    ellipsis={{ tooltip: `剩余 ${remaining}% · ${dateTimeText(window.resetsAt)} 重置` }}
                    style={{ color: secondaryColor, flex: "0 0 auto" }}
                  >
                    {remainingText}
                  </Typography.Text>
                  {bucket.rateLimitReachedType ? (
                    <Tag color="red">{bucket.rateLimitReachedType}</Tag>
                  ) : null}
                </Flex>
                <Progress
                  percent={remaining}
                  showInfo={false}
                  size="small"
                  strokeColor="currentColor"
                />
              </div>
            );
          })}
        </Space>
      ))}
      {resetCredits ? (
        <Space direction="vertical" size={2} style={{ width: "100%" }}>
          <Typography.Text style={{ color }}>
            可用重置额度：{resetCredits.availableCount}
          </Typography.Text>
          {resetCredits.credits?.map(credit => (
            <Typography.Text key={credit.id} style={{ color: secondaryColor }}>
              {credit.title ?? credit.resetType} · {credit.status}
              {` · ${dateTimeText(credit.grantedAt)} 获得`}
              {credit.expiresAt ? ` · ${dateTimeText(credit.expiresAt)} 到期` : ""}
              {credit.description ? ` · ${credit.description}` : ""}
            </Typography.Text>
          ))}
        </Space>
      ) : null}
      {value?.updatedAt ? (
        <Typography.Text style={{ color: secondaryColor }}>
          额度更新：{dateTimeText(value.updatedAt)}
        </Typography.Text>
      ) : null}
      {value?.error ? <Typography.Text type="danger">额度：{value.error}</Typography.Text> : null}
      {interactive ? (
        <Button loading={pending} onClick={() => void refresh()}>查询额度</Button>
      ) : null}
    </Space>
  );
};

export { useRateLimits };
export default RateLimits;
