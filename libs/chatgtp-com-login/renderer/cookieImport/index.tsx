import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  GlobalOutlined,
  ReloadOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { App as AntdApp, Button, Flex, Tree, Typography } from "antd";
import { useEffect, useState } from "react";
import GlassCard from "../public/GlassCard.tsx";
import store from "../store.ts";

type BrowserApplication = Awaited<ReturnType<
  ReturnType<typeof store.getState>["cookieImportActions"]["applicationsRead"]
>>[number];

const CookieImport = ({
  identifiedBrowserIds,
  identify,
}: {
  identifiedBrowserIds: ReadonlySet<string>;
  identify: () => Promise<unknown>;
}) => {
  const { message } = AntdApp.useApp();
  const cookieImportState = store(state => state.cookieImport);
  const actions = store(state => state.cookieImportActions);
  const [applications, setApplications] = useState<BrowserApplication[]>([]);
  const [identifying, setIdentifying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const errorShow = (error: unknown): void => {
    void message.error(error instanceof Error ? error.message : String(error));
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
    if (!cookieImportState.authorizationExpiresAt) return undefined;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [cookieImportState.authorizationExpiresAt]);

  const authorizationSeconds = cookieImportState.authorizationExpiresAt
    ? Math.max(0, Math.ceil(
      (Date.parse(cookieImportState.authorizationExpiresAt) - now) / 1_000,
    ))
    : null;
  const candidateIdentify = async (): Promise<void> => {
    setIdentifying(true);
    try {
      await identify();
    } catch (error) {
      errorShow(error);
    } finally {
      setIdentifying(false);
    }
  };
  const treeData = applications.map(application => {
    const imported = cookieImportState.history[application.id] !== undefined;
    const active = cookieImportState.activeBrowserId === application.id;
    const ready = cookieImportState.status === "ready"
      && cookieImportState.candidate?.browserId === application.id;
    const identified = identifiedBrowserIds.has(application.id);
    return {
      children: ready
        ? [{
            key: `cookieImport:${application.id}:candidate`,
            title: (
              <Flex align="center" gap={8} justify="space-between">
                <Typography.Text>已导入待识别</Typography.Text>
                <Button
                  aria-label="识别账号"
                  icon={<UserOutlined />}
                  iconPlacement="end"
                  loading={identifying}
                  style={{ whiteSpace: "nowrap" }}
                  title="识别账号"
                  type="text"
                  onClick={() => void candidateIdentify()}
                >
                  识别账号
                </Button>
              </Flex>
            ),
          }]
        : identified
          ? [{
              key: `cookieImport:${application.id}:identified`,
              title: (
                <Flex align="center" gap={8} justify="space-between">
                  <Typography.Text>已导入已识别</Typography.Text>
                  <Flex align="center" gap={4}>
                    <Typography.Text>识别完成</Typography.Text>
                    <CheckCircleOutlined />
                  </Flex>
                </Flex>
              ),
            }]
          : undefined,
      key: `cookieImport:${application.id}`,
      title: (
        <Flex align="center" gap={8} justify="space-between">
          <Typography.Text disabled={!application.importSupported} ellipsis>
            {application.name}
          </Typography.Text>
          <Flex align="center" gap={4}>
            {active && authorizationSeconds !== null ? (
              <Typography.Text>{authorizationSeconds} 秒</Typography.Text>
            ) : null}
            {!application.importSupported ? (
              <Typography.Text disabled>暂不支持</Typography.Text>
            ) : active ? (
              <Button
                aria-label={`取消导入 ${application.name}`}
                icon={<CloseCircleOutlined />}
                iconPlacement="end"
                style={{ whiteSpace: "nowrap" }}
                title="取消"
                type="text"
                onClick={() => void actions.cancel().catch(errorShow)}
              >
                取消
              </Button>
            ) : (
              <Button
                aria-label={`${imported ? "重新导入" : "导入"} ${application.name}`}
                disabled={cookieImportState.status === "working" || identifying}
                icon={imported ? <ReloadOutlined /> : <GlobalOutlined />}
                iconPlacement="end"
                style={{ whiteSpace: "nowrap" }}
                title={imported ? "重新导入" : "导入"}
                type="text"
                onClick={() => void actions.start({
                  browserId: application.id,
                }).catch(errorShow)}
              >
                {imported ? "重新导入" : "导入"}
              </Button>
            )}
          </Flex>
        </Flex>
      ),
    };
  });
  if (treeData.length === 0 && !loading) {
    treeData.push({
      children: undefined,
      key: "cookieImport:empty",
      title: <Typography.Text>未发现浏览器</Typography.Text>,
    });
  }
  if (cookieImportState.error) {
    treeData.push({
      children: undefined,
      key: "cookieImport:error",
      title: <Typography.Text>{cookieImportState.error}</Typography.Text>,
    });
  }

  return (
    <GlassCard title="其他浏览器导入">
      <Tree
        blockNode
        expandedKeys={treeData.map(node => node.key)}
        selectable={false}
        styles={{ root: { background: "transparent" } }}
        treeData={treeData}
      />
    </GlassCard>
  );
};

export default CookieImport;
