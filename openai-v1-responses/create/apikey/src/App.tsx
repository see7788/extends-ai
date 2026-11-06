import { useEffect, useRef } from "react";
import { useImmer } from "use-immer";
import { Alert, Button, Collapse, Descriptions, Drawer, Input, Space, Tag, Typography, message, theme } from "antd";
import { CopyOutlined, MessageOutlined, SendOutlined } from "@ant-design/icons";
import { Peer } from "peerjs";
import type { DataConnection } from "peerjs";
import declare from "./declare/declare.ts";

const { Text } = Typography;
function createConnectionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

type LogItem = {
  id: number;
  direction: "received" | "sent";
  text: string;
  time: string;
};

export default function App() {
  const { token: themeToken } = theme.useToken();
  const [state, updateState] = useImmer(() => {
    return {
      status: "connecting" as "connecting" | "connected" | "disconnected" | "error",
      peerId: "",
      peerError: "",
      token: createConnectionToken(),
      addressCopied: false,
      input: "",
      logs: [] as LogItem[],
      logsDrawerOpen: false,
      connectedPeerIds: [] as string[],
    };
  });
  const connectionsRef = useRef(new Set<DataConnection>());
  const verificationRef = useRef(new Map<DataConnection, boolean>());
  const logId = useRef(0);

  const addLog = (direction: LogItem["direction"], text: string) => {
    const entry: LogItem = {
      id: logId.current++,
      direction,
      text,
      time: new Date().toLocaleTimeString(),
    };
    updateState(draft => {
      draft.logs.push(entry);
    });
  };

  useEffect(() => {
    const peer = new Peer(declare.peerjs);

    peer.on("open", id => {
      updateState(draft => {
        draft.peerId = id;
        draft.peerError = "";
        draft.status = "connected";
        draft.addressCopied = false;
      });
    });

    peer.on("connection", connection => {
      const metadata = connection.metadata as { token?: unknown } | undefined;
      const verified = metadata?.token === state.token;
      verificationRef.current.set(connection, verified);


      connection.on("open", () => {
        connectionsRef.current.add(connection);
        const connectedPeerIds = [...new Set([...connectionsRef.current].map(item => item.peer))];
        updateState(draft => {
          draft.connectedPeerIds = connectedPeerIds;
        });
      });

      connection.on("data", data => {
        // 仅 Token 验证通过的使用者可以收发消息。
        const canUseAiBrain = verificationRef.current.get(connection) === true;

        if (!canUseAiBrain) {
          const denial = "无权使用ai大脑";
          if (connection.open) connection.send(denial);
          addLog("sent", denial);
          return;
        }

        if (typeof data === "string") {
          addLog("received", data);
          let request: { type?: string; id?: string; payload?: unknown } | undefined;
          try {
            request = JSON.parse(data) as typeof request;
          } catch {
            // Keep raw-string manual testing available.
          }

          if (request?.type === "request" && request.id) {
            void (async () => {
              try {
                const response = await fetch("/api/responses", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify(request!.payload),
                });
                if (!response.ok || !response.body) {
                  const detail = await response.text();
                  throw new Error(detail || `OpenAI request failed: ${response.status}`);
                }
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = "";
                while (true) {
                  const { value, done } = await reader.read();
                  if (done) break;
                  buffer += decoder.decode(value, { stream: true });
                  const frames = buffer.split("\n\n");
                  buffer = frames.pop() ?? "";
                  for (const frame of frames) {
                    const dataLine = frame.split("\n").find(line => line.startsWith("data:"));
                    if (!dataLine) continue;
                    const eventText = dataLine.slice(5).trim();
                    if (!eventText || eventText === "[DONE]") continue;
                    const event = JSON.parse(eventText) as unknown;
                    const message = JSON.stringify({ type: "event", id: request!.id, event });
                    if (connection.open) connection.send(message);
                    addLog("sent", message);
                  }
                }
              } catch (error) {
                const message = JSON.stringify({
                  type: "error",
                  id: request!.id,
                  error: { message: error instanceof Error ? error.message : String(error) },
                });
                if (connection.open) connection.send(message);
                addLog("sent", message);
              }
            })();
            return;
          }

          // Legacy raw-string smoke test remains available until Hono is switched to envelopes.
          const mockAnswer = "1";
          if (connection.open) {
            connection.send(mockAnswer);
            addLog("sent", mockAnswer);
          }
        }
      });

      const removeConnection = () => {
        connectionsRef.current.delete(connection);
        verificationRef.current.delete(connection);
        const connectedPeerIds = [...new Set(
          [...connectionsRef.current].filter(item => item.open).map(item => item.peer)
        )];
        updateState(draft => {
          draft.connectedPeerIds = connectedPeerIds;
        });
      };

      connection.on("close", removeConnection);

      connection.on("error", error => {
        removeConnection();
        message.error(`PeerJS 数据连接错误：${error.message}`);
      });
    });

    peer.on("disconnected", () => updateState(draft => {
      draft.status = "disconnected";
    }));
    peer.on("close", () => updateState(draft => {
      draft.status = "disconnected";
    }));
    peer.on("error", error => {
      updateState(draft => {
        draft.status = "error";
        draft.peerError = `${error.type}：${error.message}`;
      });
    });

    // 事件处理之外再巡检一次，避免 close/error 事件遗漏后列表残留。
    const connectionWatchdog = window.setInterval(() => {
      const staleConnections = [...connectionsRef.current].filter(connection => !connection.open);
      if (staleConnections.length === 0) return;

      for (const connection of staleConnections) {
        connectionsRef.current.delete(connection);
        verificationRef.current.delete(connection);
      }

      const connectedPeerIds = [...new Set(
        [...connectionsRef.current].filter(connection => connection.open).map(connection => connection.peer)
      )];
      updateState(draft => {
        draft.connectedPeerIds = connectedPeerIds;
      });
    }, 1000);

    return () => {
      window.clearInterval(connectionWatchdog);
      for (const connection of connectionsRef.current) connection.close();
      connectionsRef.current.clear();
      verificationRef.current.clear();
      peer.destroy();
    };
  }, [state.token, updateState]);

  const peerUrl = state.peerId
    ? new URL(`${declare.peerjs.secure ? "https" : "http"}://${declare.peerjs.host}:${declare.peerjs.port}${declare.peerjs.path}`)
    : undefined;
  peerUrl?.searchParams.set("peerId", state.peerId);
  peerUrl?.searchParams.set("key", declare.peerjs.key);
  peerUrl?.searchParams.set("config", JSON.stringify(declare.peerjs.config));
  peerUrl?.searchParams.set("token", state.token);
  const peerEndpoint = peerUrl?.toString() ?? "";

  const send = () => {
    // 仅向 Token 验证通过且在线的使用者发送消息。
    const targets = [...connectionsRef.current].filter(connection =>
      connection.open && verificationRef.current.get(connection) === true
    );
    if (!targets.length) {
      message.warning("当前没有验证通过且在线的使用者");
      return;
    }
    if (!state.input) return;
    for (const connection of targets) connection.send(state.input);
    addLog("sent", state.input);
    updateState(draft => {
      draft.input = "";
    });
  };

  const copyUrl = async () => {
    if (!peerEndpoint) return;
    await navigator.clipboard.writeText(peerEndpoint);
    updateState(draft => {
      draft.addressCopied = true;
    });
    message.success("已复制 PeerJS 服务地址");
  };

  const currentStep = state.status === "connected"
    ? state.connectedPeerIds.length > 0 ? 3 : state.addressCopied ? 2 : 1
    : 0;
  const steps = [
    {
      title: "连接信令服务",
      action: null,
      content: (
        <Collapse
          ghost
          items={[{
            key: "signaling-config",
            label: `host: ${declare.peerjs.host}`,
            children: <>
              <Descriptions
                size="small"
                column={1}
                items={[
                  {
                    key: "status",
                    label: "status",
                    children: <Text type={state.status === "error" || state.status === "disconnected" ? "danger" : state.status === "connected" ? "success" : "secondary"}>{state.status}</Text>,
                  },
                  ...Object.entries(declare.peerjs).map(([key, value]) => ({
                    key,
                    label: key,
                    children: typeof value === "object" ? (
                      <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(value, null, 2)}</pre>
                    ) : (
                      <Text style={{ overflowWrap: "anywhere" }}>{String(value)}</Text>
                    ),
                  })),
                  {
                    key: "peerId",
                    label: "peerId",
                    children: <Text style={{ overflowWrap: "anywhere" }}>{state.peerId || "等待分配"}</Text>,
                  },
                ]}
              />
              {state.status === "error" && (
                <Alert style={{ marginTop: 8 }} type="error" showIcon title="PeerJS 连接失败" description={state.peerError} />
              )}
            </>,
          }]}
        />
      ),
    },
    {
      title: "openai-v1-responses大脑 URL",
      action: null,
      content: (
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <Text ellipsis style={{ flex: 1, minWidth: 0 }}>
              {peerEndpoint || "连接成功后自动生成"}
            </Text>
            <Button
              icon={<CopyOutlined />}
              disabled={state.status !== "connected" || !peerEndpoint}
              onClick={() => void copyUrl()}
            >分享</Button>
          </div>
          <Text type="secondary">地址包含连接凭据，包含认证信息。</Text>
        </div>
      ),
    },
    {
      title: "使用者列表",
      action: null,
      content: (
        <Space wrap size={[8, 8]}>
          {state.connectedPeerIds.map(peerId => {
            const activeConnection = [...connectionsRef.current].find(
              connection => connection.peer === peerId && connection.open
            );
            const verified = activeConnection
              ? verificationRef.current.get(activeConnection) === true
              : false;
            return (
              <Tag key={peerId} color={verified ? "success" : "error"} title={verified ? "Token 验证通过" : "Token 验证失败"}>
                {peerId}
              </Tag>
            );
          })}
        </Space>
      ),
    },
    {
      title: "收发消息",
      action: (
        <Button
          icon={<MessageOutlined />}
          disabled={state.connectedPeerIds.length === 0}
          onClick={() => updateState(draft => {
            draft.logsDrawerOpen = true;
          })}
        >消息{state.logs.length > 0 ? `（${state.logs.length}）` : ""}</Button>
      ),
      content: (
        <Text type="secondary">
          {state.connectedPeerIds.length > 0
            ? `${state.connectedPeerIds.length} 个客户端已连接`
            : "等待客户端使用上方地址连接"}
        </Text>
      ),
    },
  ];

  return (
    <main className="peer-timeline-page">
      <style>{`
        .peer-timeline-page {
          width: min(960px, 100%);
          min-height: 100vh;
          margin: 0 auto;
          padding: 24px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }
        .peer-timeline {
          width: 100%;
        }
        .peer-timeline {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 34px;
          padding: 8px 0;
          isolation: isolate;
        }
        .peer-timeline::before {
          content: "";
          position: absolute;
          z-index: 0;
          top: 18px;
          bottom: 18px;
          left: 50%;
          width: 2px;
          transform: translateX(-50%);
          background: ${themeToken.colorSuccess};
          opacity: .7;
        }
        .peer-timeline-row {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr) 72px minmax(0, 1fr);
          align-items: start;
          min-height: 76px;
        }
        .peer-timeline-node {
          position: relative;
          z-index: 2;
          grid-column: 2;
          grid-row: 1;
          justify-self: center;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 30px;
          height: 30px;
          margin: 0;
          border: 2px solid ${themeToken.colorSuccess};
          border-radius: 50%;
          background: ${themeToken.colorBgContainer};
          color: ${themeToken.colorSuccess};
          font-size: 12px;
          line-height: 1;
          font-weight: 600;
          box-sizing: border-box;
        }
        .peer-timeline-node.is-active {
          color: #fff;
          background: ${themeToken.colorSuccess};
        }
        .peer-timeline-node.is-pending {
          border-color: ${themeToken.colorBorder};
          color: ${themeToken.colorTextQuaternary};
        }
        .peer-timeline-node.is-error {
          border-color: ${themeToken.colorError};
          color: #fff;
          background: ${themeToken.colorError};
        }
        .peer-timeline-content {
          min-width: 0;
          padding: 0 12px 4px;
        }
        .peer-timeline-content.is-left {
          grid-column: 1;
          grid-row: 1;
          text-align: right;
        }
        .peer-timeline-content.is-right {
          grid-column: 3;
          grid-row: 1;
          text-align: left;
        }
        .peer-timeline-heading {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          min-width: 0;
          margin-bottom: 8px;
        }
        .peer-timeline-content.is-right .peer-timeline-heading {
          justify-content: flex-start;
        }
        .peer-timeline-title {
          margin: 0;
          color: ${themeToken.colorText};
          font-size: 15px;
          line-height: 1.4;
          font-weight: 600;
          white-space: nowrap;
        }
        .peer-timeline-heading .ant-btn {
          flex: 0 0 auto;
          height: 26px;
          padding-inline: 7px;
          font-size: 12px;
          line-height: 1;
        }
        .peer-timeline-content.is-left .ant-collapse-header,
        .peer-timeline-content.is-left .ant-collapse-content-box {
          justify-content: flex-end;
          text-align: right;
        }
        .peer-timeline-content.is-left .ant-space {
          justify-content: flex-end;
        }
        @media (max-width: 640px) {
          .peer-timeline-page {
            margin: 24px auto;
            padding: 0 10px;
          }
          /* 窄屏仍保持中轴线与左右交替，只压缩中轴和两侧留白。 */
          .peer-timeline {
            gap: 26px;
          }
          .peer-timeline::before {
            left: 50%;
          }
          .peer-timeline-row {
            grid-template-columns: minmax(0, 1fr) 42px minmax(0, 1fr);
            min-height: 0;
          }
          .peer-timeline-node {
            grid-column: 2;
            grid-row: 1;
            justify-self: center;
            width: 26px;
            height: 26px;
            font-size: 11px;
          }
          .peer-timeline-content {
            padding: 0 5px 4px;
          }
          .peer-timeline-title {
            font-size: 14px;
            margin-bottom: 8px;
            overflow-wrap: anywhere;
          }
          .peer-timeline-content.is-left {
            grid-column: 1;
            grid-row: 1;
            text-align: right;
          }
          .peer-timeline-content.is-right {
            grid-column: 3;
            grid-row: 1;
            text-align: left;
          }
          .peer-timeline-content.is-left .ant-collapse-header,
          .peer-timeline-content.is-left .ant-collapse-content-box {
            justify-content: flex-end;
            text-align: right;
          }
          .peer-timeline-content.is-left .ant-space {
            justify-content: flex-end;
          }
        }
      `}</style>
      <div className="peer-timeline">
        {steps.map((step, index) => (
          <section className="peer-timeline-row" key={step.title}>
            <span
              className={`peer-timeline-node ${index > currentStep ? "is-pending" : "is-active"} ${state.status === "error" && index === 0 ? "is-error" : ""}`}
              aria-hidden="true"
            >{index + 1}</span>
            <div className={`peer-timeline-content ${index % 2 === 0 ? "is-left" : "is-right"}`}>
              <div className="peer-timeline-heading">
                <h3 className="peer-timeline-title">{step.title}</h3>
                {step.action}
              </div>
              {step.content}
            </div>
          </section>
        ))}
      </div>

      <Drawer
        title={`收发消息 · ${state.logs.length} 条记录`}
        placement="right"
        width={480}
        open={state.logsDrawerOpen}
        onClose={() => updateState(draft => {
          draft.logsDrawerOpen = false;
        })}
        footer={
          <Space.Compact style={{ width: "100%" }}>
            <Input
              value={state.input}
              onChange={({ target: { value } }) => updateState(draft => {
                draft.input = value;
              })}
              onPressEnter={send}
              disabled={state.connectedPeerIds.length === 0}
              placeholder="输入要发送的字符串"
            />
            <Button
              icon={<SendOutlined />}
              disabled={state.connectedPeerIds.length === 0 || !state.input}
              onClick={send}
            >发送</Button>
          </Space.Compact>
        }
        extra={
          <Button
            disabled={state.logs.length === 0}
            onClick={() => updateState(draft => {
              draft.logs = [];
            })}
          >清空记录</Button>
        }
      >
        {state.logs.length > 0 ? state.logs.map(item => (
          <div key={item.id} style={{ padding: "12px 0", borderBottom: "1px solid #f0f0f0" }}>
            <Space size="small" style={{ marginBottom: 6 }}>
              <Tag color={item.direction === "received" ? "default" : "green"}>
                {item.direction === "received" ? "收到" : "发送"}
              </Tag>
              <Text type="secondary" style={{ fontSize: 12 }}>{item.time}</Text>
            </Space>
            <pre style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontFamily: "inherit" }}>{item.text}</pre>
          </div>
        )) : <Text type="secondary">暂无收发记录</Text>}
      </Drawer>
    </main>
  );
}
