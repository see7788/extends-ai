import { z } from "zod";

// 只定义 zod 验证器，采用 *_zod 命名。
// 雷同验证器优先复用 zod 提供的验证器体操。
// 严禁 export type z.infer。
export const id_zod = z.string().regex(/^[a-f0-9]{32}$/);

export const action_zod = z.object({
  id: id_zod,
}).strict();

export const create_zod = z.object({}).strict();
