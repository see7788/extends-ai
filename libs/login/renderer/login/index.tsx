import {
  CloseCircleOutlined,
  LoginOutlined,
} from "@ant-design/icons";
import { App as AntdApp, Button, Flex, Tree, Typography } from "antd";
import loginRenderer from "browser-partition-renderer/public.ts";
import { useEffect } from "react";
import { useStore } from "zustand";
import GlassCard from "../public/GlassCard.tsx";
import store from "../store.ts";
import { login } from "./store.ts";

const stateSet = (input: unknown): void => {
  store.getState().loginActions.stateSet(login.loginValidator.parse(input));
};
const loginIndex = {
  async cancel(): Promise<boolean> {
    return (await loginRenderer.invoke({
      channel: login.channel.cancel,
      input: {},
      inputValidator: login.input.command,
      resultValidator: login.result.cancel,
    })).canceled;
  },
  async start(): Promise<boolean> {
    return (await loginRenderer.invoke({
      channel: login.channel.start,
      input: {},
      inputValidator: login.input.command,
      resultValidator: login.result.start,
    })).completed;
  },
  async stateRead(): Promise<void> {
    stateSet(await loginRenderer.read({
      channel: login.channel.stateRead,
      resultValidator: login.loginValidator,
    }));
  },
  stateSubscribe(): () => void {
    return loginRenderer.subscribe({
      channel: login.channel.stateUpdated,
      resultValidator: login.loginValidator,
      run: stateSet,
    });
  },
};

const useLogin = () => {
  const { message } = AntdApp.useApp();
  const login = useStore(store, state => state.login);
  const errorShow = (error: unknown): void => {
    void message.error(error instanceof Error ? error.message : String(error));
  };
  useEffect(() => {
    void loginIndex.stateRead().catch(errorShow);
    return loginIndex.stateSubscribe();
  }, []);

  return [{
    children: (
      <GlassCard title="内嵌登录">
        <Tree
          blockNode
          selectable={false}
          styles={{ root: { background: "transparent" } }}
          treeData={[{
            key: "login:chatgpt",
            title: (
              <Flex align="center" gap={8} justify="space-between">
                <Typography.Text>ChatGPT.com</Typography.Text>
                {login.status === "open" ? (
                  <Button
                    icon={<CloseCircleOutlined />}
                    type="text"
                    onClick={() => void loginIndex.cancel().catch(errorShow)}
                  >
                    取消
                  </Button>
                ) : login.status === "ready" ? (
                  <Typography.Text>登录完成</Typography.Text>
                ) : (
                  <Button
                    icon={<LoginOutlined />}
                    type="text"
                    onClick={() => void loginIndex.start().catch(errorShow)}
                  >
                    登录
                  </Button>
                )}
              </Flex>
            ),
          }]}
        />
      </GlassCard>
    ),
    data: null,
    key: "login",
  }];
};

export default useLogin;
