import { CloseCircleOutlined, LoginOutlined } from "@ant-design/icons";
import { App as AntdApp, Button, Flex, Tree, Typography } from "antd";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import { useEffect } from "react";
import GlassCard from "../public/GlassCard.tsx";
import store from "../store.ts";
import { login } from "./store.ts";

const useLogin = () => {
  const { message } = AntdApp.useApp();
  const loginState = store(state => state.login);
  const errorShow = (error: unknown): void => {
    void message.error(error instanceof Error ? error.message : String(error));
  };
  useEffect(() => {
    void read({
      channel: login.channel.stateRead,
      resultValidator: login.loginValidator,
    }).then(store.getState().loginActions.stateSet).catch(errorShow);
    return subscribe({
      channel: login.channel.stateUpdated,
      resultValidator: login.loginValidator,
      run: store.getState().loginActions.stateSet,
    });
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
                {loginState.status === "open" ? (
                  <Button
                    icon={<CloseCircleOutlined />}
                    type="text"
                    onClick={() => void invoke({
                      channel: login.channel.cancel,
                      input: {},
                      inputValidator: login.input.command,
                      resultValidator: login.result.cancel,
                    }).catch(errorShow)}
                  >
                    取消
                  </Button>
                ) : (
                  <Button
                    icon={<LoginOutlined />}
                    type="text"
                    onClick={() => void invoke({
                      channel: login.channel.start,
                      input: {},
                      inputValidator: login.input.command,
                      resultValidator: login.result.start,
                    }).catch(errorShow)}
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
