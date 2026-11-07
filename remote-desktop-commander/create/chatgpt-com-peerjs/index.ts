import { Peer, type DataConnection, type PeerJSOption } from "peerjs";
import { messageReceive, messageSend } from "remote-desktop-commander-global/message";

export type McpTool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};

export type McpCallResult = {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
};

export class ChatGPTMcpPeer {
  readonly address: string;
  readonly peerId: string;
  private connection?: DataConnection;
  private sequence = 0;
  private chunks = new Map<string, string[]>();
  private pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();
  private connectionPromise: Promise<void>;
  private connectionResolve!: () => void;
  private connectionReject!: (error: Error) => void;
  private connectionReady = false;

  private constructor(private readonly peer: Peer, options: PeerJSOption) {
    this.peerId = peer.id;
    this.address = ChatGPTMcpPeer.address(peer.id, options);
    this.connectionPromise = this.connectionWait();

    peer.on("connection", connection => {
      if (this.connection?.open) {
        connection.close();
        return;
      }
      if (this.connectionReady) {
        this.connectionReady = false;
        this.connectionPromise = this.connectionWait();
      }
      this.connection = connection;
      connection.on("data", value => {
        try {
          const message = messageReceive(value, this.chunks);
          if (message !== undefined) this.messageHandle(message);
        } catch (error) {
          connection.close();
          console.error("Invalid PeerJS MCP message:", error);
        }
      });
      connection.on("close", () => {
        if (this.connection !== connection) return;
        this.pendingReject(new Error("PeerJS connection closed"));
        if (this.connectionReady) {
          this.connectionReady = false;
          this.connectionPromise = this.connectionWait();
        }
      });
      connection.once("error", () => connection.close());
      connection.once("open", async () => {
        try {
          await this.request("initialize", {
            protocolVersion: "2025-03-26",
            capabilities: {},
            clientInfo: { name: "chatgpt-com-peerjs", version: "0.1.0" },
          });
          await messageSend(connection, { jsonrpc: "2.0", method: "notifications/initialized" });
          this.connectionReady = true;
          this.connectionResolve();
        } catch (error) {
          connection.close();
          console.error("PeerJS MCP initialization failed:", error);
        }
      });
    });
    peer.on("error", error => this.connectionReject(error instanceof Error ? error : new Error(String(error))));
    peer.once("close", () => this.connectionReject(new Error("PeerJS peer closed")));
  }

  private connectionWait(): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      this.connectionResolve = resolve;
      this.connectionReject = reject;
    });
    void promise.catch(() => undefined);
    return promise;
  }

  static async create(options: PeerJSOption = {}): Promise<ChatGPTMcpPeer> {
    const peerOptions: PeerJSOption = {
      host: "0.peerjs.com",
      port: 443,
      path: "/",
      secure: true,
      ...options,
    };
    const peer = new Peer(peerOptions);
    try {
      await new Promise<void>((resolve, reject) => {
        peer.once("open", () => resolve());
        peer.once("error", reject);
      });
      return new ChatGPTMcpPeer(peer, peerOptions);
    } catch (error) {
      peer.destroy();
      throw error;
    }
  }

  static address(peerId: string, options: PeerJSOption): string {
    const url = new URL("rdc-peer://connect");
    url.searchParams.set("peerId", peerId);
    url.searchParams.set("host", options.host ?? "0.peerjs.com");
    url.searchParams.set("port", String(options.port ?? 443));
    url.searchParams.set("path", options.path ?? "/");
    url.searchParams.set("secure", String(options.secure ?? true));
    if (options.key) url.searchParams.set("key", options.key);
    if (options.config) url.searchParams.set("config", JSON.stringify(options.config));
    return url.toString();
  }

  get isConnected(): boolean {
    return this.connectionReady && Boolean(this.connection?.open);
  }

  connected(): Promise<void> {
    if (this.isConnected) return Promise.resolve();
    if (this.connectionReady) {
      this.connectionReady = false;
      this.connectionPromise = this.connectionWait();
    }
    return this.connectionPromise;
  }

  tools(): Promise<{ tools: McpTool[] }> {
    return this.request("tools/list", {});
  }

  call(name: string, args: Record<string, unknown> = {}): Promise<McpCallResult> {
    return this.request("tools/call", { name, arguments: args });
  }

  close(): void {
    this.pendingReject(new Error("PeerJS connection closed"));
    this.connection?.close();
    this.peer.destroy();
  }

  private request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (!this.connection?.open) return Promise.reject(new Error("Commander PeerJS is not connected"));
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: value => resolve(value as T),
        reject,
      });
      void messageSend(this.connection!, { jsonrpc: "2.0", id, method, params }).catch(error => {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  private messageHandle(value: unknown): void {
    if (!value || typeof value !== "object" || !("id" in value)) return;
    const response = value as {
      id: number;
      result?: unknown;
      error?: { message: string };
    };
    if (typeof response.id !== "number") return;
    const pending = this.pending.get(response.id);
    if (!pending) return;
    this.pending.delete(response.id);
    if (response.error) pending.reject(new Error(response.error.message));
    else pending.resolve(response.result);
  }

  private pendingReject(error: Error): void {
    for (const item of this.pending.values()) item.reject(error);
    this.pending.clear();
  }
}

export const create = (options?: PeerJSOption): Promise<ChatGPTMcpPeer> =>
  ChatGPTMcpPeer.create(options);
