import { Peer, type PeerJSOption } from "peerjs";

export async function publishTopic(
  instanceId: string,
  topicId: string,
  address: string,
  options: PeerJSOption = {},
): Promise<void> {
  await publish(instanceId, { type: "rdc.topic", topicId, address }, options);
}

export async function publishTopicClosed(instanceId: string, topicId: string, options: PeerJSOption = {}): Promise<void> {
  await publish(instanceId, { type: "rdc.topic.closed", topicId }, options);
}

async function publish(instanceId: string, message: unknown, options: PeerJSOption): Promise<void> {
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(instanceId)) throw new Error("Invalid VNC instanceId");
  const peer = new Peer(options);
  try {
    await new Promise<void>((resolve, reject) => {
      peer.once("open", () => resolve());
      peer.once("error", reject);
    });
    const connection = peer.connect(`rdc-vnc-${instanceId}`, { reliable: true, serialization: "json" });
    await new Promise<void>((resolve, reject) => {
      connection.once("open", resolve);
      connection.once("error", reject);
      peer.once("error", reject);
    });
    const topicId = (message as { topicId: string }).topicId;
    const acknowledged = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("VNC Bridge acknowledgement timed out")), 5000);
      connection.on("data", value => {
        if (value && typeof value === "object" && (value as { type?: string }).type === "rdc.ack" && (value as { topicId?: string }).topicId === topicId) {
          clearTimeout(timeout);
          resolve();
        }
      });
      connection.once("error", reject);
      connection.once("close", () => reject(new Error("VNC Bridge connection closed before acknowledgement")));
    });
    connection.send(message);
    await acknowledged;
    connection.close();
  } finally {
    peer.destroy();
  }
}
