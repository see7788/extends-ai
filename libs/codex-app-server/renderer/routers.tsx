import type { RouteObject } from "react-router-dom";
import Account from "./app/account.tsx";
import AccountList from "./app/accountList.tsx";
import App from "./app/index.tsx";
import AccountAdd from "./app/accountAdd.tsx";

const routers: RouteObject[] = [
  {
    element: <App />,
    children: [
      { path: "/", element: <AccountAdd /> },
      { path: "/account-add", element: <AccountAdd /> },
      { path: "/accounts", element: <AccountList /> },
      { path: "/accounts/:accountId", element: <Account /> },
    ],
  },
];

export default routers;
