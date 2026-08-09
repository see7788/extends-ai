import { App as AntdApp, ConfigProvider } from "antd";
import { Outlet } from "react-router-dom";
import store from "./store.ts";

const App = () => {
  const colorPrimary = store(state => state.theme.colorPrimary);
  return (
    <ConfigProvider theme={{ token: { borderRadius: 8, colorPrimary } }}>
      <AntdApp>
        <Outlet />
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;
