import type { ReactNode } from "react";
import { Layout, Typography, type TreeDataNode } from "antd";

const { Content, Header } = Layout;
const { Text, Title } = Typography;

export type TreeSection = {
  items: TreeDataNode[];
  titleRender(node: TreeDataNode): ReactNode | undefined;
};

export const errorText = (error: unknown): string => error instanceof Error
  ? error.message
  : String(error);

export const timeText = (value: string | null | undefined): string => value
  ? new Date(value).toLocaleString()
  : "—";

export const Shell = ({ children, subtitle }: {
  children: ReactNode;
  subtitle: string;
}) => (
  <Layout style={{ minHeight: "100vh", background: "#f5f7fa" }}>
    <Header style={{ background: "#ffffff", height: "auto", padding: "20px 28px" }}>
      <Title level={3} style={{ margin: 0 }}>Codex 账号管理</Title>
      <Text type="secondary">{subtitle}</Text>
    </Header>
    <Content style={{ padding: 24, maxWidth: 1180, width: "100%", margin: "0 auto" }}>
      {children}
    </Content>
  </Layout>
);
