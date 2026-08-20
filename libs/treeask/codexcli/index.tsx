import { Button, Card, Input, Space, Tree, Typography, type TreeDataNode } from "antd";
import { useMemo, useState } from "react";
import TreeMessage from "../public/TreeMessage.tsx";
import store from "../store.ts";

type CodexcliNode = ReturnType<typeof store.getState>["codexcli"]["nodes"][number];

const presentation = {
  assistant: { label: "回答", tone: "answer" },
  project: { label: "项目", tone: "neutral" },
  user: { label: "问题", tone: "question" },
} as const satisfies Record<
  CodexcliNode["role"],
  { label: string; tone: "neutral" | "question" | "answer" }
>;

const questionParent = (node: CodexcliNode | undefined): node is CodexcliNode => (
  node !== undefined
  && node.status === "ready"
  && (node.role === "project" || node.role === "assistant")
);

const Codexcli = () => {
  const nodes = store(state => state.codexcli.nodes);
  const ask = store(state => state.codexcliActions.ask);
  const [selectedId, setSelectedId] = useState("root");
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const selectedNode = nodes.find(node => node.id === selectedId);
  const canAsk = questionParent(selectedNode) && draft.trim().length > 0 && !submitting;

  const treeData = useMemo(() => {
    const read = (parentId: string | null): TreeDataNode[] => nodes
      .filter(node => node.parentId === parentId)
      .map(node => ({
        children: read(node.id),
        key: node.id,
        title: (
          <TreeMessage
            error={node.error}
            label={presentation[node.role].label}
            pending={node.status === "streaming"}
            text={node.text}
            tone={presentation[node.role].tone}
          />
        ),
      }));
    return read(null);
  }, [nodes]);
  const expandedKeys = nodes
    .filter(node => nodes.some(candidate => candidate.parentId === node.id))
    .map(node => node.id);

  const send = async () => {
    if (!canAsk) return;
    setSubmitting(true);
    const text = draft;
    setDraft("");
    try {
      await ask({ parentId: selectedId, text });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main style={{ margin: "0 auto", maxWidth: 960, padding: "24px 16px" }}>
      <Space direction="vertical" size={16} style={{ width: "100%" }}>
        <div>
          <Typography.Title level={2} style={{ margin: 0 }}>Tree Ask</Typography.Title>
          <Typography.Text type="secondary">从项目或任意已完成回答继续提问。</Typography.Text>
        </div>
        <Card size="small">
          <Tree
            blockNode
            expandedKeys={expandedKeys}
            selectedKeys={[selectedId]}
            treeData={treeData}
            onSelect={keys => setSelectedId(keys[0] === undefined ? "root" : String(keys[0]))}
          />
        </Card>
        <Card size="small" title="继续提问">
          <Space direction="vertical" size={10} style={{ width: "100%" }}>
            <Typography.Text type={questionParent(selectedNode) ? "secondary" : "warning"}>
              {questionParent(selectedNode)
                ? "当前节点可以继续提问。"
                : "请选择项目或一个已完成的回答。"}
            </Typography.Text>
            <Input.TextArea
              autoSize={{ minRows: 3, maxRows: 8 }}
              placeholder="输入问题"
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onPressEnter={event => {
                if (!event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <Button type="primary" disabled={!canAsk} loading={submitting} onClick={() => void send()}>
              发送
            </Button>
          </Space>
        </Card>
      </Space>
    </main>
  );
};

export default Codexcli;
