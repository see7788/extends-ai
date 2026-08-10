import { useEffect, useState } from "react";
import {
  FolderOpenOutlined,
  LockOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  ConfigProvider,
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
  const codexHomeNode: TreeDataNode = {
    key: "codex-home",
    title: "CODEX_HOME",
    children: form.codexHomeVisible
      ? [
        { key: "codex-home-path", title: "路径" },
        { key: "codex-home-select", title: "选择路径" },
        { key: "codex-home-default-restore", title: "还原至默认路径" },
      ]
      : [{ key: "codex-home-permission", title: "申请权限" }],
  };
  const treeData: TreeDataNode[] = [
    codexHomeNode,
    {
      key: "maintenance-automatic",
      title: "自动查询",
      children: form.maintenanceEnabled
        ? [
          { key: "maintenance-interval", title: "查询间隔" },
          { key: "maintenance-retry-count", title: "失败重试" },
          { key: "maintenance-retry-interval", title: "重试间隔" },
        ]
        : [],
    },
  ];
  const titleRender = (node: TreeDataNode) => {
    switch (node.key) {
      case "codex-home":
        return (
          <Space size={8}>
            <Text>CODEX_HOME</Text>
            <Switch
              checked={form.codexHomeVisible}
              checkedChildren="可见"
              unCheckedChildren="隐藏"
              onChange={codexHomeVisible => {
                store.getState().globalSettingsActions.codexHomeVisibleSet({ codexHomeVisible });
              }}
            />
          </Space>
        );
      case "codex-home-path":
        return (
          <Text>{form.codexHome ?? "未配置"}</Text>
        );
      case "codex-home-select":
        return (
          <Button
            disabled={disabled}
            icon={<FolderOpenOutlined />}
            loading={pending === "codexHomeSelect"}
            type="text"
            onClick={() => void update("codexHomeSelect", actions.codexHomeSelect)}
          >
            选择路径
          </Button>
        );
      case "codex-home-default-restore":
        return (
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
        );
      case "codex-home-permission":
        return (
          <Space size={6}>
            <LockOutlined />
            <Text>申请权限</Text>
          </Space>
        );
      case "maintenance-automatic":
        return (
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
        );
      case "maintenance-interval":
        return (
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
        );
      case "maintenance-retry-count":
        return (
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
        );
      case "maintenance-retry-interval":
        return (
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
        );
      default:
        return typeof node.title === "function" ? node.title(node) : node.title;
    }
  };
  return (
    <ConfigProvider theme={{
      components: {
        Tree: {
          nodeHoverBg: "transparent",
          nodeSelectedBg: "transparent",
        },
      },
      token: { colorBgContainer: "transparent" },
    }}>
      <Tree
        blockNode
        expandedKeys={["codex-home", "maintenance-automatic"]}
        selectedKeys={[]}
        style={{ background: "transparent", width: "100%" }}
        styles={{ itemSwitcher: { display: "none" } }}
        titleRender={titleRender}
        treeData={treeData}
      />
    </ConfigProvider>
  );
};

export default GlobalSettings;
