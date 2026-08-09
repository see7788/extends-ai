import {
  CloseCircleOutlined,
  GlobalOutlined,
} from "@ant-design/icons";
import { App as AntdApp, Button, Flex, Tree, Typography } from "antd";
import browserIndex from "browser-partition-renderer/browser/index.ts";
import browserPartitionRenderer from "browser-partition-renderer/public.ts";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import GlassCard from "../public/GlassCard.tsx";
import store from "../store.ts";
import { cookieImport } from "./store.ts";

const stateSet = (input: unknown): void => {
  store.getState().cookieImportActions.stateSet(
    cookieImport.cookieImportValidator.parse(input),
  );
};
const cookieImportIndex = {
  async authorizationTimeoutSecondsSet(
    authorizationTimeoutSeconds: number,
  ): Promise<void> {
    await browserPartitionRenderer.invoke({
      channel: cookieImport.channel.authorizationTimeoutSecondsSet,
      input: { authorizationTimeoutSeconds },
      inputValidator: cookieImport.input.authorizationTimeoutSecondsSet,
      resultValidator: cookieImport.result.setting,
    });
  },
  async cancel(): Promise<boolean> {
    return (await browserPartitionRenderer.invoke({
      channel: cookieImport.channel.cancel,
      input: {},
      inputValidator: cookieImport.input.command,
      resultValidator: cookieImport.result.cancel,
    })).canceled;
  },
  async start(browserId: string): Promise<boolean> {
    return (await browserPartitionRenderer.invoke({
      channel: cookieImport.channel.start,
      input: { browserId },
      inputValidator: cookieImport.input.create,
      resultValidator: cookieImport.result.start,
    })).completed;
  },
  async stateRead(): Promise<void> {
    stateSet(await browserPartitionRenderer.read({
      channel: cookieImport.channel.stateRead,
      resultValidator: cookieImport.cookieImportValidator,
    }));
  },
  stateSubscribe(): () => void {
    return browserPartitionRenderer.subscribe({
      channel: cookieImport.channel.stateUpdated,
      resultValidator: cookieImport.cookieImportValidator,
      run: stateSet,
    });
  },
};

type BrowserApplication = Awaited<ReturnType<
  typeof browserIndex.applicationsRead
>>[number];
type CookieImportProps = {
  identify(): Promise<unknown>;
};

const useCookieImport = ({ identify }: CookieImportProps) => {
  const { message } = AntdApp.useApp();
  const accounts = useStore(store, state => state.accounts);
  const cookieImport = useStore(store, state => state.cookieImport);
  const [applications, setApplications] = useState<BrowserApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const errorShow = (error: unknown): void => {
    void message.error(error instanceof Error ? error.message : String(error));
  };

  useEffect(() => {
    void cookieImportIndex.stateRead().catch(errorShow);
    const dispose = cookieImportIndex.stateSubscribe();
    setLoading(true);
    void browserIndex.applicationsRead(browserPartitionRenderer.invoke)
      .then(setApplications)
      .catch(errorShow)
      .finally(() => setLoading(false));
    return dispose;
  }, []);

  useEffect(() => {
    if (!cookieImport.authorizationExpiresAt) return undefined;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [cookieImport.authorizationExpiresAt]);

  const authorizationSeconds = cookieImport.authorizationExpiresAt
    ? Math.max(0, Math.ceil(
      (Date.parse(cookieImport.authorizationExpiresAt) - now) / 1_000,
    ))
    : null;
  const accountValues = accounts.order
    .map(email => accounts.byEmail[email])
    .filter(value => value !== undefined);
  const treeData = applications.map(application => {
    const importedAccount = accountValues.find(account => account.sources.some(
      source => source.browserId === application.id,
    ));
    const active = cookieImport.activeBrowserId === application.id;
    const ready = cookieImport.status === "ready"
      && cookieImport.candidate?.browserId === application.id;
    return {
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
                icon={<CloseCircleOutlined />}
                type="text"
                onClick={() => void cookieImportIndex.cancel().catch(errorShow)}
              >
                取消
              </Button>
            ) : ready ? (
              <Flex align="center" gap={4}>
                <Typography.Text>待识别</Typography.Text>
                <Button type="text" onClick={() => void identify().catch(errorShow)}>
                  识别账号
                </Button>
              </Flex>
            ) : importedAccount ? (
              <Typography.Text>已导入</Typography.Text>
            ) : (
              <Button
                disabled={cookieImport.status === "ready"}
                icon={<GlobalOutlined />}
                type="text"
                onClick={() => void cookieImportIndex.start(application.id).catch(errorShow)}
              >
                导入
              </Button>
            )}
          </Flex>
        </Flex>
      ),
    };
  });
  if (treeData.length === 0 && !loading) {
    treeData.push({
      key: "cookieImport:empty",
      title: <Typography.Text>未发现浏览器</Typography.Text>,
    });
  }
  if (cookieImport.error) {
    treeData.push({
      key: "cookieImport:error",
      title: <Typography.Text>{cookieImport.error}</Typography.Text>,
    });
  }

  return [{
    children: (
      <GlassCard title="其他浏览器导入">
        <Tree
          blockNode
          selectable={false}
          styles={{ root: { background: "transparent" } }}
          treeData={treeData}
        />
      </GlassCard>
    ),
    data: null,
    key: "cookieImport",
  }];
};

export default useCookieImport;
