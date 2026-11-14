﻿import { Hono, type MiddlewareHandler } from "hono";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { homedir } from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

const v1ResponsesReq = z.object({
  model: z.string().min(1).optional(),
  input: z.union([
    z.string(),
    z.array(z.union([
      z.object({
        type: z.literal("message").optional(),
        role: z.enum(["user", "assistant", "system", "developer"]),
        content: z.union([
          z.string(),
          z.array(z.union([
            z.object({
              type: z.literal("input_text"),
              text: z.string(),
            }).catchall(z.unknown()),
            z.object({
              type: z.literal("input_image"),
              image_url: z.string().url().optional(),
              file_id: z.string().min(1).optional(),
              detail: z.enum(["auto", "low", "high"]).optional(),
            }).catchall(z.unknown()),
            z.object({
              type: z.literal("input_file"),
              file_id: z.string().min(1).optional(),
              file_url: z.string().url().optional(),
              filename: z.string().min(1).optional(),
              file_data: z.string().min(1).optional(),
            }).catchall(z.unknown()),
          ])),
        ]),
        phase: z.enum(["commentary", "final_answer"]).nullable().optional(),
        status: z.enum(["in_progress", "completed", "incomplete"]).nullable().optional(),
      }).catchall(z.unknown()),
      z.object({
        type: z.literal("function_call"),
        call_id: z.string().min(1),
        name: z.string().min(1),
        arguments: z.string(),
        id: z.string().min(1).optional(),
        status: z.enum(["in_progress", "completed", "incomplete"]).optional(),
      }).catchall(z.unknown()),
      z.object({
        type: z.literal("function_call_output"),
        call_id: z.string().min(1),
        output: z.union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())]),
        id: z.string().min(1).optional(),
        status: z.enum(["in_progress", "completed", "incomplete"]).optional(),
      }).catchall(z.unknown()),
      z.object({
        type: z.literal("reasoning"),
        id: z.string().min(1).optional(),
        summary: z.array(z.object({
          type: z.literal("summary_text"),
          text: z.string(),
        }).catchall(z.unknown())).optional(),
        encrypted_content: z.string().nullable().optional(),
      }).catchall(z.unknown()),
      z.object({
        type: z.string().min(1),
      }).catchall(z.unknown()),
    ])),
  ]).optional(),
  conversation: z.union([
    z.string().min(1),
    z.object({ id: z.string().min(1) }).catchall(z.unknown()),
  ]).nullable().optional(),
  previous_response_id: z.string().min(1).nullable().optional(),
  instructions: z.string().nullable().optional(),
  prompt: z.object({
    id: z.string().min(1),
    variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable().optional(),
    version: z.string().nullable().optional(),
  }).catchall(z.unknown()).nullable().optional(),
  max_output_tokens: z.number().int().positive().nullable().optional(),
  max_tool_calls: z.number().int().positive().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  top_p: z.number().min(0).max(1).nullable().optional(),
  top_logprobs: z.number().int().min(0).max(20).nullable().optional(),
  store: z.boolean().nullable().optional(),
  background: z.boolean().nullable().optional(),
  parallel_tool_calls: z.boolean().nullable().optional(),
  metadata: z.record(z.string().max(64), z.string().max(512)).refine(value => Object.keys(value).length <= 16, "metadata supports at most 16 entries").nullable().optional(),
  tools: z.array(z.object({
    type: z.string().min(1),
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    strict: z.boolean().nullable().optional(),
  }).catchall(z.unknown())).optional(),
  tool_choice: z.union([
    z.enum(["none", "auto", "required"]),
    z.object({
      type: z.string().min(1),
    }).catchall(z.unknown()),
  ]).nullable().optional(),
  reasoning: z.object({
    effort: z.enum(["none", "minimal", "low", "medium", "high", "xhigh"]).nullable().optional(),
    summary: z.enum(["auto", "concise", "detailed"]).nullable().optional(),
  }).catchall(z.unknown()).nullable().optional(),
  text: z.object({
    format: z.union([
      z.object({ type: z.literal("text") }).catchall(z.unknown()),
      z.object({ type: z.literal("json_object") }).catchall(z.unknown()),
      z.object({
        type: z.literal("json_schema"),
        name: z.string().min(1),
        schema: z.record(z.string(), z.unknown()),
        description: z.string().optional(),
        strict: z.boolean().optional(),
      }).catchall(z.unknown()),
    ]).optional(),
    verbosity: z.enum(["low", "medium", "high"]).optional(),
  }).catchall(z.unknown()).optional(),
  include: z.array(z.string().min(1)).nullable().optional(),
  stream: z.boolean().nullable().optional(),
  stream_options: z.object({
    include_obfuscation: z.boolean().optional(),
  }).catchall(z.unknown()).nullable().optional(),
  service_tier: z.string().min(1).nullable().optional(),
  truncation: z.enum(["auto", "disabled"]).nullable().optional(),
  user: z.string().min(1).optional(),
  safety_identifier: z.string().min(1).nullable().optional(),
  prompt_cache_key: z.string().min(1).nullable().optional(),
  prompt_cache_retention: z.enum(["in_memory", "24h"]).nullable().optional(),
  prompt_cache_options: z.object({
    comparison_response_id: z.string().min(1).nullable().optional(),
    mode: z.enum(["implicit", "explicit"]).optional(),
    prewarm: z.boolean().optional(),
    ttl: z.enum(["30m", "12h"]).optional(),
  }).catchall(z.unknown()).optional(),
  image: z.object({
    context_compression: z.enum(["auto", "enabled", "disabled"]).optional(),
  }).catchall(z.unknown()).optional(),
  moderation: z.object({
    model: z.string().min(1),
    policy: z.object({
      input: z.object({ mode: z.enum(["score", "block"]) }).catchall(z.unknown()).nullable().optional(),
      output: z.object({ mode: z.enum(["score", "block"]) }).catchall(z.unknown()).nullable().optional(),
    }).catchall(z.unknown()).nullable().optional(),
  }).catchall(z.unknown()).nullable().optional(),
  context_management: z.array(z.object({
    type: z.literal("compaction"),
    compact_threshold: z.number().int().min(1000).nullable().optional(),
  }).catchall(z.unknown())).min(1).nullable().optional(),
}).catchall(z.unknown()).refine(
  value => !(value.conversation != null && value.previous_response_id != null),
  { message: "conversation and previous_response_id cannot be used together" },
);

