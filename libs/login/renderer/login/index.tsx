import { CloseCircleOutlined, LoginOutlined } from "@ant-design/icons";
import { App as AntdApp, Button, Flex, Tree, Typography } from "antd";
import GlassCard from "../public/GlassCard.tsx";
import store from "../store.ts";

const Login = () => {
  const { message } = AntdApp.useApp();
  const loginState = store(state => state.login);
  const actions = store(state => state.loginActions);
  const errorShow = (error: unknown): void => {
    void message.error(error instanceof Error ? error.message : String(error));
  };

  return (
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
                  onClick={() => void actions.cancel().catch(errorShow)}
                >
                  取消
                </Button>
              ) : (
                <Button
                  icon={<LoginOutlined />}
                  type="text"
                  onClick={() => void actions.start().catch(errorShow)}
                >
                  登录
                </Button>
              )}
            </Flex>
          ),
        }]}
      />
    </GlassCard>
  );
};

export default Login;
