import { App as AntdApp } from "antd";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import routers from "./routers.tsx";

const router = createHashRouter(routers);
const root = createRoot(document.getElementById("root")!);

root.render(
  <AntdApp>
    <RouterProvider router={router} />
  </AntdApp>,
);

if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