const v1ResponsesRes = z.object({
  id: z.string().min(1),
  object: z.literal("response").optional(),
  created_at: z.number().int().nonnegative().optional(),
  model: z.string().min(1).optional(),
  status: z.enum(["completed", "failed", "in_progress", "incomplete"]).optional(),
  output: z.array(z.union([
    z.object({
      type: z.literal("message"),
      id: z.string().min(1).optional(),
      role: z.enum(["assistant", "user"]).optional(),
      status: z.enum(["in_progress", "completed", "incomplete"]).optional(),
      content: z.array(z.union([
        z.object({
          type: z.literal("output_text"),
          text: z.string(),
          annotations: z.array(z.record(z.string(), z.unknown())).optional(),
          logprobs: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
        }).catchall(z.unknown()),
        z.object({
          type: z.literal("refusal"),
          refusal: z.string(),
        }).catchall(z.unknown()),
      ])),
    }).catchall(z.unknown()),
    z.object({
      type: z.literal("reasoning"),
      id: z.string().min(1).optional(),
      status: z.enum(["in_progress", "completed", "incomplete"]).optional(),
      summary: z.array(z.object({
        type: z.literal("summary_text"),
        text: z.string(),
      }).catchall(z.unknown())).optional(),
      encrypted_content: z.string().nullable().optional(),
    }).catchall(z.unknown()),
    z.object({
      type: z.literal("function_call"),
      id: z.string().min(1).optional(),
      call_id: z.string().min(1),
      name: z.string().min(1),
      arguments: z.string(),
      status: z.enum(["in_progress", "completed", "incomplete"]).optional(),
    }).catchall(z.unknown()),
    z.object({
      type: z.string().min(1),
    }).catchall(z.unknown()),
  ])).optional(),
  output_text: z.string().optional(),
  error: z.object({
    code: z.string().min(1).optional(),
    message: z.string().optional(),
  }).nullable().optional(),
  incomplete_details: z.object({
    reason: z.string().min(1),
  }).catchall(z.unknown()).nullable().optional(),
  usage: z.object({
    input_tokens: z.number().int().nonnegative().optional(),
    output_tokens: z.number().int().nonnegative().optional(),
    total_tokens: z.number().int().nonnegative().optional(),
    input_tokens_details: z.record(z.string(), z.unknown()).optional(),
    output_tokens_details: z.record(z.string(), z.unknown()).optional(),
  }).catchall(z.unknown()).nullable().optional(),
  previous_response_id: z.string().min(1).nullable().optional(),
  conversation: z.union([
    z.string().min(1),
    z.object({ id: z.string().min(1) }).catchall(z.unknown()),
  ]).nullable().optional(),
  instructions: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.string()).nullable().optional(),
  parallel_tool_calls: z.boolean().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  top_p: z.number().min(0).max(1).nullable().optional(),
  truncation: z.enum(["auto", "disabled"]).nullable().optional(),
}).catchall(z.unknown());

