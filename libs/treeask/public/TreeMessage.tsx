import { Alert, Flex, Spin, Typography } from "antd";

type TreeMessageProps = {
  label: string;
  text: string;
  tone: "neutral" | "question" | "answer";
  pending: boolean;
  error: string | null;
};

const toneColor = {
  answer: "#f6ffed",
  neutral: "#fafafa",
  question: "#e6f4ff",
} satisfies Record<TreeMessageProps["tone"], string>;

const TreeMessage = ({ label, text, tone, pending, error }: TreeMessageProps) => (
  <Flex
    vertical
    gap={6}
    style={{
      background: toneColor[tone],
      borderRadius: 8,
      minWidth: 220,
      padding: "10px 12px",
    }}
  >
    <Flex align="center" gap={8}>
      <Typography.Text strong>{label}</Typography.Text>
      {pending ? <Spin size="small" aria-label="正在回答" /> : null}
    </Flex>
    <Typography.Paragraph style={{ margin: 0, overflowWrap: "anywhere", whiteSpace: "pre-wrap" }}>
      {text}
    </Typography.Paragraph>
    {error ? <Alert message={error} type="error" showIcon /> : null}
  </Flex>
);

export default TreeMessage;
