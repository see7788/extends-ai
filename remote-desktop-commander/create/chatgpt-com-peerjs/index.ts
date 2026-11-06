import Peer, { type DataConnection, type PeerJSOption } from "peerjs";

type McpResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
};

export class ChatGPTMcpPeer {
  readonly address: string;
  readonly peerId: string;
  readonly connected: Promise<void>;
  private connection?: DataConnection;
  private sequence = 0;
  private pending = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }>();

  private constructor(private readonly peer: Peer, options: PeerJSOption) {
    this.peerId = peer.id;
    this.address = ChatGPTMcpPeer.address(peer.id, options);
    this.connected = new Promise((resolve, reject) => {
      peer.on("connection", connection => {
        this.connection = connection;
        connection.on("data", value => this.messageHandle(value));
        connection.on("close", () => this.pendingReject(new Error("PeerJS connection closed")));
        connection.on("error", reject);
        connection.on("open", async () => {
          try {
            await this.request("initialize", {
              protocolVersion: "2025-03-26",
              capabilities: {},
              clientInfo: { name: "chatgpt-com-peerjs", version: "0.1.0" },
            });
            connection.send({ jsonrpc: "2.0", method: "notifications/initialized" });
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
      peer.on("error", reject);
    });
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
    await new Promise<void>((resolve, reject) => {
      peer.once("open", () => resolve());
      peer.once("error", reject);
    });
    return new ChatGPTMcpPeer(peer, peerOptions);
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

  async tools(): Promise<unknown> {
    return this.request("tools/list", {});
  }

  async call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    return this.request("tools/call", { name, arguments: args });
  }

  close(): void {
    this.pendingReject(new Error("PeerJS connection closed"));
    this.connection?.close();
    this.peer.destroy();
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (!this.connection?.open) return Promise.reject(new Error("Commander PeerJS is not connected"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.connection?.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  private messageHandle(value: unknown): void {
    if (!value || typeof value !== "object" || !("id" in value)) return;
    const response = value as McpResponse;
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
