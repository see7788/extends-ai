import { Masonry } from "antd";
import Hyperspeed from "extends-react/src/Hyperspeed";
import AuthJsonCreate from "../accountAdd/authJsonCreate/index.tsx";
import AuthJsonImport from "../accountAdd/authJsonImport/index.tsx";

const AccountAdd = () => (
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
        columns={{ xs: 1, sm: 2 }}
        gutter={16}
        items={[
          { children: <AuthJsonCreate />, data: null, key: "auth-json-create" },
          { children: <AuthJsonImport />, data: null, key: "auth-json-import" },
        ]}
      />
    </div>
  </div>
);

export default AccountAdd;
