export type ServerAccount = {
  id: string;
  name: string;
};

export type ServerSession = {
  id: string;
  accountId: string;
  kasmIndex: number;
  status: "starting" | "running" | "stopped" | "error";
  topicId?: string;
};

export type PeerEndpoint = {
  host: string;
  port: number;
  path: string;
  key: string;
  secure: boolean;
  config: {
    iceServers: Array<{ urls: string }>;
  };
};

export type PeerPair = {
  pairId: string;
  token: string;
  expiresAt: number;
  url: string;
  endpoint: PeerEndpoint;
};

export type ChromeExtensionFile = {
  path: string;
  content: Uint8Array;
};

export default class ServerApi {
  constructor(private readonly baseUrl: string) {}

  async request<Result>(path: string, init: RequestInit = {}): Promise<Result> {
    const response = await fetch(new URL(path, this.baseUrl), {
      ...init,
      headers: {
        ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
    const text = await response.text();
    let result: unknown;
    try {
      result = text ? JSON.parse(text) : undefined;
    } catch {
      result = text;
    }
    if (!response.ok) {
      const message = result && typeof result === "object" && "error" in result
        ? String(result.error)
        : typeof result === "string" && result
          ? result
          : `HTTP ${response.status} ${response.statusText}`;
      throw new Error(message);
    }
    return result as Result;
  }

  health(): Promise<{ ok: boolean }> {
    return this.request("/health");
  }

  accounts(): Promise<ServerAccount[]> {
    return this.request("/api/accounts");
  }

  accountCreate(name: string): Promise<ServerAccount> {
    return this.request("/api/accounts", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
  }

  sessionCreate(accountId: string): Promise<ServerSession> {
    return this.request(`/api/accounts/${encodeURIComponent(accountId)}/session`, {
      method: "POST",
    });
  }

  sessionStart(sessionId: string): Promise<{ started: boolean; session: ServerSession }> {
    return this.request(`/api/sessions/${encodeURIComponent(sessionId)}/start`, {
      method: "POST",
    });
  }

  sessionUrl(sessionId: string): Promise<{ url: string; kasmIndex: number }> {
    return this.request(`/api/sessions/${encodeURIComponent(sessionId)}/url`);
  }

  peerEndpoint(): Promise<PeerEndpoint> {
    return this.request("/api/peer/endpoint", { method: "POST" });
  }

  peerPair(peerId: string, sessionId?: string): Promise<PeerPair> {
    return this.request("/api/peer/pair", {
      method: "POST",
      body: JSON.stringify({ peerId, sessionId }),
    });
  }

  chromeExtensionUpload(files: ChromeExtensionFile[]): Promise<{ uploaded: number; extensionDirectory: string; applied: boolean }> {
    const form = new FormData();
    for (const file of files) {
      form.append(file.path, new Blob([file.content]), file.path.split("/").at(-1) ?? "asset");
    }
    return this.request("/api/chrome-extension", {
      method: "POST",
      body: form,
    });
  }
}

