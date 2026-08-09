import type { RouteObject } from "react-router-dom";
import AccountAdd from "./accountAdd/index.tsx";
import AccountList, { AccountPage } from "./accountList/index.tsx";
import App from "./app.tsx";

const routers: RouteObject[] = [
  {
    element: <App />,
    children: [
      { path: "/", element: <AccountAdd /> },
      { path: "/account-add", element: <AccountAdd /> },
      { path: "/accounts", element: <AccountList /> },
      { path: "/accounts/:accountId", element: <AccountPage /> },
    ],
  },
];

export default routers;
