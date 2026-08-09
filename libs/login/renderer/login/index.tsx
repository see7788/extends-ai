import {
  CloseCircleOutlined,
  LoginOutlined,
} from "@ant-design/icons";
import { App as AntdApp, Button, Flex, Tree, Typography } from "antd";
import { useEffect } from "react";
import { useStore } from "zustand";
import GlassCard from "../public/GlassCard.tsx";
import store from "../store.ts";
import loginIndex from "./index.ts";

type LoginProps = {
  identify(): Promise<unknown>;
};

const useLogin = ({ identify }: LoginProps) => {
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
                  <Flex align="center" gap={4}>
                    <Typography.Text>待识别</Typography.Text>
                    <Button
                      type="text"
                      onClick={() => void identify().catch(errorShow)}
                    >
                      识别账号
                    </Button>
                  </Flex>
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
