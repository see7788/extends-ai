import { Hono } from "hono";
import routers from "./routers.ts";

const app = new Hono().route("/", routers);

export default app;
