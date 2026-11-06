/// <reference types="chrome" />

import Peer, { type DataConnection } from "peerjs";

type PairConfig = {
  host: string;
  port: number;
  path: string;
  key: string;
  secure: boolean;
  config?: RTCConfiguration;
  peerId: string;
  pairId: string;
  token: string;
  sessionId?: string;
};

type PageSnapshot = {
  href: string;
  topicId?: string;
  assistantCount: number;
  userCount: number;
  text: string;
  streaming: boolean;
  ready: boolean;
  draft: string;
};

let peer: Peer | undefined;
let connection: DataConnection | undefined;
let activeTabId: number | undefined;
let latestSnapshot: PageSnapshot | undefined;
let pairConfig: PairConfig | undefined;

const pageSend = (message: unknown): void => {
  if (activeTabId === undefined) return;
  void chrome.tabs.sendMessage(activeTabId, message).catch(() => undefined);
};

const connectionSend = (message: unknown): void => {
  if (connection?.open) connection.send(message);
};

const peerDisconnect = (): void => {
  connection?.close();
  peer?.destroy();
  connection = undefined;
  peer = undefined;
};

const peerConnect = (config: PairConfig): void => {
  peerDisconnect();
  pairConfig = config;
  peer = new Peer("", {
    host: config.host,
    port: config.port,
    path: config.path,
    key: config.key,
    secure: config.secure,
    config: config.config,
    debug: 1,
  });

  peer.on("open", () => {
    if (!peer) return;
    const next = peer.connect(config.peerId, {
      reliable: true,
      metadata: { pairId: config.pairId, token: config.token },
    });
    connection = next;
    next.on("open", () => {
      pageSend({ type: "bridge.ready" });
      if (latestSnapshot) {
        connectionSend({
          type: "hello",
          pairId: config.pairId,
          token: config.token,
          snapshot: latestSnapshot,
        });
        if (latestSnapshot.topicId) {
          connectionSend({
            type: "topic.changed",
            topicId: latestSnapshot.topicId,
            href: latestSnapshot.href,
          });
        }
      }
    });
    next.on("data", data => pageSend(data));
    next.on("close", () => {
      if (connection === next) connection = undefined;
    });
    next.on("error", error => console.error("Remote Desktop Commander PeerJS connection error", error));
  });
  peer.on("error", error => console.error("Remote Desktop Commander PeerJS error", error));
};

chrome.runtime.onMessage.addListener((message: unknown, sender) => {
  if (!message || typeof message !== "object" || !("type" in message)) return;
  const value = message as { type: string; snapshot?: PageSnapshot; data?: unknown };
  if (value.type === "page.ready") {
    activeTabId = sender.tab?.id;
    latestSnapshot = value.snapshot;
    if (connection?.open && pairConfig && latestSnapshot) {
      connectionSend({
        type: "hello",
        pairId: pairConfig.pairId,
        token: pairConfig.token,
        snapshot: latestSnapshot,
      });
    }
    return;
  }
  if (value.type === "page.message") connectionSend(value.data);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes.pairConfig) return;
  const next = changes.pairConfig.newValue as PairConfig | undefined;
  if (next) peerConnect(next);
  else {
    peerDisconnect();
    pairConfig = undefined;
  }
});

void chrome.storage.local.get("pairConfig").then(result => {
  const config = result.pairConfig as PairConfig | undefined;
  if (config) peerConnect(config);
});

