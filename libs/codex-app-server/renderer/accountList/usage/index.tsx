import { App as AntdApp, Button, Flex, Space, Typography } from "antd";
import { useState } from "react";
import { errorText } from "../../public/index.ts";
import store from "../../store.ts";

const numberText = (value: number | null | undefined): string => value === null
  || value === undefined
  ? "—"
  : new Intl.NumberFormat("zh-CN").format(value);
const secondsText = (seconds: number | null | undefined): string => {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds >= 3_600) return `${(seconds / 3_600).toFixed(1)} 小时`;
  if (seconds >= 60) return `${(seconds / 60).toFixed(1)} 分钟`;
  return `${seconds} 秒`;
};
const timeText = (value: string | null | undefined): string => value
  ? new Date(value).toLocaleString("zh-CN")
  : "—";

const Usage = ({
  accountId,
  color = "inherit",
  interactive = false,
  secondaryColor = "inherit",
}: {
  accountId: string;
  color?: string;
  interactive?: boolean;
  secondaryColor?: string;
}) => {
  const { message } = AntdApp.useApp();
  const value = store(state => state.usage.byAccountId[accountId]);
  const read = store(state => state.usageActions.read);
  const [pending, setPending] = useState(false);
  const refresh = async (): Promise<void> => {
    setPending(true);
    try {
      await read({ accountId });
    } catch (error) {
      void message.error(errorText(error));
    } finally {
      setPending(false);
    }
  };
  const summary = value?.value?.summary;
  return (
    <Space orientation="vertical" size={4} style={{ width: "100%" }}>
      {summary ? (
        <Flex gap={10} wrap>
          <Typography.Text style={{ color: secondaryColor }}>
            累计 {numberText(summary.lifetimeTokens)} Tokens
          </Typography.Text>
          <Typography.Text style={{ color: secondaryColor }}>
            单日峰值 {numberText(summary.peakDailyTokens)}
          </Typography.Text>
          <Typography.Text style={{ color: secondaryColor }}>
            当前连续 {numberText(summary.currentStreakDays)} 天
          </Typography.Text>
          <Typography.Text style={{ color: secondaryColor }}>
            最长连续 {numberText(summary.longestStreakDays)} 天
          </Typography.Text>
          <Typography.Text style={{ color: secondaryColor }}>
            最长任务 {secondsText(summary.longestRunningTurnSec)}
          </Typography.Text>
        </Flex>
      ) : null}
      {value?.value?.dailyUsageBuckets?.length ? (
        <Space orientation="vertical" size={2} style={{ width: "100%" }}>
          <Typography.Text style={{ color }}>每日用量</Typography.Text>
          <Flex gap={12} wrap>
            {value.value.dailyUsageBuckets.map(bucket => (
              <Typography.Text key={bucket.startDate} style={{ color: secondaryColor }}>
                {bucket.startDate} · {numberText(bucket.tokens)}
              </Typography.Text>
            ))}
          </Flex>
        </Space>
      ) : null}
      {value?.updatedAt ? (
        <Typography.Text style={{ color: secondaryColor }}>
          用量更新：{timeText(value.updatedAt)}
        </Typography.Text>
      ) : null}
      {value?.error ? <Typography.Text type="danger">用量：{value.error}</Typography.Text> : null}
      {interactive ? (
        <Button loading={pending} onClick={() => void refresh()}>查询用量</Button>
      ) : null}
    </Space>
  );
};

export default Usage;
