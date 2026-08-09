import { DeleteOutlined } from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
} from "antd";
import { invoke } from "browser-partition-renderer/public.ts";
import { errorText } from "../../public/index.ts";
import store from "../../store.ts";
import { accounts } from "./store.ts";

const AccountRemove = ({ accountId }: { accountId: string }) => {
  const { message } = AntdApp.useApp();
  const remove = (): void => {
    void (async () => {
      await invoke({
        channel: accounts.channel.accountDelete,
        input: { accountId },
        inputValidator: accounts.input.accountDelete,
        resultValidator: accounts.resultValidator,
      });
    })().catch(error => void message.error(errorText(error)));
  };
  return (
    <Button
      icon={<DeleteOutlined />}
      size="small"
      type="text"
      onClick={remove}
    >
      移出管理
    </Button>
  );
};

export default AccountRemove;