let codexHealthReady: Promise<string> | undefined;

export const codexHealth: MiddlewareHandler = async (c, next) => {
  codexHealthReady ??= (async () => {
    const codexHome = join(homedir(), ".codex");
    const authPath = join(codexHome, "auth.json");
    const configPath = join(codexHome, "config.toml");
    await mkdir(codexHome, { recursive: true });

    let apiKey: string | undefined;
    try {
      const auth = JSON.parse(await readFile(authPath, "utf8")) as { OPENAI_API_KEY?: unknown };
      if (typeof auth.OPENAI_API_KEY === "string" && auth.OPENAI_API_KEY.length > 0) {
        apiKey = auth.OPENAI_API_KEY;
      }
    } catch {
      apiKey = undefined;
    }

    if (!apiKey) {
      apiKey = randomBytes(32).toString("hex");
      await writeFile(authPath, JSON.stringify({
        OPENAI_API_KEY: apiKey,
        tokens: null,
        last_refresh: null,
      }, null, 2), { encoding: "utf8", mode: 0o600 });
    }

    const baseUrl = new URL("/v1", c.req.url).toString().replace(/\/$/, "");
    let config = "";
    try {
      config = (await readFile(configPath, "utf8")).replace(/^\uFEFF/, "");
    } catch {
      config = "";
    }
    config = config
      .replace(/^model_provider\s*=.*\r?\n/gm, "")
      .replace(/^cli_auth_credentials_store\s*=.*\r?\n/gm, "")
      .replace(/\[model_providers\.codexlocal\][\s\S]*?(?=\r?\n\[|$)/g, "")
      .trim();
    await writeFile(configPath, [
      'model_provider = "codexlocal"',
      'cli_auth_credentials_store = "file"',
      "",
      config,
      config ? "" : undefined,
      "[model_providers.codexlocal]",
      'name = "codexlocal"',
      "base_url = " + JSON.stringify(baseUrl),
      'wire_api = "responses"',
      "requires_openai_auth = true",
      "supports_websockets = false",
      "",
    ].filter((line): line is string => line !== undefined).join("\n"), "utf8");

    return apiKey;
  })();

  let apiKey: string;
  try {
    apiKey = await codexHealthReady;
  } catch (error) {
    codexHealthReady = undefined;
    return c.json({
      error: {
        type: "server_error",
        message: error instanceof Error ? error.message : String(error),
        param: null,
        code: "server_error",
      },
    }, 503);
  }

  const candidate = c.req.header("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!candidate) {
    return c.json({
      error: {
        type: "authentication_error",
        message: "Missing Bearer token",
        param: null,
        code: "missing_api_key",
      },
    }, 401);
  }
  const expected = Buffer.from(apiKey);
  const actual = Buffer.from(candidate);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return c.json({
      error: {
        type: "authentication_error",
        message: "Invalid API key",
        param: null,
        code: "invalid_api_key",
      },
    }, 401);
  }

  await next();
};
const invokeHealthCache = new WeakMap<object, Promise<void>>();

