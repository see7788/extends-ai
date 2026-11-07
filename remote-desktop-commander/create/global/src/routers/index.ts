import kasmvnc from "./kasmvnc";
import { Hono } from "hono";

// 此文件只负责原样组合。
export default new Hono()
  .route("/", kasmvnc);