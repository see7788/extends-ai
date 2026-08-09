import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import routers from "./routers.tsx";

const router = createHashRouter(routers);

const start = async (): Promise<void> => {
  const element = document.getElementById("root");
  if (!element) throw new Error("Renderer root element does not exist");
  const root = createRoot(element);
  root.render(
    <RouterProvider router={router} />,
  );
  if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
};

void start();

export default start;
