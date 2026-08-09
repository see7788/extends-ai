import type { RouteObject } from "react-router-dom";
import App from "./app.tsx";

const routers: RouteObject[] = [
  { path: "/", element: <App /> },
];

export default routers;
