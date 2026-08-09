import { DeleteOutlined } from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
} from "antd";
import { errorText } from "../../public/index.ts";
import store from "../../store.ts";

const AccountRemove = ({ accountId }: { accountId: string }) => {
  const { message } = AntdApp.useApp();
  const accountDelete = store(state => state.accountsActions.accountDelete);
  const remove = (): void => {
    void (async () => {
      await accountDelete({ accountId });
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
