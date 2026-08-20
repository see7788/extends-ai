import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import routers from "./routers.tsx";

const element = document.getElementById("root");
if (!element) throw new Error("Tree Ask root element does not exist");
const router = createHashRouter(routers);
const root = createRoot(element);
root.render(<RouterProvider router={router} />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
