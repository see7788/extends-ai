﻿import React from "react";
import ReactDOM from "react-dom/client";
import { ConfigProvider, theme } from "antd";
import "antd/dist/reset.css";
import App from "./App.js";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm, token: { colorPrimary: "#16a34a", colorSuccess: "#16a34a" } }}>
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);