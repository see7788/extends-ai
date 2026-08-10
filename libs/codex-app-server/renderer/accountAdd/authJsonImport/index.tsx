import {
  CopyOutlined,
  FileSearchOutlined,
  FolderOpenOutlined,
} from "@ant-design/icons";
import { Alert, App as AntdApp, Button, Tree, type TreeDataNode } from "antd";
import { useEffect } from "react";
import { errorText } from "../../public/index.ts";
import GlassCard from "../../public/GlassCard.tsx";
import store from "../../store.ts";

const AuthJsonImport = () => {
  const { message } = AntdApp.useApp();
  const state = store(value => value.authJsonImport);
  const actions = store(value => value.authJsonImportActions);
  useEffect(() => actions.connect(), [actions]);
  const run = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action();
    } catch (error) {
      void message.error(errorText(error));
    }
  };
  const treeData: TreeDataNode[] = [
    {
      key: "default",
      title: (
        <Button
          disabled={state.status === "working"}
          icon={<FileSearchOutlined />}
          type="text"
          onClick={() => void run(actions.default)}
        >
          导入默认 auth.json
        </Button>
      ),
    },
    {
      key: "select",
      title: (
        <Button
          disabled={state.status === "working"}
          icon={<FolderOpenOutlined />}
          type="text"
          onClick={() => void run(actions.select)}
        >
          选择 auth.json
        </Button>
      ),
    },
    {
      key: "clipboard",
      title: (
        <Button
          disabled={state.status === "working"}
          icon={<CopyOutlined />}
          type="text"
          onClick={() => void run(actions.clipboard)}
        >
          从剪贴板导入 auth.json 内容
        </Button>
      ),
    },
  ];
  return (
    <GlassCard title="导入 auth.json">
      <Tree
        blockNode
        selectable={false}
        styles={{ root: { background: "transparent" } }}
        treeData={treeData}
      />
      {state.error ? (
        <Alert description={state.error} message="账号添加失败" showIcon type="error" />
      ) : null}
    </GlassCard>
  );
};

export default AuthJsonImport;
