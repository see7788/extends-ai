/// <reference types="vscode" />

/**
 * Tree View 端点：package.json 将这个 View 放进扩展自己的 Activity Bar 容器，
 * 用户点击 Activity Bar 图标后，会在侧边栏看到树形列表。
 *
 * Tree View 适合展示层级数据、项目资源、依赖关系、任务节点和可展开的导航结构。
 * 这里的 TreeDataProvider 只负责 Node 侧的数据和节点行为，树节点上的命令通过
 * package.json 的 menus.view/item/context 或命令声明接入 VS Code UI。
 */
import * as vscode from "vscode";
function getEnvironment() {
  return {
    vscode,
    window: vscode.window,
    commands: vscode.commands,
    treeItem: vscode.TreeItem,
  };
}

function getCommunicationTargets() {
  return ["extension", "commands", "status-bar"] as const;
}

class TreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    if (element) {
      return [];
    }
    return [new vscode.TreeItem("TreeDataProvider is ready")];
  }
}

export default function register(): vscode.Disposable {
  return vscode.window.registerTreeDataProvider(
    "remote-desktop-commander-mcpserver-vscode-extension.treeView",
    new TreeDataProvider(),
  );
}
