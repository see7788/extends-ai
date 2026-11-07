

export type MessageConnection = { send(data: unknown): void };
const chunkSize = 16 * 1024;
const maxMessageSize = 10 * 1024 * 1024;
type ChunkMessage = { __rdcChunk: true; id: string; index: number; total: number; data: string };

export async function messageSend(connection: MessageConnection, message: unknown): Promise<void> {
  const json = JSON.stringify(message);
  if (json === undefined) throw new TypeError("PeerJS message must be JSON serializable");
  if (json.length > maxMessageSize) throw new RangeError("PeerJS message exceeds 10 MB");
  if (json.length <= chunkSize) { connection.send(message); return; }
  const id = globalThis.crypto.randomUUID();
  const total = Math.ceil(json.length / chunkSize);
  for (let index = 0; index < total; index++) {
    connection.send({ __rdcChunk: true, id, index, total, data: json.slice(index * chunkSize, (index + 1) * chunkSize) } satisfies ChunkMessage);
  }
}

export function messageReceive(value: unknown, pending: Map<string, string[]>): unknown | undefined {
  if (!value || typeof value !== "object" || !("__rdcChunk" in value)) return value;
  const chunk = value as Partial<ChunkMessage>;
  const id = chunk.id;
  const index = chunk.index;
  const total = chunk.total;
  const data = chunk.data;
  if (chunk.__rdcChunk !== true || typeof id !== "string" || !id || !Number.isInteger(index) || !Number.isInteger(total) || index === undefined || total === undefined || index < 0 || total < 1 || total > Math.ceil(maxMessageSize / chunkSize) || index >= total || typeof data !== "string") throw new TypeError("Invalid PeerJS message chunk");
  let parts = pending.get(id);
  if (!parts) { parts = new Array<string>(total); pending.set(id, parts); }
  if (parts.length !== total) { pending.delete(id); throw new Error("PeerJS message chunk count mismatch"); }
  parts[index] = data;
  if (parts.some(part => part === undefined)) return undefined;
  pending.delete(id);
  const json = parts.join("");
  if (json.length > maxMessageSize) throw new RangeError("PeerJS message exceeds 10 MB");
  return JSON.parse(json) as unknown;
}