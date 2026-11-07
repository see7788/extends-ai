/// <reference types="vscode-webview" />

import { createRoot } from "react-dom/client";

const vscode = acquireVsCodeApi();
const root = document.getElementById("app");
if (!root) throw new Error("Remote Desktop Commander webview root element is missing");

createRoot(root).render(
  <main style={{ padding: 12, display: "grid", gap: 8, color: "var(--vscode-foreground)", background: "var(--vscode-sideBar-background)", fontFamily: "var(--vscode-font-family)" }}>
    <strong>Remote Desktop Commander</strong>
    <button onClick={() => vscode.postMessage({ type: "open" })} style={{ padding: "6px 10px", color: "var(--vscode-button-foreground)", background: "var(--vscode-button-background)", border: 0, borderRadius: 2, cursor: "pointer" }}>打开 VNC 浏览器</button>
  </main>,
);
