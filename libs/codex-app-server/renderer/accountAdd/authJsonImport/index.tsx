import {
  CopyOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import { Alert, App as AntdApp, Space, Tree, type TreeDataNode } from "antd";
import { errorText } from "../../public/index.ts";
import GlassCard from "../../public/GlassCard.tsx";
import store from "../../store.ts";

const AuthJsonImport = () => {
  const { message } = AntdApp.useApp();
  const state = store(value => value.authJsonImport);
  const actions = store(value => value.authJsonImportActions);
  const run = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action();
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
          if (key === "default") void run(actions.default);
          else if (key === "select") void run(actions.select);
          else if (key === "clipboard") void run(actions.clipboard);
        }}
      />
      {state.error ? (
        <Alert description={state.error} message="账号添加失败" showIcon type="error" />
      ) : null}
    </GlassCard>
  );
};

export default AuthJsonImport;
