import wrtc from "@roamhq/wrtc";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { userAgent: "Mozilla/5.0 Chrome/130.0.0.0 Safari/537.36", platform: "Win32" },
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

const module = await import("peerjs");
const Peer = module.default.Peer;
const require = createRequire(import.meta.url);
const peer = new Peer({ host: "0.peerjs.com", port: 443, path: "/", secure: true, debug: 1 });
await new Promise((resolve, reject) => {
  peer.once("open", resolve);
  peer.once("error", reject);
});
const url = new URL("rdc-peer://connect");
url.searchParams.set("peerId", peer.id);
url.searchParams.set("host", "0.peerjs.com");
url.searchParams.set("port", "443");
url.searchParams.set("path", "/");
url.searchParams.set("secure", "true");

const child = spawn(process.execPath, [
  require.resolve("tsx/cli"),
  "index.ts",
  url.toString(),
], { cwd: process.cwd(), stdio: ["ignore", "inherit", "inherit"] });

try {
  const connection = await new Promise((resolve, reject) => {
    peer.once("connection", resolve);
    peer.once("error", reject);
    child.once("exit", code => reject(new Error("commander-peerjs exited: " + code)));
  });
  await new Promise((resolve, reject) => {
    connection.once("open", resolve);
    connection.once("error", reject);
  });
  const response = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("MCP initialize timeout")), 20000);
    connection.on("data", value => {
      if (value?.id === 1) {
        clearTimeout(timer);
        resolve(value);
      }
    });
    connection.send({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "peerjs-smoke-test", version: "0.1.0" },
      },
    });
  });
  console.log("MCP_INITIALIZE", JSON.stringify(response));
  connection.send({ jsonrpc: "2.0", method: "notifications/initialized" });
  const tools = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("tools/list timeout")), 20000);
    connection.on("data", value => {
      if (value?.id === 2) {
        clearTimeout(timer);
        resolve(value);
      }
    });
    connection.send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  });
  console.log("MCP_TOOLS", tools.result?.tools?.length, tools.result?.tools?.slice(0, 5).map(tool => tool.name));
} finally {
  child.kill();
  peer.destroy();
  await delay(300);
}
