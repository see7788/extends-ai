import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { Button, Typography, theme } from "antd";
import { CopyOutlined } from "@ant-design/icons";
import "./style.css";
import type { installStep_t, installTask_t } from "openai-v1-responses-use-hono/default/rpc";
import rpc from "./default/rpc.ts";
import events from "./default/events.ts";

const { Text } = Typography;
export default function App() {
  const { token: themeToken } = theme.useToken();
  const timelineTheme = {
    "--timeline-success": themeToken.colorSuccess,
    "--timeline-error": themeToken.colorError,
    "--timeline-border": themeToken.colorBorder,
    "--timeline-bg": themeToken.colorBgContainer,
    "--timeline-text": themeToken.colorText,
    "--timeline-text-secondary": themeToken.colorTextSecondary,
    "--timeline-text-tertiary": themeToken.colorTextQuaternary,
  } as CSSProperties;
  const [pastedUrl, setPastedUrl] = useState("");
  const [steps, setSteps] = useState<installStep_t[]>([]);
  const [taskId, setTaskId] = useState("");
  const [task, setTask] = useState<installTask_t>();
  const [submitting, setSubmitting] = useState(false);
  const [requestError, setRequestError] = useState("");
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState("");
  const [disconnecting, setDisconnecting] = useState(false);
  const [brainConnected, setBrainConnected] = useState(false);
  const [installedResult, setInstalledResult] = useState<installTask_t["result"]>();

  useEffect(() => {
    let active = true;
    void rpc.steps().then(value => {
      if (active) setSteps(value);
    }).catch(error => {
      if (active) setRequestError(error instanceof Error ? error.message : String(error));
    });
    return () => { active = false; };
  }, []);

  useEffect(() => events.subscribe({
    install: next => {
      setTaskId(next.taskId);
      setTask(next);
      setPastedUrl(next.peerUrl);
      if (next.result) setInstalledResult(next.result);
    },
    peerStatus: status => setBrainConnected(status.connected),
  }), []);

  const launchVsCode = async () => {
    setLaunching(true);
    setLaunchError("");
    try {
      await rpc.launch();
    } catch (error) {
      setLaunchError(error instanceof Error ? error.message : String(error));
    } finally {
      setLaunching(false);
    }
  };

  const disconnectBrain = async () => {
    if (disconnecting) return;
    setDisconnecting(true);
    setRequestError("");
    try {
      await rpc.disconnect();
      setBrainConnected(false);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error));
    } finally {
      setDisconnecting(false);
    }
  };

  const connect = async (peerUrl: string) => {
    setSubmitting(true);
    setBrainConnected(false);
    setRequestError("");
    setTask(undefined);
    setTaskId("");
    try {
      const result = await rpc.connect({ peerUrl });
      setTaskId(result.taskId);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error));
    } finally {
      setSubmitting(false);
    }
  };

  const pasteBrainUrl = async () => {
    if (busy) return;
    setRequestError("");
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error("当前浏览器不支持读取剪贴板");
      }
      const peerUrl = (await navigator.clipboard.readText()).trim();
      if (!peerUrl) throw new Error("剪贴板没有 openai-v1-responses大脑 URL");
      setPastedUrl(peerUrl);
      await connect(peerUrl);
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : String(error));
    }
  };

  const visibleSteps = task?.steps ?? steps;
  const busy = submitting || Boolean(taskId && (!task || task.status === "running"));

  const renderStepContent = (step: installStep_t, index: number) => (
    <div>
      {index === 0 && (
        <div className="brain-url-content">
          {pastedUrl && brainConnected ? (
            <div className="brain-url-row">
              <Text type="secondary" className="brain-url-text" ellipsis={{ tooltip: pastedUrl }}>
                {pastedUrl}
              </Text>
              <Button
                size="small"
                icon={<CopyOutlined />}
                title="复制 openai-v1-responses大脑 URL"
                onClick={() => void navigator.clipboard.writeText(pastedUrl).catch(error => setRequestError(error instanceof Error ? error.message : String(error)))}
              />
              <Button size="small" loading={disconnecting} disabled={busy} onClick={disconnectBrain}>
                断开 openai-v1-responses大脑
              </Button>
            </div>
          ) : (
            <Button
              onClick={pasteBrainUrl}
              loading={submitting}
              disabled={busy}
            >
              粘贴 openai-v1-responses大脑 URL
            </Button>
          )}
          {requestError && <Text type="danger">{requestError}</Text>}
        </div>
      )}
      {step.description && <div>{step.description}</div>}
      {step.id === "signaling" && step.status === "running" && step.remainingSeconds !== undefined && (
        <Text type="secondary">连接信令服务器，剩余 {step.remainingSeconds} 秒</Text>
      )}
      {step.detail && <Text type="secondary">{step.detail}</Text>}
      {step.error && <Text type="danger">{step.error}</Text>}
      {step.id === "codex-config" && task?.result && (
        <div className="shortcut-path-row">
          <Text type="secondary">{task.result.codexHome}</Text>
          <Button
            size="small"
            icon={<CopyOutlined />}
            title="复制 Codex 配置目录"
            onClick={() => void navigator.clipboard.writeText(task.result!.codexHome)}
          />
        </div>
      )}
    </div>
  );

  const activeStepIndex = (() => {
    const running = visibleSteps.findIndex(step => step.status === "running");
    if (running >= 0) return running;
    const failed = visibleSteps.findIndex(step => step.status === "failed");
    if (failed >= 0) return failed;
    if (task?.status === "completed") return visibleSteps.length - 1;
    return 0;
  })();

  const getNodeStatus = (step: installStep_t, index: number) =>
    step.status === "failed" ? "error"
      : index <= activeStepIndex ? "active"
        : "pending";

  return (
    <main className="install-timeline-page" style={timelineTheme}>
      <div className="install-timeline">
        {visibleSteps.map((step, index) => {
          const nodeStatus = getNodeStatus(step, index);
          const isLeft = index % 2 === 0;
          return (
            <section className="install-timeline-row" key={step.id}>
              <div className={`install-timeline-content ${isLeft ? "is-left" : "is-right"}`}>
                <div className="install-timeline-title">{step.title}</div>
                {renderStepContent(step, index)}
              </div>
              <div className={`install-timeline-node is-${nodeStatus}`} aria-label={`第 ${index + 1} 步：${step.title}`}>
                {nodeStatus === "error" ? "!" : index + 1}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}
