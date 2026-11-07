import { createRequire } from "node:module";
import * as wrtc from "@webrtc-node/webrtc";
import type { DataConnection, PeerJSOption } from "peerjs";

export type CommanderBridgeMessage = {
  type: "rdc.topic" | "rdc.topic.closed";
  topicId: string;
  address?: string;
};

export async function createCommanderBridge(
  instanceId: string,
  onMessage: (message: CommanderBridgeMessage, connection: DataConnection) => void,
  options: PeerJSOption = {},
) {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(instanceId)) throw new Error("Invalid VNC instanceId");
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36", platform: "Win32" },
  });
  Object.assign(globalThis, {
    window: globalThis,
    RTCPeerConnection: wrtc.RTCPeerConnection,
    RTCSessionDescription: wrtc.RTCSessionDescription,
    RTCIceCandidate: wrtc.RTCIceCandidate,
    RTCDataChannel: wrtc.RTCDataChannel,
  });
  Object.defineProperty(wrtc.RTCIceCandidate.prototype, "foundation", { configurable: true, writable: true, value: null });
  Object.defineProperty(wrtc.RTCIceCandidate.prototype, "relayProtocol", { configurable: true, writable: true, value: null });
  const require = createRequire(import.meta.url);
  const { Peer } = require("peerjs") as typeof import("peerjs");
  const peerId = `rdc-vnc-${instanceId}`;
  const peer = new Peer(peerId, { host: "0.peerjs.com", port: 443, path: "/", secure: true, ...options });
  peer.on("connection", connection => {
    connection.on("data", value => {
      if (!value || typeof value !== "object") return;
      const message = value as Partial<CommanderBridgeMessage>;
      if ((message.type !== "rdc.topic" && message.type !== "rdc.topic.closed") || typeof message.topicId !== "string" || !message.topicId) return;
      if (message.type === "rdc.topic" && (typeof message.address !== "string" || !message.address.startsWith("rdc-peer://connect"))) return;
      onMessage(message as CommanderBridgeMessage, connection);
      connection.send({ type: "rdc.ack", topicId: message.topicId });
    });
  });
  await new Promise<void>((resolve, reject) => {
    peer.once("open", () => resolve());
    peer.once("error", reject);
  });
  return { peer, peerId, close: () => peer.destroy() };
}
