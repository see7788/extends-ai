import { App as AntdApp, ConfigProvider } from "antd";
import { Outlet } from "react-router-dom";
import { useStore } from "zustand";
import store from "./store.ts";

const App = () => {
  const colorPrimary = useStore(store, state => state.theme.colorPrimary);
  return (
    <ConfigProvider theme={{ token: { borderRadius: 8, colorPrimary } }}>
      <AntdApp>
        <Outlet />
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;
