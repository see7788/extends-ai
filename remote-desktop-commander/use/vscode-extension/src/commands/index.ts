import * as vscode from "vscode";

export default function register(context: vscode.ExtensionContext): vscode.Disposable {
  const configureServer = vscode.commands.registerCommand(
    "remoteDesktopCommander.configureServer",
    async () => {
      const current = context.globalState.get<string>("serverUrl", "");
      const value = await vscode.window.showInputBox({
        title: "Hono Server",
        prompt: "输入远程 Hono 服务地址",
        value: current,
        placeHolder: "https://your-server.example.com",
        ignoreFocusOut: true,
        validateInput: input => {
          try {
            const url = new URL(input);
            return url.protocol === "http:" || url.protocol === "https:"
              ? undefined
              : "只支持 http 或 https";
          } catch {
            return "请输入完整 URL";
          }
        },
      });
      if (!value) return;
      await context.globalState.update("serverUrl", new URL(value).toString().replace(/\/$/, ""));
      await vscode.commands.executeCommand("remoteDesktopCommander.openKasmVnc");
    },
  );
  const refresh = vscode.commands.registerCommand(
    "remoteDesktopCommander.refresh",
    () => vscode.commands.executeCommand("remoteDesktopCommander.openKasmVnc"),
  );

  return vscode.Disposable.from(configureServer, refresh);
}
