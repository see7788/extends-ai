/// <reference types="vscode" />

/**
 * Status Bar 端点：内容显示在 VS Code 窗口最底部的状态栏。
 *
 * 状态栏适合展示短状态和快捷入口，例如当前环境、连接状态、后台任务进度或当前
 * 项目的摘要信息。它通过 Extension Host API 创建，不需要在 package.json 的
 * contributes 中声明；点击行为通常通过 item.command 或 command 注册完成。
 */
import * as vscode from "vscode";
function getEnvironment() {
  return {
    vscode,
    window: vscode.window,
    commands: vscode.commands,
    statusBarAlignment: vscode.StatusBarAlignment,
  };
}

function getCommunicationTargets() {
  return ["extension", "commands"] as const;
}

export default function register(): vscode.StatusBarItem {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  item.text = "$(vm) VS Code Extension";
  item.tooltip = "VS Code Extension Application";
  item.show();
  return item;
}
