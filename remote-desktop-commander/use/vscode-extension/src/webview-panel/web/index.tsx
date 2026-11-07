/// <reference types="vscode-webview" />
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";
type HostMessage = { type: "status"; message: string; tone?: "ok" | "error" | "info" };
function App() {
  const vscode = useRef(acquireVsCodeApi()).current;
  const [url, setUrl] = useState("");
  const [connectedUrl, setConnectedUrl] = useState("");
  const [status, setStatus] = useState("输入当前 VNC 实例的 Web 地址");
  const [tone, setTone] = useState<"ok" | "error" | "info">("info");
  useEffect(() => {
    const saved = vscode.getState() as { url?: string } | undefined;
    if (saved?.url) {
      setUrl(saved.url);
      setConnectedUrl(saved.url);
      vscode.postMessage({ type: "vnc.open", url: saved.url });
    }
    const listener = (event: MessageEvent<HostMessage>) => {
      if (event.data.type !== "status") return;
      setStatus(event.data.message);
      setTone(event.data.tone ?? "info");
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, [vscode]);
  const open = () => {
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("VNC 地址必须使用 HTTP 或 HTTPS");
      const value = parsed.toString();
      vscode.setState({ url: value });
      setConnectedUrl(value);
      vscode.postMessage({ type: "vnc.open", url: value });
      setStatus("正在连接 VNC…");
      setTone("info");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
      setTone("error");
    }
  };
  const color = tone === "ok" ? "var(--vscode-testing-iconPassed)" : tone === "error" ? "var(--vscode-errorForeground)" : "var(--vscode-descriptionForeground)";
  return (
    <main style={{ height: "100vh", boxSizing: "border-box", display: "flex", flexDirection: "column", color: "var(--vscode-foreground)", background: "var(--vscode-editor-background)", fontFamily: "var(--vscode-font-family)" }}>
      <header style={{ padding: "8px 12px", display: "flex", gap: 8, alignItems: "center", borderBottom: "1px solid var(--vscode-panel-border)" }}>
        <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === "Enter") open(); }} placeholder="https://vnc.example.com:10003/?rdcInstanceId=…" style={{ flex: 1, minWidth: 0, padding: 6, color: "var(--vscode-input-foreground)", background: "var(--vscode-input-background)", border: "1px solid var(--vscode-input-border)" }} />
        <button onClick={open}>连接 VNC</button>
      </header>
      <div style={{ padding: "4px 12px", fontSize: 11, color }}>{status}</div>
      <iframe title="KasmVNC" src={connectedUrl || "about:blank"} allow="clipboard-read; clipboard-write; fullscreen" style={{ flex: 1, width: "100%", minHeight: 0, border: 0, background: "var(--vscode-editor-background)" }} />
    </main>
  );
}
const root = document.getElementById("app");
if (!root) throw new Error("Remote Desktop Commander webview root element is missing");
createRoot(root).render(<App />);
