import {
  CloseCircleOutlined,
  GlobalOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { App as AntdApp, Button, Flex, Tree, Typography } from "antd";
import { useEffect, useState } from "react";
import { errorText } from "../../public/index.ts";
import GlassCard from "../../public/GlassCard.tsx";
import store from "../../store.ts";
type BrowserApplication = Awaited<ReturnType<
  ReturnType<typeof store.getState>["authJsonCreateActions"]["applicationsRead"]
>>[number];

const AuthJsonCreate = () => {
  const { message } = AntdApp.useApp();
  const state = store(value => value.authJsonCreate);
  const actions = store(value => value.authJsonCreateActions);
  const [applications, setApplications] = useState<BrowserApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const errorShow = (error: unknown): void => {
    void message.error(errorText(error));
  };

  useEffect(() => actions.connect(), [actions]);

  useEffect(() => {
    setLoading(true);
    void actions.applicationsRead()
      .then(setApplications)
      .catch(errorShow)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!state.authorizationExpiresAt) return undefined;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [state.authorizationExpiresAt]);

  const authorizationSeconds = state.authorizationExpiresAt
    ? Math.max(0, Math.ceil(
      (Date.parse(state.authorizationExpiresAt) - now) / 1_000,
    ))
    : null;
  const run = async (browserId: string): Promise<void> => {
    try {
      await actions.create({ browserId });
    } catch (error) {
      errorShow(error);
    }
  };
  const cancel = (): void => {
    void actions.cancel().catch(errorShow);
  };
  const treeData = applications.map(application => {
    const active = state.activeBrowserId === application.id;
    const imported = state.history[application.id] !== undefined;
    return {
      key: `authJsonCreate:${application.id}`,
      title: (
        <Flex align="center" gap={8} justify="space-between">
          <Typography.Text ellipsis>{application.name}</Typography.Text>
          <Flex align="center" gap={4}>
            {active && authorizationSeconds !== null ? (
              <Typography.Text>{authorizationSeconds} 秒</Typography.Text>
            ) : null}
            {active ? (
              <Button
                aria-label={`取消 ${application.name}`}
                icon={<CloseCircleOutlined />}
                iconPlacement="end"
                style={{ whiteSpace: "nowrap" }}
                title="取消"
                type="text"
                onClick={cancel}
              >
                取消
              </Button>
            ) : (
              <Button
                aria-label={`${imported ? "重新导入" : "创建并导入"} ${application.name}`}
                disabled={state.status === "working"}
                icon={imported ? <ReloadOutlined /> : <GlobalOutlined />}
                iconPlacement="end"
                style={{ whiteSpace: "nowrap" }}
                title={imported ? "重新导入" : "创建并导入"}
                type="text"
                onClick={() => void run(application.id)}
              >
                {imported ? "重新导入" : "创建并导入"}
              </Button>
            )}
          </Flex>
        </Flex>
      ),
    };
  });
  if (treeData.length === 0 && !loading) {
    treeData.push({
      key: "authJsonCreate:empty",
      title: <Typography.Text>未发现浏览器</Typography.Text>,
    });
  }

  return (
    <GlassCard title="创建并导入 auth.json">
      <Tree
        blockNode
        selectable={false}
        styles={{ root: { background: "transparent" } }}
        treeData={treeData}
      />
    </GlassCard>
  );
};

export default AuthJsonCreate;
