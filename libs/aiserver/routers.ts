import { Hono } from "hono";
import codexcli from "./codexcli.ts";

const routers = new Hono().route("/", codexcli);

export default routers;
