import * as vscode from "vscode";
import commanderPeerjs, { createCommanderBridge } from "remote-desktop-commander-peerjs";

type WebviewMessage =
  | { type: "vnc.open"; url: string }
  | { type: "peer.connected"; topicId: string; address: string }
  | { type: "peer.disconnected"; topicId: string };

type Runtime = Awaited<ReturnType<typeof commanderPeerjs>>;
type RuntimeEntry = { runtime?: Runtime; abort: AbortController; address: string };

function htmlCreate(webview: vscode.Webview, scriptUri: vscode.Uri): string {
  const nonce = Array.from({ length: 32 }, () => Math.random().toString(36)[2] ?? "0").join("");
  return [
    "<!doctype html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; frame-src https: http:; connect-src https: http: ws: wss:; style-src ",
    webview.cspSource,
    " 'unsafe-inline'; script-src 'nonce-",
    nonce,
    "'\"><title>Remote Desktop Commander</title></head>",
    "<body style=\"padding:0;margin:0\"><main id=\"app\"></main><script type=\"module\" nonce=\"",
    nonce,
    "\" src=\"",
    scriptUri,
    "\"></script></body></html>",
  ].join("");
}

export default function register(context: vscode.ExtensionContext): vscode.Disposable {
  const panels = new Set<vscode.WebviewPanel>();
  let activePanel: vscode.WebviewPanel | undefined;
  const open = (): void => {
    if (activePanel) {
      activePanel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "remoteDesktopCommander.vnc",
      "Remote Desktop Commander",
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [context.extensionUri] },
    );
    panels.add(panel);
    activePanel = panel;
    panel.webview.html = htmlCreate(
      panel.webview,
      panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist", "media", "WebviewPanel.js")),
    );

    const runtimes = new Map<string, RuntimeEntry>();
    let bridge: Awaited<ReturnType<typeof createCommanderBridge>> | undefined;
    let disposed = false;
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? context.globalStorageUri.fsPath;
    const status = (message: string, tone: "ok" | "error" | "info" = "info", topicId?: string): void => {
      if (!disposed) void panel.webview.postMessage({ type: "status", message, tone, topicId });
    };

    const closeTopic = (topicId: string): void => {
      const entry = runtimes.get(topicId);
      if (!entry) return;
      entry.abort.abort();
      entry.runtime?.close();
      runtimes.delete(topicId);
    };

    const connectTopic = async (topicId: string, address: string): Promise<void> => {
      if (!topicId || !address || disposed) return;
      const existing = runtimes.get(topicId);
      if (existing?.address === address && (existing.runtime || !existing.abort.signal.aborted)) return;
      closeTopic(topicId);
      const entry: RuntimeEntry = { abort: new AbortController(), address };
      runtimes.set(topicId, entry);
      status("正在为话题启动 Desktop Commander…", "info", topicId);
      try {
        const runtime = await commanderPeerjs(address, workspacePath, entry.abort.signal);
        if (disposed || runtimes.get(topicId) !== entry) {
          runtime.close();
          return;
        }
        entry.runtime = runtime;
        runtime.connection?.on("close", () => {
          if (runtimes.get(topicId) === entry) {
            entry.runtime = undefined;
            status("话题 PeerJS 已断开", "error", topicId);
          }
        });
        runtime.server.once("exit", () => {
          if (runtimes.get(topicId) === entry) {
            runtimes.delete(topicId);
            status("话题 Commander 进程已退出", "error", topicId);
          }
        });
        status("话题 Commander 已连接", "ok", topicId);
      } catch (error) {
        if (runtimes.get(topicId) !== entry || disposed) return;
        runtimes.delete(topicId);
        status(error instanceof Error ? error.message : String(error), "error", topicId);
      }
    };

    const subscription = panel.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      if (message.type === "vnc.open") {
        try {
          const url = new URL(message.url);
          if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("VNC URL must use HTTP or HTTPS");
          const instanceId = url.searchParams.get("rdcInstanceId");
          if (!instanceId || !/^[a-zA-Z0-9_-]{1,64}$/.test(instanceId)) throw new Error("VNC URL 缺少有效的 rdcInstanceId；请由 global 创建实例时注入同一个实例 ID");
          for (const topicId of runtimes.keys()) closeTopic(topicId);
          if (bridge) bridge.close();
          bridge = await createCommanderBridge(instanceId, event => {
            if (event.type === "rdc.topic" && event.address) void connectTopic(event.topicId, event.address);
            else if (event.type === "rdc.topic.closed") {
              closeTopic(event.topicId);
              status("浏览器话题已关闭，Runtime 已回收", "info", event.topicId);
            }
          });
          status(`VNC 已连接，实例 ${instanceId}；等待话题 Peer…`, "ok");
        } catch (error) {
          status(error instanceof Error ? error.message : String(error), "error");
        }
        return;
      }
      if (message.type === "peer.connected") {
        await connectTopic(message.topicId, message.address);
        return;
      }
      if (message.type === "peer.disconnected") {
        closeTopic(message.topicId);
        status("话题 Runtime 已关闭", "info", message.topicId);
      }
    });

    panel.onDidDispose(() => {
      disposed = true;
      for (const topicId of runtimes.keys()) closeTopic(topicId);
      bridge?.close();
      subscription.dispose();
      panels.delete(panel);
      if (activePanel === panel) activePanel = undefined;
    });
  };

  const command = vscode.commands.registerCommand("remoteDesktopCommander.openRuntime", open);
  return vscode.Disposable.from(
    command,
    new vscode.Disposable(() => {
      for (const panel of panels) panel.dispose();
      panels.clear();
    }),
  );
}
