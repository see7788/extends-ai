import { DeleteOutlined } from "@ant-design/icons";
import {
  App as AntdApp,
  Button,
  Empty,
  Popconfirm,
} from "antd";
import { invoke, read, subscribe } from "browser-partition-renderer/public.ts";
import { useEffect } from "react";
import { useStore } from "zustand";
import { errorText } from "../../public/index.ts";
import GlassCard from "../../public/GlassCard.tsx";
import store from "../../store.ts";
import { accounts, type AccountsDeleteInput } from "./store.ts";

const accountsIndex = {
  async delete(input: AccountsDeleteInput): Promise<void> {
    await invoke({
      channel: accounts.channel.accountDelete,
      input,
      inputValidator: accounts.input.accountDelete,
      resultValidator: accounts.resultValidator,
    });
    await accountsIndex.stateRead();
  },
  async stateRead(): Promise<void> {
    const state = await read({
      channel: accounts.channel.stateRead,
      resultValidator: accounts.accountsValidator,
    });
    store.getState().accountsActions.stateSet(state);
  },
  stateSubscribe(): () => void {
    return subscribe({
      channel: accounts.channel.stateUpdated,
      resultValidator: accounts.accountsValidator,
      run: store.getState().accountsActions.stateSet,
    });
  },
};

const useAccounts = (): string[] => {
  const { message } = AntdApp.useApp();
  const order = useStore(store, state => state.accounts.order);
  useEffect(() => {
    void accountsIndex.stateRead().catch(error => {
      void message.error(errorText(error));
    });
    return accountsIndex.stateSubscribe();
  }, []);
  return order;
};

const AccountRemove = ({ accountId }: { accountId: string }) => {
  const { message } = AntdApp.useApp();
  return (
    <Popconfirm
      cancelText="取消"
      description="只移除管理记录，不删除托管文件。"
      okText="移出"
      title="移出账号管理"
      onConfirm={() => accountsIndex.delete({ accountId }).catch(error => {
        void message.error(errorText(error));
      })}
    >
      <Button danger icon={<DeleteOutlined />} size="small" type="text">
        移出管理
      </Button>
    </Popconfirm>
  );
};

const AccountsEmpty = () => (
  <GlassCard title="已有账号">
    <Empty description="尚未添加账号" />
  </GlassCard>
);

export { AccountRemove, AccountsEmpty };
export default useAccounts;
