import * as vscode from "vscode";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import desktopCommander from "remote-desktop-commander-mcpserver-clone";
import ServerApi, { type ServerSession } from "../../services/server";

type WorkspaceLink = {
  accountId?: string;
  sessionId?: string;
  topicId?: string;
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

const workspaceLinksKey = "workspaceLinks";
const bootstrappedTopicsKey = "bootstrappedTopics";
const serverUrlKey = "serverUrl";

async function extensionFilesRead(root: string): Promise<Array<{ path: string; content: Uint8Array }>> {
  const files: Array<{ path: string; content: Uint8Array }> = [];
  const walk = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile()) files.push({
        path: relative(root, fullPath).replace(/\\\\/g, "/"),
        content: await readFile(fullPath),
      });
    }
  };
  await walk(root);
  return files;
}
function workspacePathRead(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function workspaceKey(path: string | undefined): string {
  return path ?? "__empty_workspace__";
}

function urlNormalize(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Hono Server URL must use http or https");
  }
  return url.toString().replace(/\/$/, "");
}

function htmlCreate(
  webview: vscode.Webview,
  context: vscode.ExtensionContext,
  scriptUri: vscode.Uri,
): string {
  const nonce = Array.from({ length: 32 }, () => Math.random().toString(36)[2] ?? "0").join("");
  return [
    "<!doctype html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
    "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; img-src ",
    webview.cspSource,
    " data: http: https:; style-src ",
    webview.cspSource,
    " 'unsafe-inline'; script-src 'nonce-",
    nonce,
    "'; frame-src http: https:; connect-src http: https: ws: wss:\"><title>Remote Desktop Commander</title></head>",
    "<body style=\"padding:0;margin:0\"><main id=\"app\"></main><script type=\"module\" nonce=\"",
    nonce,
    "\" src=\"",
    scriptUri,
    "\"></script></body></html>",
  ].join("");
}

