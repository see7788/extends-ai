import {
  CloseCircleOutlined,
  GlobalOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { App as AntdApp, Button, Flex, Tree, Typography } from "antd";
import { browser } from "browser-partition-main/browser/store.ts";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import { errorText } from "../../public/index.ts";
import GlassCard from "../../public/GlassCard.tsx";
import store from "../../store.ts";
import { authJsonCreate } from "./store.ts";

type BrowserApplication = ReturnType<
  typeof browser.browserApplicationsValidator.parse
>[number];

const stateSet = (input: unknown): void => {
  store.getState().authJsonCreateActions.stateSet(
    authJsonCreate.authJsonCreateValidator.parse(input),
  );
};

const AuthJsonCreate = () => {
  const { message } = AntdApp.useApp();
  const state = useStore(store, value => value.authJsonCreate);
  const [applications, setApplications] = useState<BrowserApplication[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const errorShow = (error: unknown): void => {
    void message.error(errorText(error));
  };

  useEffect(() => {
    void read({
      channel: authJsonCreate.channel.stateRead,
      resultValidator: authJsonCreate.authJsonCreateValidator,
    }).then(stateSet).catch(errorShow);
    const dispose = subscribe({
      channel: authJsonCreate.channel.stateUpdated,
      resultValidator: authJsonCreate.authJsonCreateValidator,
      run: stateSet,
    });
    setLoading(true);
    void invoke({
      channel: browser.channel.applicationsRead,
      input: {},
      inputValidator: browser.input.command,
      resultValidator: browser.browserApplicationsValidator,
    })
      .then(setApplications)
      .catch(errorShow)
      .finally(() => setLoading(false));
    return dispose;
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
      await invoke({
        channel: authJsonCreate.channel.create,
        input: { browserId },
        inputValidator: authJsonCreate.input.create,
        resultValidator: authJsonCreate.result.create,
      });
    } catch (error) {
      errorShow(error);
    }
  };
  const cancel = (): void => {
    void invoke({
      channel: authJsonCreate.channel.cancel,
      input: {},
      inputValidator: authJsonCreate.input.command,
      resultValidator: authJsonCreate.result.cancel,
    }).catch(errorShow);
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
