import type { RouteObject } from "react-router-dom";
import AccountAdd from "./accountAdd/index.tsx";
import Account from "./accountList/account/index.tsx";
import AccountList from "./accountList/index.tsx";

const routers: RouteObject[] = [
  { path: "/", element: <AccountAdd /> },
  { path: "/account-add", element: <AccountAdd /> },
  { path: "/accounts", element: <AccountList /> },
  { path: "/accounts/:accountId", element: <Account /> },
];

export default routers;
