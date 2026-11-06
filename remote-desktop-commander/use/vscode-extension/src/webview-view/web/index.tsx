/// <reference types="vscode-webview" />

import { createRoot } from "react-dom/client";

const vscode = acquireVsCodeApi();
const root = document.getElementById("app");
if (!root) throw new Error("Remote Desktop Commander webview root element is missing");

createRoot(root).render(
  <main style={{ padding: 12, display: "grid", gap: 8 }}>
    <strong>Remote Desktop Commander</strong>
    <button onClick={() => vscode.postMessage({ type: "open" })}>打开远程浏览器</button>
    <button onClick={() => vscode.postMessage({ type: "configure" })}>配置 Hono 服务器</button>
  </main>,
);
