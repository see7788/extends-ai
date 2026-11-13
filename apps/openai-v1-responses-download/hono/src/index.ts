﻿import app from "./app.js";
import hono from "./declare/hono.js";
import peer from "./default/peer.js";

const server = hono.honoServer(app);
server.on("close", () => peer.close());

export default server;
