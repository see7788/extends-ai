import * as vscode from "vscode";
import registerWebviewPanel from "./webview-panel/node/index";
import createWebviewViewProvider from "./webview-view/node/index";

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    registerWebviewPanel(context),
    vscode.window.registerWebviewViewProvider(
      "remoteDesktopCommander.control",
      createWebviewViewProvider(context),
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );
}

export function deactivate(): void {}
