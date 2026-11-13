﻿import Base, { type context_t } from "invoke-protocol";
import peer from "./peer.js";
import auth from "./auth.js";
import tasks from "./tasks.js";

type RpcContext = context_t;

class DefaultRpc extends Base<RpcContext> {
  override async dispatchInit(): Promise<void> {}

  dispatch(path: string, input: unknown): Promise<unknown> {
    return this.dispatchRoute({ path, input });
  }
}

let activeTaskId: string | undefined;
let previousPeerConnected = false;

peer.subscribe(status => {
  if (previousPeerConnected && !status.connected && activeTaskId) {
    tasks.resetAfterBrainDisconnect(activeTaskId);
  }
  previousPeerConnected = status.connected;
});

async function runInstall(taskId: string, peerUrl: string): Promise<void> {
  let currentStep = "brain-url";
  try {
    tasks.update(taskId, currentStep, "running");
    const target = new URL(peerUrl);
    if (target.protocol !== "http:" && target.protocol !== "https:") {
      throw new Error("PeerJS URL 必须使用 http:// 或 https://");
    }
    const peerId = target.searchParams.get("peerId")?.trim();
    const token = target.searchParams.get("token")?.trim();
    if (!peerId) throw new Error("PeerJS URL 缺少 peerId 参数");
    if (!token) throw new Error("PeerJS URL 缺少连接 token");
    let config: import("peerjs").PeerJSOption["config"];
    const configText = target.searchParams.get("config");
    if (configText) config = JSON.parse(configText);
    const peerOptions = {
      host: target.hostname,
      port: Number(target.port || (target.protocol === "https:" ? 443 : 80)),
      path: target.pathname,
      key: target.searchParams.get("key") || "peerjs",
      secure: target.protocol === "https:",
      ...(config ? { config } : {}),
    };
    tasks.update(taskId, currentStep, "completed");

    currentStep = "signaling";
    tasks.update(taskId, currentStep, "running");
    await peer.connectSignaling(peerOptions, remainingSeconds => {
      tasks.countdown(taskId, currentStep, remainingSeconds);
    });
    tasks.update(taskId, currentStep, "completed");

    currentStep = "verify";
    tasks.update(taskId, currentStep, "running");
    await peer.verifyBrain(peerId, token, detail => {
      tasks.detail(taskId, currentStep, detail);
    });
    tasks.update(taskId, currentStep, "completed");

    currentStep = "codex-config";
    tasks.update(taskId, currentStep, "running");
    await auth.createCodexConfig();
    tasks.update(taskId, currentStep, "completed");
    tasks.complete(taskId, { codexHome: auth.codexHome });
  } catch (cause) {
    const error = cause instanceof Error ? cause.message.trim() || cause.name : String(cause);
    tasks.fail(taskId, currentStep, error || "未知错误");
  }
}

const rpc = new DefaultRpc().register(({ route, routes, zod, zodUndefined }) => routes({
  steps: route(zodUndefined, () => tasks.template()),
  launch: route(zodUndefined, async () => {
    await auth.launchVsCode();
    return { launched: true };
  }),
  disconnect: route(zodUndefined, () => {
    peer.disconnectBrain();
    return { disconnected: true };
  }),
  connect: route(
    zod.object({ peerUrl: zod.string().min(1) }),
    async ({ input }) => {
      const task = tasks.create(input.peerUrl);
      activeTaskId = task.taskId;
      void runInstall(task.taskId, input.peerUrl);
      return { taskId: task.taskId };
    },
  ),
}));

export type installTask_t = import("./tasks.js").InstallTask;
export type installStep_t = import("./tasks.js").InstallStep;
export type peerStatus_t = import("./peer.js").PeerStatus;
export default rpc;
