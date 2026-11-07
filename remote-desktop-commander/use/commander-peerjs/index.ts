import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { createInterface } from "node:readline";
import * as wrtc from "@webrtc-node/webrtc";
import { messageReceive, messageSend } from "remote-desktop-commander-global/message";
import type { DataConnection, PeerJSOption } from "peerjs";

export { createCommanderBridge } from "./bridge.ts";

export default async function commanderPeerjs(address: string, cwd: string, signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("PeerJS connection cancelled");
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
  });
  Object.defineProperty(wrtc.RTCIceCandidate.prototype, "foundation", { configurable: true, writable: true, value: null });
  Object.defineProperty(wrtc.RTCIceCandidate.prototype, "relayProtocol", { configurable: true, writable: true, value: null });

  const require = createRequire(import.meta.url);
  const { Peer } = require("peerjs") as typeof import("peerjs");
  const server = spawn(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "@wonderwhy-er/desktop-commander@0.3.1"],
    {
      cwd,
      stdio: ["pipe", "pipe", "inherit"],
      shell: process.platform === "win32",
      detached: process.platform !== "win32",
      windowsHide: true,
    },
  );
  const output = createInterface({ input: server.stdout });
  const peer = new Peer(options);
  const chunks = new Map<string, string[]>();
  const pending: unknown[] = [];
  let connection: DataConnection | undefined;
  let closed = false;

  const serverKill = (): void => {
    if (server.exitCode !== null || server.signalCode !== null) return;
    if (process.platform === "win32" && server.pid !== undefined) {
      const result = spawnSync("taskkill", ["/pid", String(server.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
      if (!result.error && result.status === 0) return;
      server.kill();
      return;
    }
    if (process.platform !== "win32" && server.pid !== undefined) {
      try {
        process.kill(-server.pid, "SIGTERM");
        return;
      } catch {
        // Fall through to killing the direct child.
      }
    }
    server.kill();
  };

  const close = (): void => {
    if (closed) return;
    closed = true;
    connection?.close();
    peer.destroy();
    output.close();
    serverKill();
  };

  const send = (message: unknown): void => {
    if (!connection?.open) {
      pending.push(message);
      return;
    }
    void messageSend(connection, message).catch(error => console.error("PeerJS send failed:", error));
  };

  output.on("line", line => {
    if (!line.trim()) return;
    try {
      send(JSON.parse(line));
    } catch (error) {
      console.error("Invalid MCP message from Desktop Commander:", error);
    }
  });

  const connected = new Promise<void>((resolve, reject) => {
    let timeout: ReturnType<typeof setTimeout>;
    let abort = (): void => {};
    const fail = (error: Error): void => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      reject(error);
    };
    const succeed = (): void => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    abort = () => {
      close();
      fail(new Error("PeerJS connection cancelled"));
    };
    timeout = setTimeout(() => fail(new Error("PeerJS connection timed out after 30 seconds")), 30_000);
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });

    peer.once("open", () => {
      connection = peer.connect(peerId, { reliable: true, serialization: "json" });
      connection.on("open", () => {
        while (pending.length) send(pending.shift());
        succeed();
      });
      connection.on("error", error => fail(error instanceof Error ? error : new Error(String(error))));
      connection.on("close", () => {
        if (!connection?.open) fail(new Error("PeerJS connection closed before opening"));
        close();
      });
      connection.on("data", value => {
        try {
          const message = messageReceive(value, chunks);
          if (message === undefined) return;
          if (server.stdin.writable) server.stdin.write(JSON.stringify(message) + "\n");
        } catch (error) {
          console.error("Invalid PeerJS MCP message:", error);
        }
      });
    });
    peer.once("error", error => fail(error instanceof Error ? error : new Error(String(error))));
    server.once("error", fail);
    server.once("exit", (code, signal) => fail(new Error(`Desktop Commander exited before PeerJS connected: ${code ?? signal}`)));
  });

  server.once("exit", (code, signal) => {
    const intentionalClose = closed;
    close();
    if (!intentionalClose && code !== 0) console.error("Desktop Commander exited:", { code, signal });
  });

  try {
    await connected;
  } catch (error) {
    close();
    throw error;
  }

  return { peer, connection, server, close };
}
