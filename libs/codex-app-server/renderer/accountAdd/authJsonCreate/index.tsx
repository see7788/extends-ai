import {
  CloseCircleOutlined,
  GlobalOutlined,
  LoginOutlined,
} from "@ant-design/icons";
import { App as AntdApp, Space, Tree, type TreeDataNode } from "antd";
import applicationsRead from "browser-partition-renderer/browser/index.ts";
import { invoke } from "browser-partition-renderer/public.ts";
import { authJsonCreate as producer } from "codex-app-server-main/accountAdd/authJsonCreate/store.ts";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import { errorText } from "../../public/index.ts";
import GlassCard from "../../public/GlassCard.tsx";
import store from "../../store.ts";

const AuthJsonCreate = () => {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const state = useStore(store, value => value.authJsonCreate);
  const running = useRef(false);
  const actions = store.getState().authJsonCreateActions;
  const run = async (
    pending: "browser" | "electron",
    input: unknown,
  ): Promise<void> => {
    if (running.current) return;
    running.current = true;
    actions.pendingSet({ pending });
    try {
      if ((await invoke({
        channel: producer.channel.create,
        input,
        inputValidator: producer.input.create,
        resultValidator: producer.result.create,
      })).created) navigate("/accounts");
    } catch (error) {
      void message.error(errorText(error));
    } finally {
      actions.pendingSet({ pending: null });
      running.current = false;
    }
  };
  const cancel = async (): Promise<void> => {
    try {
      if ((await invoke({
        channel: producer.channel.cancel,
        input: {},
        inputValidator: producer.input.command,
        resultValidator: producer.result.cancel,
      })).canceled) actions.pendingSet({ pending: null });
    } catch (error) {
      void message.error(errorText(error));
    }
  };
  const applicationsRefresh = async (): Promise<void> => {
    actions.browserLoadingSet({ browserLoading: true });
    try {
      actions.applicationsSet({ applications: await applicationsRead(invoke) });
    } catch (error) {
      void message.error(errorText(error));
    } finally {
      actions.browserLoadingSet({ browserLoading: false });
    }
  };
  useEffect(() => {
    void applicationsRefresh();
  }, []);
  const browserChildren: TreeDataNode[] = state.browserLoading
    ? [{ disabled: true, key: "browser:loading", title: "正在读取浏览器" }]
    : [
        ...state.applications.map(application => ({
          disabled: state.pending !== null,
          key: `browser:${application.id}`,
          title: application.name,
        })),
        ...(state.applications.length === 0
          ? [{ disabled: true, key: "browser:empty", title: "未找到可用浏览器" }]
          : []),
      ];
  const treeData: TreeDataNode[] = [
    {
      children: state.pending === "electron" ? [
        { disabled: true, key: "electron:pending", title: "正在等待官方登录" },
        { key: "electron:cancel", title: "取消" },
      ] : undefined,
      disabled: state.pending === "browser",
      key: "electron",
      title: "内置创建并导入 auth.json",
    },
    {
      children: browserChildren,
      disabled: state.pending === "electron",
      key: "browser",
      title: "从其他浏览器创建并导入 auth.json",
    },
  ];
  return (
    <GlassCard title="创建并导入 auth.json">
      <Tree
        blockNode
        defaultExpandedKeys={["browser"]}
        selectedKeys={[]}
        styles={{ root: { background: "transparent" } }}
        titleRender={node => {
          const key = String(node.key);
          const title = typeof node.title === "function" ? node.title(node) : node.title;
          const icon = key === "electron"
            ? <LoginOutlined />
            : key.startsWith("browser")
              ? <GlobalOutlined />
              : key.endsWith("cancel") ? <CloseCircleOutlined /> : null;
          return <Space size={6}>{icon}{title}</Space>;
        }}
        treeData={treeData}
        onExpand={(_keys, info) => {
          if (info.expanded && info.node.key === "browser") void applicationsRefresh();
        }}
        onSelect={(_keys, info) => {
          const key = String(info.node.key);
          if (key === "electron" && state.pending === null) {
            void run("electron", { type: "electron" });
          } else if (key === "electron:cancel") {
            void cancel();
          } else if (key.startsWith("browser:") && !key.endsWith("loading")
            && !key.endsWith("empty") && state.pending === null) {
            void run("browser", { browserId: key.slice("browser:".length), type: "browser" });
          }
        }}
      />
    </GlassCard>
  );
};

export default AuthJsonCreate;
