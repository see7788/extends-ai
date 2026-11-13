﻿import { Hono } from "hono";
import defaultRouter from "./default";
import v1Responses from "./v1-responses";

export default new Hono()
  .route("/", defaultRouter)
  .route("/v1", v1Responses);
