import {
  CopyOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import { Alert, App as AntdApp, Space, Tree, type TreeDataNode } from "antd";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "zustand";
import { errorText } from "../../public/index.ts";
import GlassCard from "../../public/GlassCard.tsx";
import store from "../../store.ts";
import { authJsonImport } from "./store.ts";

const stateSet = (input: unknown): void => {
  store.getState().authJsonImportActions.stateSet(
    authJsonImport.authJsonImportValidator.parse(input),
  );
};
const invokeImport = async (channel: string): Promise<boolean> => (
  (await invoke({
    channel,
    input: {},
    inputValidator: authJsonImport.input.command,
    resultValidator: authJsonImport.result.import,
  })).imported
);
const authJsonImportIndex = {
  clipboard: () => invokeImport(authJsonImport.channel.clipboard),
  default: () => invokeImport(authJsonImport.channel.default),
  select: () => invokeImport(authJsonImport.channel.select),
  async stateRead(): Promise<void> {
    stateSet(await read({
      channel: authJsonImport.channel.stateRead,
      resultValidator: authJsonImport.authJsonImportValidator,
    }));
  },
  stateSubscribe(): () => void {
    return subscribe({
      channel: authJsonImport.channel.stateUpdated,
      resultValidator: authJsonImport.authJsonImportValidator,
      run: stateSet,
    });
  },
};

const AuthJsonImport = () => {
  const { message } = AntdApp.useApp();
  const navigate = useNavigate();
  const state = useStore(store, value => value.authJsonImport);
  const running = useRef(false);
  useEffect(() => {
    void authJsonImportIndex.stateRead().catch(error => {
      void message.error(errorText(error));
    });
    return authJsonImportIndex.stateSubscribe();
  }, []);
  const run = async (action: () => Promise<boolean>): Promise<void> => {
    if (running.current || state.status === "working") return;
    running.current = true;
    try {
      if (await action()) navigate("/accounts");
    } catch (error) {
      void message.error(errorText(error));
    } finally {
      running.current = false;
    }
  };
  const treeData: TreeDataNode[] = [
    { disabled: state.status === "working", key: "default", title: "导入默认 auth.json" },
    { disabled: state.status === "working", key: "select", title: "选择 auth.json" },
    { disabled: state.status === "working", key: "clipboard", title: "从剪贴板导入 auth.json 内容" },
  ];
  return (
    <GlassCard title="导入 auth.json">
      <Tree
        blockNode
        selectedKeys={[]}
        styles={{ root: { background: "transparent" } }}
        titleRender={node => {
          const key = String(node.key);
          const title = typeof node.title === "function" ? node.title(node) : node.title;
          const icon = key === "default"
            ? <FileSearchOutlined />
            : key === "select" ? <FolderOpenOutlined /> : <CopyOutlined />;
          return <Space size={6}>{icon}{title}</Space>;
        }}
        treeData={treeData}
        onSelect={(_keys, info) => {
          const key = String(info.node.key);
          if (key === "default") void run(authJsonImportIndex.default);
          else if (key === "select") void run(authJsonImportIndex.select);
          else if (key === "clipboard") void run(authJsonImportIndex.clipboard);
        }}
      />
      {state.error ? (
        <Alert description={state.error} message="账号添加失败" showIcon type="error" />
      ) : null}
    </GlassCard>
  );
};

export default AuthJsonImport;