export default new Hono<{
  Variables: {
    invoke:
      | {
          type: "v1";
          health: () => Promise<void | boolean>;
          invoke: (request: z.input<typeof v1ResponsesReq>) => Promise<z.output<typeof v1ResponsesRes> | AsyncIterable<unknown>>;
        }
      | {
          type: "string";
          health: () => Promise<void | boolean>;
          invoke: (input: string) => Promise<string | AsyncIterable<string>>;
        };
  };
}>().post(
  "/v1/responses",
  zValidator("json", v1ResponsesReq, (result, c) => {
    if (!result.success) {
      return c.json({
        error: {
          type: "invalid_request_error",
          message: result.error.message,
          param: null,
          code: "invalid_request",
        },
      }, 400);
    }
  }),
  async c => {
  const request = c.req.valid("json");
  const invoke = c.get("invoke");
  let health = invokeHealthCache.get(invoke);
  if (!health) {
    health = Promise.resolve(invoke.health()).then(result => {
      if (result === false) throw new Error("invokeProxy health check failed");
    });
    invokeHealthCache.set(invoke, health);
  }
  try {
    await health;
  } catch (error) {
    invokeHealthCache.delete(invoke);
    return c.json({
      error: {
        type: "server_error",
        message: error instanceof Error ? error.message : String(error),
        param: null,
        code: "server_error",
      },
    }, 503);
  }

  if (request.stream === true) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const output = invoke.type === "v1"
            ? await invoke.invoke(request)
            : await invoke.invoke([
              request.instructions,
              typeof request.input === "string"
                ? request.input
                : request.input?.map(item => JSON.stringify(item)).join("\n") ?? "",
            ].filter(Boolean).join("\n\n"));

          if (typeof output === "string") {
            controller.enqueue(encoder.encode(
              "event: response.output_text.delta\ndata: " +
              JSON.stringify({ type: "response.output_text.delta", delta: output }) +
              "\n\n",
            ));
          } else if (output && typeof output === "object" && Symbol.asyncIterator in output) {
            for await (const event of output as AsyncIterable<unknown>) {
              controller.enqueue(encoder.encode(
                "event: " + (typeof event === "object" && event && "type" in event
                  ? String(event.type)
                  : "response.output_text.delta") +
                "\ndata: " + JSON.stringify(event) + "\n\n",
              ));
            }
          } else {
            controller.enqueue(encoder.encode(
              "event: response.completed\ndata: " +
              JSON.stringify({ type: "response.completed", response: output }) +
              "\n\n",
            ));
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
        } catch (error) {
          controller.enqueue(encoder.encode(
            "event: error\ndata: " +
            JSON.stringify({
              type: "error",
              error: { message: error instanceof Error ? error.message : String(error) },
            }) +
            "\n\n",
          ));
          controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }

  try {
    if (invoke.type === "v1") {
      const output = await invoke.invoke(request);
      if (typeof output === "string" || (output && typeof output === "object" && Symbol.asyncIterator in output)) {
        return c.json({
          error: {
            type: "server_error",
            message: "The v1 invoke returned a stream for a non-streaming request.",
            param: null,
            code: "invalid_upstream_response",
          },
        }, 502);
      }
      const response = v1ResponsesRes.safeParse(output);
      if (!response.success) {
        return c.json({
          error: {
            type: "server_error",
            message: response.error.message,
            param: null,
            code: "invalid_upstream_response",
          },
        }, 502);
      }
      return c.json(response.data as never);
    }

    const input = typeof request.input === "string"
      ? request.input
      : request.input?.map(item => JSON.stringify(item)).join("\n") ?? "";
    const output = await invoke.invoke([request.instructions, input].filter(Boolean).join("\n\n"));
    if (typeof output !== "string") {
      return c.json({
        error: {
          type: "server_error",
          message: "The string invoke returned a stream for a non-streaming request.",
          param: null,
          code: "invalid_upstream_response",
        },
      }, 502);
    }
    const response = v1ResponsesRes.parse({
      id: "resp_" + globalThis.crypto.randomUUID(),
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      model: request.model ?? "string-model",
      status: "completed",
      output: [{
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{
          type: "output_text",
          text: output,
          annotations: [],
        }],
      }],
      output_text: output,
    });
    return c.json(response as never);
  } catch (error) {
    return c.json({
      error: {
        type: "server_error",
        message: error instanceof Error ? error.message : String(error),
        param: null,
        code: "server_error",
      },
    }, 502);
  }
  },
);