import {
  CloseCircleOutlined,
  CopyOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
  GlobalOutlined,
  LoginOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App as AntdApp,
  Card,
  ConfigProvider,
  Space,
  Tree,
  type TreeDataNode,
} from "antd";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import Hyperspeed from "extends-react/src/Hyperspeed";
import { errorText } from "../public.tsx";
import store from "../store.ts";
import authJsonCreateIndex from "./authJsonCreate/index.ts";
import authJsonImportIndex from "./authJsonImport/index.ts";

type BrowserApplication = Awaited<ReturnType<
  typeof authJsonCreateIndex.applicationsRead
>>[number];
type AccountAddProps = { variant?: "card" | "page" };
type RootKey = "auth" | "browser" | "electron";

const backgroundOptions = {
  distortion: "turbulentDistortion",
  colors: {
    roadColor: 0x080808,
    islandColor: 0x0a0a0a,
    background: 0x020202,
    shoulderLines: 0x8c8c8c,
    brokenLines: 0x595959,
    leftCars: [0xf0f0f0, 0xbfbfbf, 0x8c8c8c],
    rightCars: [0xf0f0f0, 0xbfbfbf, 0x8c8c8c],
    sticks: 0xbfbfbf,
  },
};

const AccountAdd = ({ variant = "page" }: AccountAddProps) => {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const authJsonImportState = useStore(store, state => state.authJsonImport);
  const operationRunning = useRef(false);
  const [applications, setApplications] = useState<BrowserApplication[]>([]);
  const [browserLoading, setBrowserLoading] = useState(false);
  const [expandedKey, setExpandedKey] = useState<RootKey | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    void authJsonImportIndex.stateRead();
    return authJsonImportIndex.stateSubscribe();
  }, []);

  const run = async (
    key: string,
    action: () => Promise<boolean | void>,
  ): Promise<void> => {
    if (operationRunning.current) return;
    operationRunning.current = true;
    setPending(key);
    try {
      if (await action()) navigate("/accounts");
    } catch (error) {
      void message.error(errorText(error));
    } finally {
      setPending(null);
      operationRunning.current = false;
    }
  };

  const disabled = pending !== null || authJsonImportState.status === "working";
  const cancel = async (): Promise<void> => {
    try {
      if (await authJsonCreateIndex.cancel()) setExpandedKey(null);
    } catch (error) {
      void message.error(errorText(error));
    }
  };
  const browserExpand = async (): Promise<void> => {
    if (disabled) return;
    setExpandedKey("browser");
    setBrowserLoading(true);
    try {
      setApplications(await authJsonCreateIndex.applicationsRead());
    } catch (error) {
      setExpandedKey(null);
      void message.error(errorText(error));
    } finally {
      setBrowserLoading(false);
    }
  };
  const electronOpen = (): void => {
    if (disabled) return;
    setExpandedKey("electron");
    void run("electron", () => authJsonCreateIndex.create({ type: "electron" }));
  };
  const rootCollapse = (key: RootKey): void => {
    if ((key === "browser" || key === "electron") && pending) {
      void cancel();
      return;
    }
    setExpandedKey(null);
  };

  const browserChildren: TreeDataNode[] = browserLoading
    ? [{ disabled: true, key: "browser-loading", title: "正在读取浏览器" }]
    : [
        ...applications.map(application => ({
          disabled,
          key: `browser:${application.id}`,
          title: application.name,
        })),
        ...(applications.length === 0
          ? [{ disabled: true, key: "browser-empty", title: "未找到可用浏览器" }]
          : []),
        { key: "browser-cancel", title: "取消" },
      ];
  const treeData: TreeDataNode[] = [
    {
      children: pending === "electron" ? [
        { disabled: true, key: "electron-pending", title: "正在等待官方登录" },
        { key: "electron-cancel", title: "取消" },
      ] : undefined,
      key: "electron",
      title: "内置创建并导入 auth.json",
    },
    {
      children: browserChildren,
      key: "browser",
      title: "从其他浏览器创建并导入 auth.json",
    },
    {
      children: [
        { disabled, key: "auth-default", title: "导入默认 auth.json" },
        { disabled, key: "auth-select", title: "选择 auth.json" },
        { disabled, key: "auth-clipboard", title: "从剪贴板导入 auth.json 内容" },
        { key: "auth-cancel", title: "取消" },
      ],
      key: "auth",
      title: "导入 auth.json",
    },
  ];
  const rootRead = (key: string): RootKey | undefined => (
    (["auth", "browser", "electron"] as const).find(value => value === key)
  );
  const nodeRun = (key: string): void => {
    if (key === "electron") {
      electronOpen();
      return;
    }
    if (rootRead(key)) return;
    if (key.endsWith("-cancel")) {
      rootCollapse(key.startsWith("auth")
        ? "auth"
        : key.startsWith("browser") ? "browser" : "electron");
      return;
    }
    if (disabled) return;
    if (key.startsWith("browser:")) {
      const application = applications.find(item => `browser:${item.id}` === key);
      if (application) {
        void run("browser", () => authJsonCreateIndex.create({
          browserId: application.id,
          type: "browser",
        }));
      }
      return;
    }
    if (key === "auth-default") void run("default", authJsonImportIndex.default);
    else if (key === "auth-select") void run("select", authJsonImportIndex.select);
    else if (key === "auth-clipboard") void run("clipboard", authJsonImportIndex.clipboard);
  };
  const compact = variant === "card";
  const titleRender = (node: TreeDataNode) => {
    const key = String(node.key);
    const title = typeof node.title === "function" ? node.title(node) : node.title;
    const icon = key === "electron"
      ? <LoginOutlined />
      : key === "browser" || key.startsWith("browser:")
        ? <GlobalOutlined />
        : key === "auth" || key === "auth-default"
          ? <FileSearchOutlined />
          : key === "auth-select"
            ? <FolderOpenOutlined />
            : key === "auth-clipboard"
              ? <CopyOutlined />
              : key.endsWith("-cancel")
                ? <CloseCircleOutlined />
                : null;
    const content = icon ? <Space size={6}>{icon}{title}</Space> : title;
    return !compact && rootRead(key) ? (
      <div style={{
        backdropFilter: "blur(18px) saturate(140%)",
        background: "rgba(255, 255, 255, 0.16)",
        borderRadius: 12,
        boxSizing: "border-box",
        padding: "10px 14px",
        width: "100%",
      }}>
        {content}
      </div>
    ) : content;
  };
  const actions = (
    <div style={{ maxWidth: compact ? undefined : 440, width: "100%" }}>
      <ConfigProvider theme={{
        components: { Tree: { nodeHoverBg: "transparent", nodeSelectedBg: "transparent" } },
        token: { colorBgContainer: "transparent", colorText: compact
          ? "rgba(0, 0, 0, 0.88)"
          : "rgba(255, 255, 255, 0.92)" },
      }}>
        <Tree
          blockNode
          expandAction="doubleClick"
          expandedKeys={expandedKey ? [expandedKey] : []}
          selectedKeys={[]}
          styles={{ itemSwitcher: { display: "none" } }}
          titleRender={titleRender}
          treeData={treeData}
          onExpand={(_keys, info) => {
            const root = rootRead(String(info.node.key));
            if (!root) return;
            if (!info.expanded) rootCollapse(root);
            else if (root === "browser") void browserExpand();
            else if (root !== "electron" && !disabled) setExpandedKey(root);
          }}
          onSelect={(_keys, info) => nodeRun(String(info.node.key))}
        />
      </ConfigProvider>
      {authJsonImportState.error && (
        <Alert
          description={authJsonImportState.error}
          message="账号添加失败"
          showIcon
          style={{ backdropFilter: "blur(18px)", marginTop: 12 }}
          type="error"
        />
      )}
    </div>
  );

  if (compact) {
    return (
      <Card
        style={{
          backdropFilter: "blur(20px) saturate(140%)",
          background: "rgba(255, 255, 255, 0.72)",
        }}
        title="添加账号"
        variant="borderless"
      >
        {actions}
      </Card>
    );
  }
  return (
    <div style={{ background: "#000", minHeight: "100vh", overflow: "hidden", position: "relative" }}>
      <Hyperspeed effectOptions={backgroundOptions} />
      <div style={{
        alignItems: "center",
        display: "flex",
        inset: 0,
        justifyContent: "center",
        padding: 24,
        position: "absolute",
      }}>
        {actions}
      </div>
    </div>
  );
};

export default AccountAdd;
