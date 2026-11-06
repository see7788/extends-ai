/// <reference types="chrome" />

import { createRoot } from "react-dom/client";
import { useState } from "react";

function PairPopup() {
  const [value, setValue] = useState("");
  const [status, setStatus] = useState("粘贴 VS Code 复制的连接 URL");

  const save = async () => {
    try {
      const url = new URL(value.trim());
      if (url.protocol !== "rdc-peer:" || url.hostname !== "connect") {
        throw new Error("连接地址格式不正确");
      }
      const port = Number(url.searchParams.get("port"));
      let config: RTCConfiguration = {};
      const configText = url.searchParams.get("config");
      if (configText) config = JSON.parse(configText) as RTCConfiguration;
      const pairConfig = {
        host: url.searchParams.get("host") ?? "",
        port,
        path: url.searchParams.get("path") ?? "/peerjs",
        key: url.searchParams.get("key") ?? "peerjs",
        secure: url.searchParams.get("secure") === "true",
        config,
        peerId: url.searchParams.get("peerId") ?? "",
        pairId: url.searchParams.get("pairId") ?? "",
        token: url.searchParams.get("token") ?? "",
        sessionId: url.searchParams.get("sessionId") ?? undefined,
      };
      if (!pairConfig.host || !Number.isInteger(port) || port <= 0 || !pairConfig.peerId || !pairConfig.pairId || !pairConfig.token) {
        throw new Error("连接 URL 缺少必要参数");
      }
      await chrome.storage.local.set({ pairConfig });
      setStatus("连接配置已保存，正在连接 VS Code");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  };

  const clear = async () => {
    await chrome.storage.local.remove("pairConfig");
    setValue("");
    setStatus("已断开连接");
  };

  return (
    <main style={{ width: 340, padding: 14, color: "var(--vscode-foreground, #222)", fontFamily: "system-ui" }}>
      <h3 style={{ margin: "0 0 10px" }}>Remote Desktop Commander</h3>
      <p style={{ fontSize: 12, opacity: 0.75 }}>{status}</p>
      <textarea
        value={value}
        onChange={event => setValue(event.target.value)}
        placeholder="rdc-peer://connect?..."
        rows={5}
        style={{ boxSizing: "border-box", width: "100%", resize: "vertical", padding: 8 }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button onClick={() => void save()} style={{ flex: 1 }}>连接</button>
        <button onClick={() => void clear()}>断开</button>
      </div>
    </main>
  );
}

const root = document.getElementById("app");
if (!root) throw new Error("Extension popup root is missing");
createRoot(root).render(<PairPopup />);
