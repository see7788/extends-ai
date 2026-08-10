import { Masonry } from "antd";
import Hyperspeed from "extends-react/src/Hyperspeed";
import { useEffect } from "react";
import Account from "./accounts/index.tsx";
import CookieImport from "./cookieImport/index.tsx";
import Login from "./login/index.tsx";
import store from "./store.ts";

const App = () => {
  const accountsState = store(state => state.accounts);
  const identify = store(state => state.accountsActions.cookieImportConsume);

  useEffect(() => store.getState().accountsActions.connect(), []);

  const identifiedBrowserIds = new Set(accountsState.order.flatMap(email => (
    accountsState.byEmail[email]?.sources.map(source => source.browserId) ?? []
  )));
  const items = [
    { children: <Login />, data: null, key: "login" },
    {
      children: (
        <CookieImport
          identifiedBrowserIds={identifiedBrowserIds}
          identify={identify}
        />
      ),
      data: null,
      key: "cookieImport",
    },
    ...accountsState.order.map(email => ({
      children: <Account email={email} />,
      data: null,
      key: `account:${email}`,
    })),
  ];

  return (
    <div style={{ background: "#000", minHeight: "100vh", overflow: "hidden", position: "relative" }}>
      <Hyperspeed />
      <div style={{
        boxSizing: "border-box",
        height: "100vh",
        inset: 0,
        overflowY: "auto",
        padding: 28,
        position: "absolute",
      }}>
        <Masonry
          columns={{ xs: 1, sm: 2, lg: 3, xl: 4 }}
          gutter={16}
          items={items}
        />
      </div>
    </div>
  );
};

export default App;
