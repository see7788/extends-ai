import * as vscode from "vscode";

export default function create(context: vscode.ExtensionContext): vscode.WebviewViewProvider {
  return {
    resolveWebviewView(view) {
      view.webview.options = {
        enableScripts: true,
        localResourceRoots: [context.extensionUri],
      };
      const scriptUri = view.webview.asWebviewUri(
        vscode.Uri.joinPath(context.extensionUri, "dist", "media", "WebviewView.js"),
      );
      const nonce = Array.from({ length: 32 }, () => Math.random().toString(36)[2] ?? "0").join("");
      view.webview.html = [
        "<!doctype html><html><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">",
        "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src ",
        view.webview.cspSource,
        " 'unsafe-inline'; script-src 'nonce-",
        nonce,
        "'\"><title>Remote Desktop Commander</title></head><body><main id=\"app\"></main><script type=\"module\" nonce=\"",
        nonce,
        "\" src=\"",
        scriptUri,
        "\"></script></body></html>",
      ].join("");
      view.webview.onDidReceiveMessage(message => {
        if (message?.type === "open") {
          void vscode.commands.executeCommand("remoteDesktopCommander.openKasmVnc");
        }
        if (message?.type === "configure") {
          void vscode.commands.executeCommand("remoteDesktopCommander.configureServer");
        }
      }, undefined, context.subscriptions);
    },
  };
}
