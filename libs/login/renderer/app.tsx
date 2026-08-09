import { Masonry } from "antd";
import Hyperspeed from "extends-react/src/Hyperspeed";
import useAccounts from "./accounts/index.tsx";
import useCookieImport from "./cookieImport/index.tsx";
import useLogin from "./login/index.tsx";

const App = () => {
  const loginItems = useLogin();
  const accounts = useAccounts();
  const cookieImportItems = useCookieImport({
    identifiedBrowserIds: accounts.identifiedBrowserIds,
    identify: accounts.cookieImportConsume,
  });

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
          items={[...loginItems, ...cookieImportItems, ...accounts.items]}
        />
      </div>
    </div>
  );
};

export default App;
