import { ReloadOutlined } from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Button,
  Tree,
  Typography,
  type TreeDataNode,
} from "antd";
import { errorText, timeText } from "../../public/index.ts";
import GlassCard from "../../public/GlassCard.tsx";
import store from "../../store.ts";

type SchedulerProps = {
  maintenanceEnabled: boolean;
  maintenanceIntervalHours: number;
  maintenanceRetryCount: number;
  maintenanceRetryIntervalMinutes: number;
};

const Scheduler = ({
  maintenanceEnabled,
  maintenanceIntervalHours,
  maintenanceRetryCount,
  maintenanceRetryIntervalMinutes,
}: SchedulerProps) => {
  const { message } = AntdApp.useApp();
  const value = store(state => state.scheduler);
  const runNowAction = store(state => state.schedulerActions.runNow);
  const runNow = async (): Promise<void> => {
    try {
      await runNowAction();
    } catch (error) {
      void message.error(errorText(error));
    }
  };
  const retry = Boolean(value.error)
    && value.consecutiveFailures <= maintenanceRetryCount;
  const delay = retry
    ? maintenanceRetryIntervalMinutes * 60 * 1_000
    : maintenanceIntervalHours * 60 * 60 * 1_000;
  const lastRunAt = value.lastRunAt ? Date.parse(value.lastRunAt) : Number.NaN;
  const nextRunAt = maintenanceEnabled
    ? new Date(Number.isFinite(lastRunAt)
      ? Math.max(Date.now(), lastRunAt + delay)
      : Date.now()).toISOString()
    : null;
  const treeData: TreeDataNode[] = [
    { key: "last", title: "上次查询" },
    { key: "failures", title: "连续失败" },
    { key: "next", title: "下次查询" },
    { key: "run", title: "立即查询" },
    ...(value.error ? [{ key: "error", title: "查询错误" }] : []),
  ];
  return (
    <GlassCard title="查询全部账号">
      <Tree
        blockNode
        selectedKeys={[]}
        styles={{ root: { background: "transparent" } }}
        treeData={treeData}
        titleRender={node => {
          if (node.key === "last") {
            return <Typography.Text>上次查询：{timeText(value.lastRunAt)}</Typography.Text>;
          }
          if (node.key === "failures") {
            return <Typography.Text>连续失败：{value.consecutiveFailures} 次</Typography.Text>;
          }
          if (node.key === "next") {
            return <Typography.Text>下次查询：{timeText(nextRunAt)}</Typography.Text>;
          }
          if (node.key === "run") {
            return (
              <Button
                icon={<ReloadOutlined />}
                iconPlacement="end"
                type="text"
                onClick={() => void runNow()}
              >
                立即查询
              </Button>
            );
          }
          return value.error ? <Alert message={value.error} showIcon type="warning" /> : null;
        }}
      />
    </GlassCard>
  );
};

export default Scheduler;
