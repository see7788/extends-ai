import { Card, type CardProps } from "antd";

const GlassCard = ({ style, ...props }: CardProps) => (
  <Card
    {...props}
    style={{
      backdropFilter: "blur(20px) saturate(140%)",
      background: "rgba(255, 255, 255, 0.72)",
      WebkitBackdropFilter: "blur(20px) saturate(140%)",
      ...style,
    }}
    size={props.size ?? "small"}
    variant={props.variant ?? "borderless"}
  />
);

export default GlassCard;
