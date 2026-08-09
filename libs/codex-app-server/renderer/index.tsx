import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import { App as AntdApp, ConfigProvider } from "antd";
import { useStore } from "zustand";
import routers from "./routers.tsx";
import store from "./store/index.ts";

const router = createHashRouter(routers);
const Renderer = () => {
  const colorPrimary = useStore(store, state => state.theme.colorPrimary);
  return (
    <ConfigProvider theme={{ token: { borderRadius: 8, colorPrimary } }}>
      <AntdApp>
        <RouterProvider router={router} />
      </AntdApp>
    </ConfigProvider>
  );
};

const start = async (): Promise<void> => {
  const element = document.getElementById("root");
  if (!element) throw new Error("Renderer root element does not exist");
  const root = createRoot(element);
  root.render(
    <Renderer />,
  );
  if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
};

void start();

export default start;
