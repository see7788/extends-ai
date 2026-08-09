import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  CheckOutlined,
  DeleteOutlined,
  EditOutlined,
  LockOutlined,
  UndoOutlined,
} from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  ConfigProvider,
  Input,
  InputNumber,
  Popconfirm,
  Space,
  Switch,
  Tree,
  Tooltip,
  Typography,
  type InputRef,
  type TreeDataNode,
} from "antd";
import { errorText, type TreeSection } from "../public.tsx";
import store from "../store/index.ts";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import { globalSettings } from "./store.ts";

const { Text } = Typography;

const globalSettingsIndex = {
  codexHomeVisibleSet(codexHomeVisible: boolean): void {
    store.getState().globalSettingsActions.codexHomeVisibleSet({ codexHomeVisible });
  },
  async codexHomeDefaultRestore(): Promise<void> {
    await invoke({
      channel: globalSettings.channel.codexHomeDefaultRestore,
      input: {},
      inputValidator: globalSettings.input.command,
      resultValidator: globalSettings.resultValidator,
    });
    await globalSettingsIndex.stateRead();
  },
  async codexHomeDelete(): Promise<void> {
    await invoke({
      channel: globalSettings.channel.codexHomeDelete,
      input: {},
      inputValidator: globalSettings.input.command,
      resultValidator: globalSettings.resultValidator,
    });
    await globalSettingsIndex.stateRead();
  },
  async codexHomeSet(codexHome: string): Promise<void> {
    await invoke({
      channel: globalSettings.channel.codexHomeSet,
      input: { codexHome },
      inputValidator: globalSettings.input.codexHomeSet,
      resultValidator: globalSettings.resultValidator,
    });
    await globalSettingsIndex.stateRead();
  },
  async maintenanceEnabledSet(maintenanceEnabled: boolean): Promise<void> {
    await invoke({
      channel: globalSettings.channel.maintenanceEnabledSet,
      input: { maintenanceEnabled },
      inputValidator: globalSettings.input.maintenanceEnabledSet,
      resultValidator: globalSettings.resultValidator,
    });
    await globalSettingsIndex.stateRead();
  },
  async maintenanceIntervalHoursSet(maintenanceIntervalHours: number): Promise<void> {
    await invoke({
      channel: globalSettings.channel.maintenanceIntervalHoursSet,
      input: { maintenanceIntervalHours },
      inputValidator: globalSettings.input.maintenanceIntervalHoursSet,
      resultValidator: globalSettings.resultValidator,
    });
    await globalSettingsIndex.stateRead();
  },
  async maintenanceRetryCountSet(maintenanceRetryCount: number): Promise<void> {
    await invoke({
      channel: globalSettings.channel.maintenanceRetryCountSet,
      input: { maintenanceRetryCount },
      inputValidator: globalSettings.input.maintenanceRetryCountSet,
      resultValidator: globalSettings.resultValidator,
    });
    await globalSettingsIndex.stateRead();
  },
  async maintenanceRetryIntervalMinutesSet(
    maintenanceRetryIntervalMinutes: number,
  ): Promise<void> {
    await invoke({
      channel: globalSettings.channel.maintenanceRetryIntervalMinutesSet,
      input: { maintenanceRetryIntervalMinutes },
      inputValidator: globalSettings.input.maintenanceRetryIntervalMinutesSet,
      resultValidator: globalSettings.resultValidator,
    });
    await globalSettingsIndex.stateRead();
  },
  async stateRead(): Promise<void> {
    const state = await read({
      channel: globalSettings.channel.stateRead,
      resultValidator: globalSettings.globalSettingsValidator,
    });
    store.getState().globalSettingsActions.stateSet(state);
  },
  stateSubscribe(): () => void {
    return subscribe({
      channel: globalSettings.channel.stateUpdated,
      resultValidator: globalSettings.globalSettingsValidator,
      run: store.getState().globalSettingsActions.stateSet,
    });
  },
  use() {
    return useStore(store, state => state.globalSettings);
  },
};

type Pending = keyof typeof globalSettings.channel | null;

