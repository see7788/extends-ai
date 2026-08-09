import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Button,
  Typography,
} from "antd";
import { errorText, timeText, type TreeSection } from "../../public.tsx";
import store from "../../store/index.ts";
import { read, subscribe } from "browser-partition-renderer/public.ts";
import { scheduler } from "./store.ts";

const { Text } = Typography;

const schedulerIndex = {
  async stateRead(): Promise<void> {
    const state = await read({
      channel: scheduler.channel.stateRead,
      resultValidator: scheduler.schedulerValidator,
    });
    store.getState().schedulerActions.stateSet(state);
  },
  async runNow(): Promise<void> {
    await read({
      channel: scheduler.channel.runNow,
      resultValidator: scheduler.resultValidator,
    });
    await schedulerIndex.stateRead();
    const error = store.getState().scheduler.error;
    if (error) throw new Error(error);
  },
  stateSubscribe(): () => void {
    return subscribe({
      channel: scheduler.channel.stateUpdated,
      resultValidator: scheduler.schedulerValidator,
      run: store.getState().schedulerActions.stateSet,
    });
  },
  use() {
    return useStore(store, state => state.scheduler);
  },
};

const useSchedulerTreeSection = (): TreeSection => {
  const { message } = AntdApp.useApp();
  const value = schedulerIndex.use();
  const settings = useStore(store, state => state.globalSettings);
  const [pending, setPending] = useState(false);
  useEffect(() => {
    void schedulerIndex.stateRead();
    return schedulerIndex.stateSubscribe();
  }, []);
  const runNow = async () => {
    setPending(true);
    try {
      await schedulerIndex.runNow();
      void message.success("全部账号查询完成");
    } catch (error) {
      void message.error(errorText(error));
    } finally {
      setPending(false);
    }
  };
  const retry = Boolean(value.error)
    && value.consecutiveFailures <= settings.maintenanceRetryCount;
  const delay = retry
    ? settings.maintenanceRetryIntervalMinutes * 60 * 1000
    : settings.maintenanceIntervalHours * 60 * 60 * 1000;
  const lastRunAt = value.lastRunAt ? Date.parse(value.lastRunAt) : Number.NaN;
  const nextRunAt = settings.maintenanceEnabled
    ? new Date(Number.isFinite(lastRunAt)
      ? Math.max(Date.now(), lastRunAt + delay)
      : Date.now()).toISOString()
    : null;

  return {
    items: [
      {
        key: "scheduler-last-run",
        title: "上次查询",
        children: value.error
          ? [{ key: "scheduler-error", title: "查询错误" }]
          : [],
      },
      { key: "scheduler-failures", title: "连续失败" },
      { key: "scheduler-run-now", title: "立即查询" },
    ],
    titleRender(node) {
      switch (node.key) {
        case "scheduler-run-now":
          return (
            <Button
              disabled={value.running}
              icon={<ReloadOutlined spin={value.running} />}
              iconPosition="end"
              loading={pending || value.running}
              style={{ height: "auto", padding: 0 }}
              type="text"
              onClick={() => void runNow()}
            >
              立即查询
            </Button>
          );
        case "scheduler-last-run":
          return <Text>上次查询：{timeText(value.lastRunAt)}</Text>;
        case "scheduler-failures":
          return <Text>连续失败：{value.consecutiveFailures} 次</Text>;
        case "scheduler-next-run":
          return (
            <Text>
              下次查询：{settings.maintenanceEnabled ? timeText(nextRunAt) : "已停用"}
            </Text>
          );
        case "scheduler-error":
          return value.error
            ? <Alert type="warning" showIcon message={value.error} />
            : undefined;
        default:
          return undefined;
      }
    },
  };
};

export { schedulerIndex };
export default useSchedulerTreeSection;
