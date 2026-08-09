import {
  CopyOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import { Alert, App as AntdApp, Space, Tree, type TreeDataNode } from "antd";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import { useEffect } from "react";
import { errorText } from "../../public/index.ts";
import GlassCard from "../../public/GlassCard.tsx";
import store from "../../store.ts";
import { authJsonImport } from "./store.ts";

const AuthJsonImport = () => {
  const { message } = AntdApp.useApp();
  const state = store(value => value.authJsonImport);
  useEffect(() => {
    void read({
      channel: authJsonImport.channel.stateRead,
      resultValidator: authJsonImport.authJsonImportValidator,
    }).then(store.getState().authJsonImportActions.stateSet).catch(error => {
      void message.error(errorText(error));
    });
    return subscribe({
      channel: authJsonImport.channel.stateUpdated,
      resultValidator: authJsonImport.authJsonImportValidator,
      run: store.getState().authJsonImportActions.stateSet,
    });
  }, []);
  const run = async (channel: string): Promise<void> => {
    try {
      await invoke({
        channel,
        input: {},
        inputValidator: authJsonImport.input.command,
        resultValidator: authJsonImport.result.import,
      });
    } catch (error) {
      void message.error(errorText(error));
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
          if (key === "default") void run(authJsonImport.channel.default);
          else if (key === "select") void run(authJsonImport.channel.select);
          else if (key === "clipboard") void run(authJsonImport.channel.clipboard);
        }}
      />
      {state.error ? (
        <Alert description={state.error} message="账号添加失败" showIcon type="error" />
      ) : null}
    </GlassCard>
  );
};

export default AuthJsonImport;
