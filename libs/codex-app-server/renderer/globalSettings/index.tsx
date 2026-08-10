import { useEffect, useState } from "react";
import {
  FolderOpenOutlined,
  LockOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  InputNumber,
  Space,
  Switch,
  Tree,
  Typography,
  type TreeDataNode,
} from "antd";
import { errorText } from "../public/index.ts";
import store from "../store.ts";

const { Text } = Typography;

type Pending = "codexHomeDefaultRestore"
  | "codexHomeSelect"
  | "maintenanceEnabledSet"
  | "maintenanceIntervalHoursSet"
  | "maintenanceRetryCountSet"
  | "maintenanceRetryIntervalMinutesSet"
  | null;

const GlobalSettings = () => {
  const { message } = AntdApp.useApp();
  const value = store(state => state.globalSettings);
  const actions = store(state => state.globalSettingsActions);
  const [form, setForm] = useState(value);
  const [pending, setPending] = useState<Pending>(null);
  useEffect(() => setForm(value), [value]);
  const update = async (key: Exclude<Pending, null>, action: () => Promise<void>) => {
    setPending(key);
    try {
      await action();
    } catch (error) {
      setForm(value);
      void message.error(errorText(error));
    } finally {
      setPending(null);
    }
  };
  const maintenanceIntervalHoursCommit = () => {
    if (form.maintenanceIntervalHours === value.maintenanceIntervalHours) return;
    void update("maintenanceIntervalHoursSet", async () => {
      await actions.maintenanceIntervalHoursSet({
        maintenanceIntervalHours: form.maintenanceIntervalHours,
      });
    });
  };
  const maintenanceRetryCountCommit = () => {
    if (form.maintenanceRetryCount === value.maintenanceRetryCount) return;
    void update("maintenanceRetryCountSet", async () => {
      await actions.maintenanceRetryCountSet({
        maintenanceRetryCount: form.maintenanceRetryCount,
      });
    });
  };
  const maintenanceRetryIntervalMinutesCommit = () => {
    if (
      form.maintenanceRetryIntervalMinutes
      === value.maintenanceRetryIntervalMinutes
    ) return;
    void update("maintenanceRetryIntervalMinutesSet", async () => {
      await actions.maintenanceRetryIntervalMinutesSet({
        maintenanceRetryIntervalMinutes: form.maintenanceRetryIntervalMinutes,
      });
    });
  };
  const disabled = pending !== null;
  const treeData: TreeDataNode[] = [
    {
      key: "codex-home",
      title: (
        <Space size={8}>
          <Text>CODEX_HOME</Text>
          <Switch
            checked={form.codexHomeVisible}
            checkedChildren="可见"
            unCheckedChildren="隐藏"
            onChange={codexHomeVisible => {
              actions.codexHomeVisibleSet({ codexHomeVisible });
            }}
          />
        </Space>
      ),
      children: form.codexHomeVisible
        ? [
          {
            key: "codex-home-path",
            title: <Text>{form.codexHome ?? "未配置"}</Text>,
          },
          {
            key: "codex-home-select",
            title: (
              <Button
                disabled={disabled}
                icon={<FolderOpenOutlined />}
                loading={pending === "codexHomeSelect"}
                type="text"
                onClick={() => void update("codexHomeSelect", actions.codexHomeSelect)}
              >
                选择路径
              </Button>
            ),
          },
          {
            key: "codex-home-default-restore",
            title: (
              <Button
                disabled={disabled}
                icon={<UndoOutlined />}
                loading={pending === "codexHomeDefaultRestore"}
                type="text"
                onClick={() => void update(
                  "codexHomeDefaultRestore",
                  actions.codexHomeDefaultRestore,
                )}
              >
                还原至默认路径
              </Button>
            ),
          },
        ]
        : [{
          key: "codex-home-permission",
          title: (
            <Space size={6}>
              <LockOutlined />
              <Text>申请权限</Text>
            </Space>
          ),
        }],
    },
    {
      key: "maintenance-automatic",
      title: (
        <Space size={8}>
          <Text>自动查询</Text>
          <Switch
            checked={form.maintenanceEnabled}
            checkedChildren="已启用"
            disabled={disabled}
            loading={pending === "maintenanceEnabledSet"}
            unCheckedChildren="已停用"
            onChange={maintenanceEnabled => {
              setForm(current => ({ ...current, maintenanceEnabled }));
              void update("maintenanceEnabledSet", async () => {
                await actions.maintenanceEnabledSet({ maintenanceEnabled });
              });
            }}
          />
        </Space>
      ),
      children: form.maintenanceEnabled
        ? [
          {
            key: "maintenance-interval",
            title: (
              <Space size={4}>
                <Text>查询间隔</Text>
                <InputNumber
                  suffix="小时"
                  disabled={disabled}
                  max={720}
                  min={1}
                  value={form.maintenanceIntervalHours}
                  variant="borderless"
                  onBlur={maintenanceIntervalHoursCommit}
                  onChange={maintenanceIntervalHours => {
                    if (maintenanceIntervalHours !== null) {
                      setForm(current => ({ ...current, maintenanceIntervalHours }));
                    }
                  }}
                  onPressEnter={event => event.currentTarget.blur()}
                />
              </Space>
            ),
          },
          {
            key: "maintenance-retry-count",
            title: (
              <Space size={4}>
                <Text>失败重试</Text>
                <InputNumber
                  suffix="次"
                  disabled={disabled}
                  max={5}
                  min={0}
                  value={form.maintenanceRetryCount}
                  variant="borderless"
                  onBlur={maintenanceRetryCountCommit}
                  onChange={maintenanceRetryCount => {
                    if (maintenanceRetryCount !== null) {
                      setForm(current => ({ ...current, maintenanceRetryCount }));
                    }
                  }}
                  onPressEnter={event => event.currentTarget.blur()}
                />
              </Space>
            ),
          },
          {
            key: "maintenance-retry-interval",
            title: (
              <Space size={4}>
                <Text>重试间隔</Text>
                <InputNumber
                  suffix="分钟"
                  disabled={disabled}
                  max={1_440}
                  min={1}
                  value={form.maintenanceRetryIntervalMinutes}
                  variant="borderless"
                  onBlur={maintenanceRetryIntervalMinutesCommit}
                  onChange={maintenanceRetryIntervalMinutes => {
                    if (maintenanceRetryIntervalMinutes !== null) {
                      setForm(current => ({
                        ...current,
                        maintenanceRetryIntervalMinutes,
                      }));
                    }
                  }}
                  onPressEnter={event => event.currentTarget.blur()}
                />
              </Space>
            ),
          },
        ]
        : [],
    },
  ];
  return (
    <Tree
      blockNode
      expandedKeys={["codex-home", "maintenance-automatic"]}
      selectedKeys={[]}
      styles={{
        itemSwitcher: { display: "none" },
        root: { background: "transparent", width: "100%" },
      }}
      treeData={treeData}
    />
  );
};

export default GlobalSettings;
