﻿﻿import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import wrtc from "@roamhq/wrtc";
import type { DataConnection, Peer as PeerType, PeerJSOption } from "peerjs";

type FileReaderLoadEvent = { target: NodeFileReader };
export type PeerStatus = { connected: boolean; signalingConnected: boolean; localPeerId: string | null; peerId: string | null };

class NodeFileReader {
  result: ArrayBuffer | null = null;
  onload: ((event: FileReaderLoadEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    void blob.arrayBuffer().then(
      result => { this.result = result; this.onload?.({ target: this }); },
      error => this.onerror?.(error),
    );
  }
  abort(): void {}
}

function installNodeWebRtc(): void {
  const root = globalThis as unknown as Record<string, unknown>;
  Object.assign(root, {
    RTCPeerConnection: wrtc.RTCPeerConnection,
    RTCSessionDescription: wrtc.RTCSessionDescription,
    RTCIceCandidate: wrtc.RTCIceCandidate,
    MediaStream: wrtc.MediaStream,
    MediaStreamTrack: wrtc.MediaStreamTrack,
    FileReader: NodeFileReader,
  });
  root.window = root;
  if (!root.navigator) {
    Object.defineProperty(root, "navigator", {
      configurable: true,
      value: { userAgent: "honopeerjs-node", platform: process.platform },
    });
  }
}

function waitPeerOpen(
  peer: PeerType,
  timeoutMs: number,
  onCountdown: (remainingSeconds: number) => void,
): Promise<void> {
  if (peer.open) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;
    const emitCountdown = () => {
      onCountdown(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
    };
    emitCountdown();
    const countdown = setInterval(emitCountdown, 1000);
    const timer = setTimeout(() => finish(new Error("PeerJS signaling connection timed out")), timeoutMs);
    const onOpen = () => finish();
    const onError = (error: Error) => {
      const type = (error as Error & { type?: string }).type;
      const detail = error.message.trim();
      finish(new Error(
        "PeerJS signaling error" +
        (type ? " (" + type + ")" : "") +
        (detail ? ": " + detail : " (no additional detail)"),
      ));
    };
    const finish = (error?: Error) => {
      clearTimeout(timer);
      clearInterval(countdown);
      peer.off("open", onOpen);
      peer.off("error", onError);
      error ? reject(error) : resolve();
    };
    peer.on("open", onOpen);
    peer.on("error", onError);
    if (peer.open) finish();
  });
}

function waitConnectionOpen(
  connection: DataConnection,
  peer: PeerType,
  timeoutMs: number,
  onDiagnostic: (detail: string) => void,
): Promise<void> {
  if (connection.open) return Promise.resolve();

  return new Promise((resolve, reject) => {
    let settled = false;
    let lastDiagnostic = "";
    let observedPeerConnection: RTCPeerConnection | undefined;

    const report = () => {
      const pc = connection.peerConnection;
      const channel = connection.dataChannel;
      const detail = pc
        ? "已发送连接请求；ICE=" + pc.iceConnectionState +
          "，WebRTC=" + pc.connectionState +
          "，信令协商=" + pc.signalingState +
          "，DataChannel=" + (channel?.readyState ?? "尚未创建")
        : "已发送连接请求，等待远端 Peer 接受并建立 WebRTC 通道";
      if (detail !== lastDiagnostic) {
        lastDiagnostic = detail;
        onDiagnostic(detail);
      }
      if (pc && pc !== observedPeerConnection) {
        observedPeerConnection = pc;
        pc.addEventListener("iceconnectionstatechange", report);
        pc.addEventListener("connectionstatechange", report);
        pc.addEventListener("signalingstatechange", report);
      }
    };

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(diagnosticTimer);
      connection.off("open", onOpen);
      connection.off("error", onConnectionError);
      connection.off("close", onClose);
      peer.off("error", onPeerError);
      if (observedPeerConnection) {
        observedPeerConnection.removeEventListener("iceconnectionstatechange", report);
        observedPeerConnection.removeEventListener("connectionstatechange", report);
        observedPeerConnection.removeEventListener("signalingstatechange", report);
      }
      error ? reject(error) : resolve();
    };

    const onOpen = () => {
      onDiagnostic("WebRTC DataChannel 已打开");
      finish();
    };

    const onConnectionError = (error: Error) => {
      const type = (error as Error & { type?: string }).type;
      const detail = error.message.trim();
      finish(new Error(
        "PeerJS DataConnection error" +
        (type ? " (" + type + ")" : "") +
        (detail ? ": " + detail : " (no additional detail)"),
      ));
    };

    const onPeerError = (error: Error) => {
      const type = (error as Error & { type?: string }).type;
      const detail = error.message.trim();
      finish(new Error(
        "PeerJS peer error" +
        (type ? " (" + type + ")" : "") +
        (detail ? ": " + detail : " (no additional detail)"),
      ));
    };

    const onClose = () => finish(new Error(
      "PeerJS DataConnection closed before it opened",
    ));

    const timer = setTimeout(() => {
      report();
      const pc = connection.peerConnection;
      const channel = connection.dataChannel;
      finish(new Error(
        "PeerJS DataConnection timed out" +
        (pc
          ? " (ICE=" + pc.iceConnectionState +
            ", WebRTC=" + pc.connectionState +
            ", signaling=" + pc.signalingState +
            ", DataChannel=" + (channel?.readyState ?? "unavailable") + ")"
          : " (WebRTC peer connection state unavailable)"),
      ));
    }, timeoutMs);

    const diagnosticTimer = setInterval(report, 1000);
    connection.on("open", onOpen);
    connection.on("error", onConnectionError);
    connection.on("close", onClose);
    peer.on("error", onPeerError);
    report();

    if (connection.open) finish();
  });
}

