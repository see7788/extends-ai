import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import wrtc from "@roamhq/wrtc";
import type { DataConnection, PeerJSOption } from "peerjs";

const address = process.argv[2];
if (!address) throw new Error("Usage: commander-peerjs <rdc-peer://connect?...>");

const url = new URL(address);
if (url.protocol !== "rdc-peer:" || url.hostname !== "connect") {
  throw new Error("Invalid PeerJS connection address");
}

const peerId = url.searchParams.get("peerId");
const host = url.searchParams.get("host");
const port = Number(url.searchParams.get("port"));
if (!peerId || !host || !Number.isInteger(port) || port < 1) {
  throw new Error("PeerJS connection address is missing peerId, host or port");
}

const options: PeerJSOption = {
  host,
  port,
  path: url.searchParams.get("path") || "/",
  secure: url.searchParams.get("secure") !== "false",
  key: url.searchParams.get("key") || undefined,
  config: url.searchParams.has("config")
    ? JSON.parse(url.searchParams.get("config")!) as RTCConfiguration
    : undefined,
};

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36",
    platform: "Win32",
  },
});
Object.assign(globalThis, {
  window: globalThis,
  RTCPeerConnection: wrtc.RTCPeerConnection,
  RTCSessionDescription: wrtc.RTCSessionDescription,
  RTCIceCandidate: wrtc.RTCIceCandidate,
  RTCDataChannel: wrtc.RTCDataChannel,
  RTCRtpSender: wrtc.RTCRtpSender,
  RTCRtpReceiver: wrtc.RTCRtpReceiver,
  RTCRtpTransceiver: wrtc.RTCRtpTransceiver,
});

Object.defineProperty(wrtc.RTCIceCandidate.prototype, "foundation", { configurable: true, value: "" });
Object.defineProperty(wrtc.RTCIceCandidate.prototype, "relayProtocol", { configurable: true, value: "udp" });

const peerModule = await import("peerjs");
const Peer = (peerModule.default as unknown as { Peer?: typeof import("peerjs").Peer }).Peer
  ?? peerModule.default as unknown as typeof import("peerjs").default;
const require = createRequire(import.meta.url);
const commander = require.resolve("@wonderwhy-er/desktop-commander/dist/index.js");
const server = spawn(process.execPath, [commander], {
  cwd: process.cwd(),
  stdio: ["pipe", "pipe", "inherit"],
});
const output = createInterface({ input: server.stdout });
const peer = new Peer(options);
let connection: DataConnection | undefined;

output.on("line", line => {
  if (!line.trim()) return;
  try {
    if (connection?.open) void connection.send(JSON.parse(line));
  } catch (error) {
    console.error("Invalid MCP message from Desktop Commander:", error);
  }
});

peer.on("open", () => {
  connection = peer.connect(peerId, { reliable: true });
  connection.on("open", () => console.log("Desktop Commander connected to ChatGPT PeerJS:", peerId));
  connection.on("data", message => {
    const line = typeof message === "string" ? message : JSON.stringify(message);
    if (server.stdin.writable) server.stdin.write(line + "\n");
  });
  connection.on("close", () => console.log("ChatGPT PeerJS connection closed"));
  connection.on("error", error => console.error("PeerJS connection error:", error));
});
peer.on("error", error => console.error("PeerJS error:", error));
server.on("error", error => {
  console.error("Desktop Commander failed to start:", error);
  process.exitCode = 1;
});
server.on("exit", (code, signal) => {
  console.error("Desktop Commander exited:", { code, signal });
  peer.destroy();
  process.exitCode = code ?? 1;
});

const close = (): void => {
  connection?.close();
  peer.destroy();
  server.kill();
};
process.once("SIGINT", close);
process.once("SIGTERM", close);
