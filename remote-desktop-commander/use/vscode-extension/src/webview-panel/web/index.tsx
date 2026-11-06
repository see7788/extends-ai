/// <reference types="vscode-webview" />

import Peer, { type DataConnection } from "peerjs";
import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState } from "react";

type PeerEndpoint = {
  host: string;
  port: number;
  path: string;
  key?: string;
  secure?: boolean;
  config?: RTCConfiguration;
};

type HostMessage =
  | { type: "init"; serverUrl: string; workspacePath?: string; topicId?: string; sessionId?: string }
  | { type: "session.ready"; sessionId: string; url: string }
  | { type: "peer.endpoint"; endpoint: PeerEndpoint }
  | { type: "peer.pair"; pairId: string; token: string; url: string; expiresAt: number }
  | { type: "chat.submit"; requestId: string; text: string }
  | { type: "topic.select"; topicId: string }
  | { type: "status"; message: string; tone?: "ok" | "warn" | "error" }
  | { type: "error"; message: string };

function App() {
  const vscode = useRef(acquireVsCodeApi()).current;
  const peer = useRef<Peer | undefined>(undefined);
  const connection = useRef<DataConnection | undefined>(undefined);
  const pair = useRef<{ pairId: string; token: string; expiresAt: number } | undefined>(undefined);
  const [serverUrl, setServerUrl] = useState("");
  const [serverInput, setServerInput] = useState("");
  const [workspacePath, setWorkspacePath] = useState("");
  const [topicId, setTopicId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [kasmUrl, setKasmUrl] = useState("");
  const [pairUrl, setPairUrl] = useState("");
  const [status, setStatus] = useState("Waiting for Extension Host");
  const [peerStatus, setPeerStatus] = useState("Not connected");
  const [busy, setBusy] = useState(false);

  const post = (message: Record<string, unknown>) => vscode.postMessage(message);

  useEffect(() => {
    const listener = (event: MessageEvent<HostMessage>) => {
      const message = event.data;
      if (message.type === "init") {
        setServerUrl(message.serverUrl);
        setServerInput(message.serverUrl);
        setWorkspacePath(message.workspacePath ?? "");
        setTopicId(message.topicId ?? "");
        if (message.sessionId) setSessionId(message.sessionId);
        return;
      }
      if (message.type === "session.ready") {
        setBusy(false);
        setSessionId(message.sessionId);
        setKasmUrl(message.url);
        setStatus("Remote browser started");
        return;
      }
      if (message.type === "peer.endpoint") {
        peer.current?.destroy();
        connection.current = undefined;
        const nextPeer = new Peer("", {
          host: message.endpoint.host,
          port: message.endpoint.port,
          path: message.endpoint.path,
          key: message.endpoint.key,
          secure: message.endpoint.secure,
          config: message.endpoint.config,
          debug: 1,
        });
        peer.current = nextPeer;
        setPeerStatus("Connecting to PeerJS");
        nextPeer.on("open", peerId => {
          setBusy(false);
          setPeerStatus("PeerJS ready");
          post({ type: "peer.ready", peerId });
        });
        nextPeer.on("connection", incoming => {
          const metadata = incoming.metadata as { pairId?: string; token?: string } | undefined;
          if (!pair.current || Date.now() > pair.current.expiresAt || metadata?.pairId !== pair.current.pairId || metadata?.token !== pair.current.token) {
            incoming.close();
            return;
          }
          connection.current?.close();
          connection.current = incoming;
          incoming.on("open", () => {
            setPeerStatus("ChatGPT browser connected");
            incoming.send({ type: "bridge.ready" });
            if (topicId) incoming.send({ type: "topic.select", topicId });
            post({ type: "peer.connected" });
          });
          incoming.on("data", data => post({ type: "peer.message", data }));
          incoming.on("close", () => {
            if (connection.current === incoming) connection.current = undefined;
            setPeerStatus("Browser disconnected");
          });
          incoming.on("error", error => setPeerStatus(error.message));
        });
        nextPeer.on("error", error => {
          setBusy(false);
          setPeerStatus("PeerJS error: " + error.message);
        });
        return;
      }
      if (message.type === "peer.pair") {
        pair.current = { pairId: message.pairId, token: message.token, expiresAt: message.expiresAt };
        setPairUrl(message.url);
        setStatus("Pair URL created. Paste it into the Chrome extension popup.");
        return;
      }
      if (message.type === "chat.submit") {
        connection.current?.send({
          type: "chat.submit",
          requestId: message.requestId,
          text: message.text,
        });
        return;
      }
      if (message.type === "topic.select") {
        connection.current?.send({ type: "topic.select", topicId: message.topicId });
        return;
      }
      if (message.type === "status") {
        setStatus(message.message);
        return;
      }
      if (message.type === "error") {
        setBusy(false);
        setStatus(message.message);
      }
    };
    window.addEventListener("message", listener);
    post({ type: "ready" });
    return () => {
      window.removeEventListener("message", listener);
      connection.current?.close();
      peer.current?.destroy();
    };
  }, []);

  const serverSave = () => post({ type: "server.configure", url: serverInput.trim() });
  const sessionStart = () => {
    setBusy(true);
    post({ type: "session.start" });
  };
  const peerStart = () => {
    setBusy(true);
    post({ type: "peer.start" });
  };
  const pairCopy = async () => {
    if (!pairUrl) return;
    await navigator.clipboard.writeText(pairUrl);
    setStatus("Connection URL copied");
  };

  const folderName = workspacePath.split(/[\\/]/).at(-1) || "No workspace";

  return (
    <main style={{ height: "100vh", display: "flex", flexDirection: "column", color: "var(--vscode-foreground)", background: "var(--vscode-editor-background)", fontFamily: "var(--vscode-font-family)" }}>
      <header style={{ padding: "10px 14px", display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", borderBottom: "1px solid var(--vscode-panel-border)" }}>
        <strong style={{ marginRight: 8 }}>Remote Desktop Commander</strong>
        <input
          value={serverInput}
          onChange={event => setServerInput(event.target.value)}
          placeholder="Hono server URL, e.g. https://your-server"
          style={{ minWidth: 260, flex: 1, padding: 6, color: "var(--vscode-input-foreground)", background: "var(--vscode-input-background)", border: "1px solid var(--vscode-input-border)" }}
        />
        <button onClick={serverSave}>Save server</button>
        <button onClick={sessionStart} disabled={!serverUrl || busy}>Start browser</button>
        <button onClick={() => post({ type: "chrome-extension.deploy" })} disabled={!serverUrl || busy}>Deploy browser extension</button>
        <button onClick={peerStart} disabled={!sessionId || busy}>Connect PeerJS</button>
        <button onClick={() => void pairCopy()} disabled={!pairUrl}>Copy URL</button>
      </header>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: "7px 14px", fontSize: 12, color: "var(--vscode-descriptionForeground)", borderBottom: "1px solid var(--vscode-panel-border)" }}>
        <span>{status}</span>
        <span>PeerJS: {peerStatus}</span>
        <span title={workspacePath}>Workspace: {folderName}</span>
        <span>Topic: {topicId || "Not linked"}</span>
      </div>
      {pairUrl && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 14px", borderBottom: "1px solid var(--vscode-panel-border)" }}>
          <span style={{ fontSize: 12 }}>Paste this URL into the Remote Desktop Commander Chrome extension popup:</span>
          <code style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11 }}>{pairUrl}</code>
          <button onClick={() => void pairCopy()}>Copy</button>
        </div>
      )}
      <section style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {kasmUrl ? (
          <iframe
            title="KasmVNC ChatGPT"
            src={kasmUrl}
            allow="clipboard-read; clipboard-write; fullscreen"
            style={{ width: "100%", height: "100%", border: 0, background: "#111" }}
          />
        ) : (
          <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--vscode-descriptionForeground)" }}>
            <div style={{ textAlign: "center", maxWidth: 460, padding: 24 }}>
              <h2>Remote ChatGPT workspace</h2>
              <p>Configure the Hono server, then start the KasmVNC Chromium instance. The official ChatGPT page is displayed here; no separate chat UI is implemented.</p>
              {!serverUrl && <p>Enter the Hono server URL to begin.</p>}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

const root = document.getElementById("app");
if (!root) throw new Error("Remote Desktop Commander webview root element is missing");
createRoot(root).render(<App />);