class HonoTokenPeer {
  private peer?: PeerType;
  private channel?: DataConnection;
  private remotePeerId?: string;
  private active?: { id: string; resolve: (answer: unknown) => void; reject: (error: Error) => void; onEvent?: (event: unknown) => void };
  private queue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(status: PeerStatus) => void>();

  private emitStatus(): void {
    const status = this.getStatus();
    for (const listener of this.listeners) listener(status);
  }

  subscribe(listener: (status: PeerStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => this.listeners.delete(listener);
  }

  async connectSignaling(
    peerOptions: PeerJSOption,
    onCountdown: (remainingSeconds: number) => void,
  ): Promise<void> {
    this.closeChannel();

    // Keep one local Peer ID for the lifetime of this Hono process.
    // The brain may persist this ID in its allowedPeerIds whitelist.
    if (this.peer?.open) {
      onCountdown(0);
      this.emitStatus();
      return;
    }

    this.peer?.destroy();
    this.peer = undefined;
    installNodeWebRtc();
    const { Peer } = createRequire(import.meta.url)("peerjs") as typeof import("peerjs");
    const nextPeer = new Peer(peerOptions);
    this.peer = nextPeer;
    this.emitStatus();

    try {
      await waitPeerOpen(nextPeer, 20_000, onCountdown);
      this.emitStatus();
    } catch (error) {
      nextPeer.destroy();
      if (this.peer === nextPeer) this.peer = undefined;
      this.emitStatus();
      throw error;
    }
  }

  async verifyBrain(
    remotePeerId: string,
    token: string,
    onDiagnostic: (detail: string) => void,
  ): Promise<void> {
    if (!token) throw new Error("PeerJS URL 缺少连接 token");
    const currentPeer = this.peer;
    if (!currentPeer?.open) {
      throw new Error("PeerJS 信令服务器尚未连接");
    }

    this.closeChannel();
    onDiagnostic("本机 Peer ID：" + currentPeer.id + "；向 AI 大脑发送连接请求");

    const nextChannel = currentPeer.connect(remotePeerId, {
      reliable: true,
      metadata: { token },
    });

    try {
      onDiagnostic("本机 Peer ID：" + currentPeer.id + "；已发送连接请求，等待远端建立数据通道");
      await waitConnectionOpen(nextChannel, currentPeer, 20_000, onDiagnostic);
      this.channel = nextChannel;
      this.remotePeerId = remotePeerId;
      nextChannel.on("data", this.onData);
      nextChannel.on("close", this.onClose);
      this.emitStatus();
    } catch (error) {
      nextChannel.close();
      throw error;
    }
  }

  private onData = (data: unknown): void => {
    if (typeof data !== "string" || !this.active) return;
    const current = this.active;
    let message: { type?: string; id?: string; event?: unknown; error?: { message?: string } };
    try {
      message = JSON.parse(data) as typeof message;
    } catch {
      this.active = undefined;
      current.resolve(data);
      return;
    }
    if (message.id !== current.id) return;
    if (message.type === "event") {
      current.onEvent?.(message.event);
      const event = message.event as { type?: string; response?: unknown } | undefined;
      if (event?.type === "response.completed") {
        this.active = undefined;
        current.resolve(event.response);
      }
      return;
    }
    if (message.type === "error") {
      this.active = undefined;
      current.reject(new Error(message.error?.message || "AI brain request failed"));
    }
  };

  private onClose = (): void => {
    const current = this.active;
    this.active = undefined;
    current?.reject(new Error("PeerJS connection closed"));
    this.channel?.off("data", this.onData);
    this.channel?.off("close", this.onClose);
    this.channel = undefined;
    this.remotePeerId = undefined;
    // Keep the signaling Peer alive so its ID remains in the brain whitelist.
    this.emitStatus();
  };

  private closeChannel(): void {
    this.channel?.off("data", this.onData);
    this.channel?.off("close", this.onClose);
    this.channel?.close();
    const current = this.active;
    this.active = undefined;
    current?.reject(new Error("PeerJS data connection stopped"));
    this.channel = undefined;
    this.remotePeerId = undefined;
    this.emitStatus();
  }

  disconnectBrain(): void {
    this.closeChannel();
  }

  get connected(): boolean {
    return this.channel?.open ?? false;
  }

  getStatus(): PeerStatus {
    return {
      connected: this.connected,
      signalingConnected: this.peer?.open ?? false,
      localPeerId: this.peer?.id ?? null,
      peerId: this.remotePeerId ?? null,
    };
  }

  request(payload: unknown, onEvent?: (event: unknown) => void): Promise<unknown> {
    const run = (): Promise<unknown> => new Promise((resolve, reject) => {
      const channel = this.channel;
      if (!channel?.open) {
        reject(new Error("PeerJS is not connected. Open the configuration page first."));
        return;
      }
      if (this.active) {
        reject(new Error("A PeerJS request is already active"));
        return;
      }
      const id = randomUUID();
      this.active = { id, resolve, reject, onEvent };
      try {
        channel.send(JSON.stringify({ type: "request", id, payload }));
      } catch (error) {
        this.active = undefined;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
    const result = this.queue.then(run, run);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  close(): void {
    this.closeChannel();
    this.peer?.destroy();
    this.peer = undefined;
    this.emitStatus();
  }
}

export default new HonoTokenPeer();
