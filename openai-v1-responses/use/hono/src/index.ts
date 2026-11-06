import app from "./app.ts";
import hono from "./declare/hono.ts";
import peer from "./default/peer.ts";

const server = hono.honoServer(app);
server.on("close", () => peer.close());

export default server;
