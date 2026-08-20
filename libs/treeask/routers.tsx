import type { RouteObject } from "react-router-dom";
import Codexcli from "./codexcli/index.tsx";

const routers: RouteObject[] = [
  { path: "/", element: <Codexcli /> },
];

export default routers;