const GlobalSettings = ({ section }: { section?: TreeSection }) => {
  const { message } = AntdApp.useApp();
  const value = globalSettingsIndex.use();
  const codexHomeInput = useRef<InputRef>(null);
  const [form, setForm] = useState(value);
  const [editingCodexHome, setEditingCodexHome] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([
    "codex-home",
    "codex-home-path",
    "account-query",
    "maintenance-automatic",
    "scheduler-last-run",
  ]);
  useEffect(() => {
    void globalSettingsIndex.stateRead();
    return globalSettingsIndex.stateSubscribe();
  }, []);
  useEffect(() => setForm(value), [value]);
  useEffect(() => {
    if (!editingCodexHome) return;
    codexHomeInput.current?.focus({ cursor: "all" });
  }, [editingCodexHome]);
  const update = async (key: Exclude<Pending, null>, action: () => Promise<void>) => {
    setPending(key);
    try {
      await action();
    } catch (error) {
      await globalSettingsIndex.stateRead().catch(() => undefined);
      void message.error(errorText(error));
    } finally {
      setPending(null);
    }
  };
  const codexHomeCommit = () => {
    setEditingCodexHome(false);
    if (form.codexHome === value.codexHome) return;
    const codexHome = form.codexHome?.trim();
    if (!codexHome) {
      setForm(value);
      return;
    }
    void update("codexHomeSet", () => globalSettingsIndex.codexHomeSet(codexHome));
  };
  const maintenanceIntervalHoursCommit = () => {
    if (form.maintenanceIntervalHours === value.maintenanceIntervalHours) return;
    void update("maintenanceIntervalHoursSet", () => (
      globalSettingsIndex.maintenanceIntervalHoursSet(form.maintenanceIntervalHours)
    ));
  };
  const maintenanceRetryCountCommit = () => {
    if (form.maintenanceRetryCount === value.maintenanceRetryCount) return;
    void update("maintenanceRetryCountSet", () => (
      globalSettingsIndex.maintenanceRetryCountSet(form.maintenanceRetryCount)
    ));
  };
  const maintenanceRetryIntervalMinutesCommit = () => {
    if (
      form.maintenanceRetryIntervalMinutes
      === value.maintenanceRetryIntervalMinutes
    ) return;
    void update("maintenanceRetryIntervalMinutesSet", () => (
      globalSettingsIndex.maintenanceRetryIntervalMinutesSet(
        form.maintenanceRetryIntervalMinutes,
      )
    ));
  };
  const disabled = pending !== null;
  const codexHomeNode: TreeDataNode = {
    key: "codex-home",
    title: "CODEX_HOME",
    children: form.codexHomeVisible
      ? [{
        key: "codex-home-path",
        title: "路径",
        children: [{ key: "codex-home-actions", title: "路径操作" }],
      }]
      : [{ key: "codex-home-permission", title: "申请权限" }],
  };
  const treeData: TreeDataNode[] = [
    codexHomeNode,
    {
      key: "account-query",
      title: "查询全部账号",
      children: [
        ...(section?.items ?? []),
        {
          key: "maintenance-automatic",
          title: "自动查询",
          children: form.maintenanceEnabled
            ? [
              { key: "maintenance-interval", title: "查询间隔" },
              { key: "maintenance-retry-count", title: "失败重试" },
              { key: "maintenance-retry-interval", title: "重试间隔" },
              { key: "scheduler-next-run", title: "下次查询" },
            ]
            : [],
        },
      ],
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
                globalSettingsIndex.codexHomeVisibleSet(codexHomeVisible);
              }}
            />
          </Space>
        );
      case "codex-home-path":
        return (
          <Input
            disabled={disabled}
            placeholder="未配置"
            ref={codexHomeInput}
            readOnly={!editingCodexHome}
            value={form.codexHome ?? ""}
            variant="borderless"
            onChange={event => setForm(current => ({
              ...current,
              codexHome: event.target.value,
            }))}
            onKeyDown={event => {
              if (event.key === "Escape") {
                setForm(value);
                setEditingCodexHome(false);
              }
            }}
            onPressEnter={codexHomeCommit}
          />
        );
      case "codex-home-actions":
        return (
          <Space size={4}>
            <Tooltip title={editingCodexHome ? "确认迁移" : "修改路径"}>
              <Button
                disabled={disabled}
                icon={editingCodexHome ? <CheckOutlined /> : <EditOutlined />}
                type="text"
                onClick={() => {
                  if (editingCodexHome) codexHomeCommit();
                  else setEditingCodexHome(true);
                }}
              />
            </Tooltip>
            <Tooltip title="迁移回 ~/.codex">
              <Button
                disabled={disabled || editingCodexHome}
                icon={<UndoOutlined />}
                loading={pending === "codexHomeDefaultRestore"}
                type="text"
                onClick={() => void update(
                  "codexHomeDefaultRestore",
                  globalSettingsIndex.codexHomeDefaultRestore,
                )}
              />
            </Tooltip>
            <Popconfirm
              description="只删除路径配置，不删除目录或账号凭据。"
              okText="删除配置"
              title="删除 CODEX_HOME 配置？"
              onConfirm={() => void update(
                "codexHomeDelete",
                globalSettingsIndex.codexHomeDelete,
              )}
            >
              <Tooltip title="删除配置">
                <Button
                  disabled={disabled || editingCodexHome || value.codexHome === null}
                  danger
                  icon={<DeleteOutlined />}
                  loading={pending === "codexHomeDelete"}
                  type="text"
                />
              </Tooltip>
            </Popconfirm>
          </Space>
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
                void update("maintenanceEnabledSet", () => (
                  globalSettingsIndex.maintenanceEnabledSet(maintenanceEnabled)
                ));
              }}
            />
          </Space>
        );
      case "maintenance-interval":
        return (
          <Space size={4}>
            <Text>查询间隔</Text>
            <InputNumber
              addonAfter="小时"
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
              addonAfter="次"
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
              addonAfter="分钟"
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
        return section?.titleRender(node)
          ?? (typeof node.title === "function" ? node.title(node) : node.title);
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
      <Tree.DirectoryTree
        blockNode
        expandAction="doubleClick"
        expandedKeys={expandedKeys}
        selectedKeys={[]}
        style={{ background: "transparent", width: "100%" }}
        styles={{ itemSwitcher: { display: "none" } }}
        titleRender={titleRender}
        treeData={treeData}
        onExpand={keys => setExpandedKeys(keys.map(String))}
      />
    </ConfigProvider>
  );
};

export { globalSettingsIndex };
export default GlobalSettings;
