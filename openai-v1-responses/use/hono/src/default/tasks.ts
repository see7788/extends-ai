import { randomUUID } from "node:crypto";

type StepStatus = "pending" | "running" | "completed" | "failed";
export type InstallStep = { id: string; title: string; description: string; status: StepStatus; error?: string; remainingSeconds?: number; detail?: string };
export type InstallTask = {
  taskId: string;
  peerUrl: string;
  status: "running" | "completed" | "failed" | "disconnected";
  steps: InstallStep[];
  result?: { codexHome: string };
  error?: string;
};
type TaskEvent = { id: number; task: InstallTask };
type Listener = (event: TaskEvent) => void;

const initialSteps: Omit<InstallStep, "status">[] = [
  { id: "brain-url", title: "连接 AI 大脑", description: "" },
  { id: "signaling", title: "连接 PeerJS 信令服务器", description: "等待 PeerJS 信令连接建立" },
  { id: "verify", title: "验证 AI 大脑", description: "通过 PeerJS metadata 验证身份并建立数据通道" },
  { id: "codex-config", title: "创建 Codex 配置文件", description: "更新 %USERPROFILE%\\.codex\\auth.json 和 config.toml，接入本机 Responses API" },
];

class InstallTasks {
  private readonly tasks = new Map<string, InstallTask>();
  private readonly history = new Map<string, TaskEvent[]>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly latestListeners = new Set<Listener>();
  private latestTaskId?: string;

  template(): InstallStep[] {
    return initialSteps.map(step => ({ ...step, status: "pending" }));
  }

  create(peerUrl: string): InstallTask {
    const task: InstallTask = {
      taskId: randomUUID(),
      peerUrl,
      status: "running",
      steps: initialSteps.map(step => ({ ...step, status: "pending" })),
    };
    this.tasks.set(task.taskId, task);
    this.latestTaskId = task.taskId;
    this.history.set(task.taskId, [{ id: 0, task: structuredClone(task) }]);
    // Notify pages that subscribed before this task existed.
    const initialEvent: TaskEvent = { id: 0, task: structuredClone(task) };
    for (const listener of this.latestListeners) listener(structuredClone(initialEvent));
    while (this.tasks.size > 20) {
      const oldest = this.tasks.keys().next().value;
      if (!oldest || this.listeners.has(oldest)) break;
      this.tasks.delete(oldest);
      this.history.delete(oldest);
    }
    return structuredClone(task);
  }

  get(taskId: string): InstallTask | undefined {
    const task = this.tasks.get(taskId);
    return task ? structuredClone(task) : undefined;
  }

  getLatest(): InstallTask | undefined {
    return this.latestTaskId ? this.get(this.latestTaskId) : undefined;
  }

  update(taskId: string, stepId: string, status: StepStatus, error?: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "running") return;
    const step = task.steps.find(item => item.id === stepId);
    if (!step) throw new Error("Unknown installation step: " + stepId);
    step.status = status;
    step.error = error;
    if (status !== "running") delete step.remainingSeconds;
    this.emit(taskId);
  }

  detail(taskId: string, stepId: string, detail: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "running") return;
    const step = task.steps.find(item => item.id === stepId);
    if (!step || step.status !== "running") return;
    step.detail = detail;
    this.emit(taskId);
  }

  countdown(taskId: string, stepId: string, remainingSeconds: number): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "running") return;
    const step = task.steps.find(item => item.id === stepId);
    if (!step || step.status !== "running") return;
    step.remainingSeconds = Math.max(0, remainingSeconds);
    this.emit(taskId);
  }

  resetAfterBrainDisconnect(taskId: string): void {
    const task = this.tasks.get(taskId);
    // A disconnect should reset a finished/failed installation to the first step.
    // Do not interrupt an installation while its filesystem operations are running.
    if (!task || task.status === "running" || task.status === "disconnected") return;
    task.status = "disconnected";
    // Keep the successful local installation result so VS Code can still be launched.
    task.error = undefined;
    task.steps = initialSteps.map(step => ({
      ...step,
      status: "pending",
    }));
    this.emit(taskId);
  }

  complete(taskId: string, result: NonNullable<InstallTask["result"]>): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "running") return;
    task.status = "completed";
    task.result = result;
    this.emit(taskId);
  }

  fail(taskId: string, stepId: string, error: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.status !== "running") return;
    const step = task.steps.find(item => item.id === stepId);
    if (step) { step.status = "failed"; step.error = error; }
    task.status = "failed";
    task.error = error;
    this.emit(taskId);
  }

  subscribeLatest(listener: Listener): () => void {
    this.latestListeners.add(listener);
    const task = this.getLatest();
    if (task) {
      const history = this.history.get(task.taskId) ?? [];
      const latest = history.at(-1);
      if (latest) listener(structuredClone(latest));
    }
    return () => this.latestListeners.delete(listener);
  }

  subscribe(taskId: string, listener: Listener, afterId = -1): () => void {
    const listeners = this.listeners.get(taskId) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(taskId, listeners);
    for (const event of this.history.get(taskId) ?? []) {
      if (event.id > afterId) listener(structuredClone(event));
    }
    return () => {
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(taskId);
    };
  }

  private emit(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    const history = this.history.get(taskId) ?? [];
    const event: TaskEvent = { id: (history.at(-1)?.id ?? -1) + 1, task: structuredClone(task) };
    history.push(event);
    this.history.set(taskId, history);
    for (const listener of this.listeners.get(taskId) ?? []) listener(structuredClone(event));
    if (taskId === this.latestTaskId) {
      for (const listener of this.latestListeners) listener(structuredClone(event));
    }
  }
}

export default new InstallTasks();