export default function register(context: vscode.ExtensionContext): vscode.Disposable {
  let panel: vscode.WebviewPanel | undefined;
  let api: ServerApi | undefined;
  let serverUrl = context.globalState.get<string>(serverUrlKey, "");
  let currentSessionId: string | undefined;
  let currentAccountId: string | undefined;
  let currentWorkspacePath = workspacePathRead();
  let currentTopicId: string | undefined;

  const status = (message: string, tone: "ok" | "warn" | "error" = "warn") => {
    panel?.webview.postMessage({ type: "status", message, tone });
  };

  const apiEnsure = async (): Promise<ServerApi> => {
    if (!serverUrl) throw new Error("璇峰厛閰嶇疆 Hono Server URL");
    if (!api) api = new ServerApi(serverUrl);
    await api.health();
    return api;
  };

  const workspaceLinkRead = (): WorkspaceLink => {
    const links = context.workspaceState.get<Record<string, WorkspaceLink>>(workspaceLinksKey, {});
    return links[workspaceKey(currentWorkspacePath)] ?? {};
  };

  const workspaceLinkWrite = async (patch: WorkspaceLink): Promise<void> => {
    const links = context.workspaceState.get<Record<string, WorkspaceLink>>(workspaceLinksKey, {});
    const key = workspaceKey(currentWorkspacePath);
    const previous = links[key] ?? {};
    const next = { ...links, [key]: { ...previous, ...patch } };
    await context.workspaceState.update(workspaceLinksKey, next);
  };

  const bootstrapTopic = async (topicId: string): Promise<void> => {
    const bootstrapped = context.globalState.get<string[]>(bootstrappedTopicsKey, []);
    if (bootstrapped.includes(topicId)) return;
    await desktopCommander.workspaceSet(currentWorkspacePath);
    const tools = await desktopCommander.tools();
    const instruction = [
      "浣犵幇鍦ㄥ彲浠ヤ娇鐢ㄦ湰鏈?Desktop Commander 宸ュ叿銆傚伐鍏风敱鐢ㄦ埛鐨?VS Code 宸ヤ綔鍖烘彁渚涳紝璋冪敤缁撴灉浼氳嚜鍔ㄨ繑鍥炵粰浣犮€?,
      "褰撲綘闇€瑕佽皟鐢ㄥ伐鍏锋椂锛屽彧杈撳嚭浠ヤ笅鏍囪鍖呰９鐨?JSON锛屼笉瑕佷娇鐢?Markdown 浠ｇ爜鍥存爮锛?,
      "<rdc-tool-call>{\"name\":\"tool_name\",\"arguments\":{}}</rdc-tool-call>",
      "姣忔鍙彂璧蜂竴涓伐鍏疯皟鐢ㄣ€傛敹鍒?<rdc-tool-result>...</rdc-tool-result> 鍚庣户缁畬鎴愬師浠诲姟銆傛櫘閫氬洖绛旂洿鎺ユ甯稿洖澶嶃€?,
      "鍙敤宸ュ叿瀹氫箟锛?,
      JSON.stringify(tools),
    ].join("\n\n");
    panel?.webview.postMessage({
      type: "chat.submit",
      requestId: `bootstrap-${topicId}`,
      text: instruction,
    });
    await context.globalState.update(bootstrappedTopicsKey, [...bootstrapped, topicId]);
    status("宸插悜褰撳墠 ChatGPT 璇濋娉ㄥ叆鏈満宸ュ叿鐩綍", "ok");
  };

  const toolCallHandle = async (snapshot: PageSnapshot): Promise<void> => {
    const match = snapshot.text.match(/<rdc-tool-call>([\s\S]*?)<\/rdc-tool-call>/);
    if (!match) return;
    let request: { name?: unknown; arguments?: unknown };
    try {
      request = JSON.parse(match[1] ?? "") as { name?: unknown; arguments?: unknown };
    } catch {
      status("ChatGPT 杩斿洖浜嗘棤娉曡В鏋愮殑宸ュ叿璋冪敤 JSON", "error");
      return;
    }
    if (typeof request.name !== "string" || !request.name) {
      status("ChatGPT 宸ュ叿璋冪敤缂哄皯 name", "error");
      return;
    }
    const args = request.arguments && typeof request.arguments === "object" && !Array.isArray(request.arguments)
      ? request.arguments as Record<string, unknown>
      : {};
    const requestId = `tool-${Date.now()}`;
    status(`姝ｅ湪鎵ц Desktop Commander锛?{request.name}`);
    try {
      await desktopCommander.workspaceSet(currentWorkspacePath);
      const result = await desktopCommander.call(request.name, args);
      panel?.webview.postMessage({
        type: "chat.submit",
        requestId,
        text: [
          "<rdc-tool-result>",
          JSON.stringify({ name: request.name, result }),
          "</rdc-tool-result>",
          "璇锋牴鎹伐鍏风粨鏋滅户缁畬鎴愮敤鎴峰師鏉ョ殑浠诲姟銆傚鏋滆繕闇€瑕佸伐鍏凤紝璇锋寜绾﹀畾鏍煎紡鍙戣捣涓嬩竴娆¤皟鐢ㄣ€?,
        ].join("\n"),
      });
      status(`宸ュ叿鎵ц瀹屾垚锛?{request.name}`, "ok");
    } catch (error) {
      panel?.webview.postMessage({
        type: "chat.submit",
        requestId,
        text: [
          "<rdc-tool-result>",
          JSON.stringify({ name: request.name, isError: true, error: error instanceof Error ? error.message : String(error) }),
          "</rdc-tool-result>",
          "璇峰垎鏋愰敊璇苟鍐冲畾濡備綍缁х画銆?,
        ].join("\n"),
      });
      status(`宸ュ叿鎵ц澶辫触锛?{request.name}`, "error");
    }
  };

  const messageHandle = async (message: Record<string, unknown>): Promise<void> => {
    try {
      switch (message.type) {
        case "ready": {
          const link = workspaceLinkRead();
          currentSessionId = link.sessionId;
          currentAccountId = link.accountId;
          currentTopicId = link.topicId;
          panel?.webview.postMessage({
            type: "init",
            serverUrl,
            workspacePath: currentWorkspacePath,
            topicId: currentTopicId,
            sessionId: currentSessionId,
          });
          break;
        }
        case "server.configure": {
          serverUrl = urlNormalize(String(message.url ?? ""));
          await context.globalState.update(serverUrlKey, serverUrl);
          api = new ServerApi(serverUrl);
          await api.health();
          panel?.webview.postMessage({ type: "init", serverUrl, workspacePath: currentWorkspacePath, topicId: currentTopicId, sessionId: currentSessionId });
          status("Hono 鏈嶅姟鍣ㄨ繛鎺ユ甯?, "ok");
          break;
        }
        case "session.start": {
          const server = await apiEnsure();
          status("姝ｅ湪鍑嗗璐﹀彿鍜?KasmVNC 浼氳瘽鈥?);
          const accounts = await server.accounts();
          const account = accounts.find(item => item.name === "default") ?? await server.accountCreate("default");
          currentAccountId = account.id;
          const session: ServerSession = await server.sessionCreate(account.id);
          currentSessionId = session.id;
          if (session.status !== "running") await server.sessionStart(session.id);
          const remote = await server.sessionUrl(session.id);
          await workspaceLinkWrite({ accountId: account.id, sessionId: session.id });
          panel?.webview.postMessage({ type: "session.ready", sessionId: session.id, url: remote.url });
          status("KasmVNC Chromium 浼氳瘽宸插惎鍔?, "ok");
          break;
        }
        case "chrome-extension.deploy": {
          const server = await apiEnsure();
          const extensionRoot = vscode.Uri.joinPath(context.extensionUri, "dist", "chrome-extension").fsPath;
          status("Uploading ChatGPT browser extension to KasmVNC...");
          const files = await extensionFilesRead(extensionRoot);
          if (!files.length) throw new Error("Packaged Chrome extension files were not found.");
          const result = await server.chromeExtensionUpload(files);
          status(result.applied ? "Chrome extension deployed and KasmVNC refreshed: " + result.uploaded + " files" : "Chrome extension uploaded. Apply it by running Hono on Ubuntu.", "ok");
          break;
        }        case "peer.start": {
          const server = await apiEnsure();
          if (!currentSessionId) throw new Error("璇峰厛鍚姩杩滅▼娴忚鍣ㄤ細璇?);
          const endpoint = await server.peerEndpoint();
          panel?.webview.postMessage({ type: "peer.endpoint", endpoint });
          status("姝ｅ湪杩炴帴杩滅▼ PeerJS Server鈥?);
          break;
        }
        case "peer.ready": {
          const server = await apiEnsure();
          if (typeof message.peerId !== "string") throw new Error("PeerJS 鏈繑鍥?Peer ID");
          const pair = await server.peerPair(message.peerId, currentSessionId);
          panel?.webview.postMessage({
            type: "peer.pair",
            pairId: pair.pairId,
            token: pair.token,
            url: pair.url,
            expiresAt: pair.expiresAt,
          });
          status("杩炴帴 URL 宸茬敓鎴愶紝绛夊緟 Chrome Extension 绮樿创閰嶅", "ok");
          break;
        }
        case "peer.connected": {
          status("ChatGPT 娴忚鍣ㄤ笌 VS Code 宸茬洿杩?, "ok");
          break;
        }
        case "peer.message": {
          const data = message.data;
          if (!data || typeof data !== "object" || !("type" in data)) break;
          const event = data as { type: string; snapshot?: PageSnapshot; topicId?: string };
          if (event.type === "hello" && event.snapshot?.topicId) {
            currentTopicId = event.snapshot.topicId;
            await workspaceLinkWrite({ topicId: currentTopicId });
            await bootstrapTopic(currentTopicId);
          } else if (event.type === "topic.changed") {
            currentTopicId = event.topicId;
            await workspaceLinkWrite({ topicId: currentTopicId });
            if (currentTopicId) await bootstrapTopic(currentTopicId);
          } else if (event.type === "chat.completed" && event.snapshot) {
            await toolCallHandle(event.snapshot);
          }
          break;
        }
        default:
          break;
      }
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      panel?.webview.postMessage({ type: "error", message: messageText });
      status(messageText, "error");
    }
  };

  const open = () => {
    if (panel) {
      panel.reveal(vscode.ViewColumn.One);
      return;
    }
    panel = vscode.window.createWebviewPanel(
      "remoteDesktopCommander.kasmVnc",
      "Remote Desktop Commander",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );
    const scriptUri = panel.webview.asWebviewUri(
      vscode.Uri.joinPath(context.extensionUri, "dist", "media", "WebviewPanel.js"),
    );
    panel.webview.html = htmlCreate(panel.webview, context, scriptUri);
    panel.webview.onDidReceiveMessage(message => {
      void messageHandle(message as Record<string, unknown>);
    }, undefined, context.subscriptions);
    panel.onDidDispose(() => {
      panel = undefined;
    }, undefined, context.subscriptions);
  };

  const workspaceChanged = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    currentWorkspacePath = workspacePathRead();
    const link = workspaceLinkRead();
    currentSessionId = link.sessionId;
    currentAccountId = link.accountId;
    currentTopicId = link.topicId;
    panel?.webview.postMessage({
      type: "init",
      serverUrl,
      workspacePath: currentWorkspacePath,
      topicId: currentTopicId,
      sessionId: currentSessionId,
    });
    if (currentTopicId) panel?.webview.postMessage({ type: "topic.select", topicId: currentTopicId });
  });

  const command = vscode.commands.registerCommand("remoteDesktopCommander.openKasmVnc", open);
  context.subscriptions.push(workspaceChanged);
  return vscode.Disposable.from(command, workspaceChanged);
}


