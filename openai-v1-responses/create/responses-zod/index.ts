import { z } from "zod";
import type OpenAI from "openai";

const responseRequest = z.object({
  model: z.string().min(1).optional(),
  input: z.union([z.string(), z.array(z.any())]).optional(),
  conversation: z.union([
    z.string(),
    z.object({ id: z.string().min(1) }).passthrough(),
  ]).nullable().optional(),
  previous_response_id: z.string().min(1).nullable().optional(),
  instructions: z.string().nullable().optional(),
  prompt: z.object({
    id: z.string().min(1),
    variables: z.record(z.string(), z.any()).nullable().optional(),
    version: z.string().nullable().optional(),
  }).passthrough().nullable().optional(),
  max_output_tokens: z.number().int().positive().nullable().optional(),
  max_tool_calls: z.number().int().positive().nullable().optional(),
  temperature: z.number().min(0).max(2).nullable().optional(),
  top_p: z.number().min(0).max(1).nullable().optional(),
  store: z.boolean().nullable().optional(),
  parallel_tool_calls: z.boolean().nullable().optional(),
  metadata: z.record(z.string(), z.string()).nullable().optional(),
  tools: z.array(z.any()).optional(),
  tool_choice: z.any().optional(),
  reasoning: z.any().optional(),
  text: z.any().optional(),
  include: z.array(z.any()).nullable().optional(),
}).passthrough();

export const responsesRequestSchema: z.ZodType<OpenAI.Responses.ResponseCreateParams> = z.union([
  responseRequest.extend({ stream: z.literal(true) }),
  responseRequest.extend({ stream: z.literal(false).nullable().optional() }),
]).refine(
  value => !(value.conversation != null && value.previous_response_id != null),
  { message: "conversation and previous_response_id cannot be used together" },
);

