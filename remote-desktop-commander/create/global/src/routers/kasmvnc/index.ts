import { Hono } from "hono";
import path from "node:path";
import * as fun from "./fun";
import { action_zod, create_zod } from "./zod";

export default new Hono()
  .basePath(path.basename(import.meta.dirname))
  .get("/", c => c.json(fun.list()))
  .get("/:id", c => {
    const parsed = action_zod.safeParse({ id: c.req.param("id") });
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    const item = fun.get(parsed.data);
    return item ? c.json(item) : c.json({ error: "not found" }, 404);
  })
  .post("/", async c => {
    const parsed = create_zod.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    return c.json(fun.create(), 201);
  })
  .post("/:id/start", async c => {
    const parsed = action_zod.safeParse({ id: c.req.param("id") });
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    try { return c.json(await fun.start(parsed.data)); }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 500); }
  })
  .post("/:id/stop", async c => {
    const parsed = action_zod.safeParse({ id: c.req.param("id") });
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    try { return c.json(await fun.stop(parsed.data)); }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 500); }
  })
  .delete("/:id", async c => {
    const parsed = action_zod.safeParse({ id: c.req.param("id") });
    if (!parsed.success) return c.json({ error: parsed.error.flatten() }, 400);
    try { await fun.remove(parsed.data); return c.json({ ok: true }); }
    catch (error) { return c.json({ error: error instanceof Error ? error.message : String(error) }, 500); }
  });