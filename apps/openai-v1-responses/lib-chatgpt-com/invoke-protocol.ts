import axios from 'axios';
import Base_code,{type context_t as context_core } from 'invoke-protocol';

export interface context_t extends context_core {
    readonly window: Window;
    readonly chatgpt_com_state: {
        topics: Map<string, {
            readonly conversation_id?: string;
            readonly current_node?: string;
            readonly [key: string]: unknown;
        }>;
        models?: readonly {
            readonly id?: string;
            readonly slug?: string;
            readonly thinking_effort?: string | null;
            readonly [key: string]: unknown;
        }[];
        model?: string;
        reasoningLevel?: string;
        [key: string]: unknown;
    }; // ChatGPT 页面状态，挂载方可以继续扩展并注册方法直接使用。
}

export default new Base_code<context_t>()
    .register(({ route, routes, zod, zodUndefined }) => {
        const http = axios.create({ baseURL: '/backend-api', withCredentials: true });
        return routes({
            // 清空 ChatGPT 协议的本地状态缓存；下次查询会按官方返回值重新填充。
            'chatgpt_com.clear': route(zodUndefined, async ({ chatgpt_com_state }) => {
                chatgpt_com_state.topics.clear();
                for (const key of Object.keys(chatgpt_com_state)) if (key !== 'topics') delete chatgpt_com_state[key];
            }),

            // 查询当前账号的话题列表。
            'conversation.list': route(
                zod.object({
                    limit: zod.number().int().positive().max(100).optional(),
                    offset: zod.number().int().nonnegative().optional(),
                    archived: zod.boolean().optional(),
                    order: zod.enum(['updated', 'created']).optional(),
                }).optional(),
                async ({ input, chatgpt_com_state }) => {
                    const query = new URLSearchParams({
                        limit: String(input?.limit ?? 20),
                        offset: String(input?.offset ?? 0),
                        order: input?.order ?? 'updated',
                        is_archived: String(input?.archived ?? false),
                    });
                    const output = (await http.get<readonly {
                        readonly id?: string;
                        readonly conversation_id?: string;
                        readonly title?: string;
                    }[] | Record<string, unknown>>(`/conversations?${query}`)).data;
                    if (Array.isArray(output)) for (const topic of output) {
                        const chatId = typeof topic.conversation_id === 'string' ? topic.conversation_id : topic.id;
                        if (chatId) chatgpt_com_state.topics.set(chatId, {
                            ...chatgpt_com_state.topics.get(chatId),
                            ...topic,
                            conversation_id: chatId,
                            current_node: chatgpt_com_state.topics.get(chatId)?.current_node,
                        });
                    }
                    return output;
                },
            ),

            // 按关键词搜索话题。
            'conversation.search': route(
                zod.object({ query: zod.string().min(1), cursor: zod.string().optional() }),
                async ({ input, chatgpt_com_state }) => {
                    const query = new URLSearchParams({ query: input.query });
                    if (input.cursor) query.set('cursor', input.cursor);
                    const output = (await http.get<readonly {
                        readonly id?: string;
                        readonly conversation_id?: string;
                        readonly title?: string;
                    }[] | Record<string, unknown>>(`/conversations/search?${query}`)).data;
                    if (Array.isArray(output)) for (const topic of output) {
                        const chatId = typeof topic.conversation_id === 'string' ? topic.conversation_id : topic.id;
                        if (chatId) chatgpt_com_state.topics.set(chatId, {
                            ...chatgpt_com_state.topics.get(chatId),
                            ...topic,
                            conversation_id: chatId,
                            current_node: chatgpt_com_state.topics.get(chatId)?.current_node,
                        });
                    }
                    return output;
                },
            ),

            // 按官方话题 ID 批量读取话题摘要。
            'conversation.batch': route(
                zod.object({
                    conversationIds: zod.array(zod.string().uuid()).min(1),
                    includeFullHistory: zod.boolean().optional(),
                }),
                async ({ input, chatgpt_com_state }) => {
                    const output = (await http.post<readonly {
                        readonly id?: string;
                        readonly conversation_id?: string;
                        readonly title?: string;
                        readonly current_node?: string;
                    }[]>('/conversations/batch', {
                        conversation_ids: input.conversationIds,
                        include_full_history: input.includeFullHistory ?? false,
                    })).data;
                    for (const topic of output) {
                        const chatId = typeof topic.conversation_id === 'string' ? topic.conversation_id : topic.id;
                        if (chatId) chatgpt_com_state.topics.set(chatId, {
                            ...chatgpt_com_state.topics.get(chatId),
                            ...topic,
                            conversation_id: chatId,
                            current_node: topic.current_node ?? chatgpt_com_state.topics.get(chatId)?.current_node,
                        });
                    }
                    return output;
                },
            ),

            // 读取单个话题及其消息树。
            'conversation.get': route(
                zod.object({ chatId: zod.string().uuid() }),
                async ({ input, chatgpt_com_state }) => {
                    const output = (await http.get<{
                        readonly id?: string;
                        readonly conversation_id?: string;
                        readonly current_node?: string;
                        readonly mapping?: Readonly<Record<string, unknown>>;
                        readonly [key: string]: unknown;
                    }>(`/conversation/${encodeURIComponent(input.chatId)}?include_model_switcher_metadata=false`)).data;
                    chatgpt_com_state.topics.set(input.chatId, {
                        ...chatgpt_com_state.topics.get(input.chatId),
                        conversation_id: typeof output.conversation_id === 'string' ? output.conversation_id : input.chatId,
                        current_node: typeof output.current_node === 'string' ? output.current_node : chatgpt_com_state.topics.get(input.chatId)?.current_node,
                        ...(typeof output.title === 'string' ? { title: output.title } : {}),
                        ...(typeof output.is_archived === 'boolean' ? { is_archived: output.is_archived } : {}),
                        ...(typeof output.is_starred === 'boolean' ? { is_starred: output.is_starred } : {}),
                    });
                    return output;
                },
            ),

            // 修改话题标题。
            'conversation.rename': route(
                zod.object({ chatId: zod.string().uuid(), title: zod.string().min(1) }),
                async ({ input, chatgpt_com_state }) => {
                    const output = (await http.post<Record<string, unknown>>(
                        `/conversation/id/${encodeURIComponent(input.chatId)}/rename`,
                        { title: input.title },
                    )).data;
                    chatgpt_com_state.topics.set(input.chatId, {
                        ...chatgpt_com_state.topics.get(input.chatId),
                        conversation_id: input.chatId,
                        current_node: chatgpt_com_state.topics.get(input.chatId)?.current_node,
                        title: input.title,
                    });
                    return output;
                },
            ),

            // 归档、置顶或切换话题当前节点。
            'conversation.update': route(
                zod.object({
                    chatId: zod.string().uuid(),
                    archived: zod.boolean().optional(),
                    starred: zod.boolean().optional(),
                    currentNodeId: zod.string().uuid().optional(),
                }).refine(input => input.archived !== undefined || input.starred !== undefined || input.currentNodeId !== undefined, {
                    message: '至少提供 archived、starred 或 currentNodeId 之一',
                }),
                async ({ input, chatgpt_com_state }) => {
                    const output = (await http.patch<Record<string, unknown>>(
                        `/conversation/${encodeURIComponent(input.chatId)}`,
                        {
                            ...(input.archived === undefined ? {} : { is_archived: input.archived }),
                            ...(input.starred === undefined ? {} : { is_starred: input.starred }),
                            ...(input.currentNodeId === undefined ? {} : { current_node_id: input.currentNodeId }),
                        },
                    )).data;
                    chatgpt_com_state.topics.set(input.chatId, {
                        ...chatgpt_com_state.topics.get(input.chatId),
                        conversation_id: input.chatId,
                        current_node: chatgpt_com_state.topics.get(input.chatId)?.current_node,
                        ...(input.archived === undefined ? {} : { is_archived: input.archived }),
                        ...(input.starred === undefined ? {} : { is_starred: input.starred }),
                        ...(input.currentNodeId === undefined ? {} : { current_node: input.currentNodeId }),
                    });
                    return output;
                },
            ),

            // 删除话题。
            'conversation.delete': route(
                zod.object({ chatId: zod.string().uuid() }),
                async ({ input, chatgpt_com_state }) => {
                    const output = (await http.delete<Record<string, unknown>>(
                        `/conversation/id/${encodeURIComponent(input.chatId)}`,
                    )).data;
                    chatgpt_com_state.topics.delete(input.chatId);
                    return output;
                },
            ),

            // 读取官方模型目录和每个模型支持的推理档位。
            'model.list': route(zodUndefined, async ({ chatgpt_com_state }) => {
                if (chatgpt_com_state.models !== undefined) return { models: chatgpt_com_state.models };
                const output = (await http.get<{
                    readonly models?: readonly {
                        readonly id?: string;
                        readonly slug?: string;
                        readonly thinking_effort?: string | null;
                        readonly [key: string]: unknown;
                    }[];
                    readonly [key: string]: unknown;
                }>('/models?iim=false&include_icons=false&is_gizmo=false&merged=false')).data;
                chatgpt_com_state.models = (output.models ?? []).map(model => ({
                    ...model,
                    thinking_effort: model.thinking_effort ?? null,
                }));
                return output;
            }),

            // 保存当前模型和推理档位。
            'model.select': route(
                zod.object({ modelId: zod.string().min(1), reasoningLevel: zod.string().min(1).optional() }),
                async ({ input, chatgpt_com_state }) => {
                    const query = new URLSearchParams({ model_slug: input.modelId });
                    if (input.reasoningLevel) query.set('thinking_effort', input.reasoningLevel);
                    const output = (await http.patch<Record<string, unknown>>(
                        `/settings/user_last_used_model_config?${query}`,
                    )).data;
                    chatgpt_com_state.model = input.modelId;
                    chatgpt_com_state.reasoningLevel = input.reasoningLevel;
                    return output;
                },
            ),

            // 提交消息并读取 ChatGPT 的 SSE 返回流。
            'conversation.send': route(
                zod.object({
                    chatId: zod.string().uuid().optional(),
                    input: zod.union([
                        zod.string(),
                        zod.array(zod.record(zod.string(), zod.unknown())).min(1),
                    ]),
                    modelId: zod.string().min(1).optional(),
                    reasoningLevelId: zod.string().min(1).optional(),
                    tools: zod.array(zod.object({
                        name: zod.string().min(1),
                        description: zod.string().optional(),
                        parameters: zod.record(zod.string(), zod.unknown()).optional(),
                    })).optional(),
                }),
                async ({ input, chatgpt_com_state, window }) => {
                    const conversation = input.chatId === undefined ? null : chatgpt_com_state.topics.get(input.chatId) ?? null;
                    if (input.chatId !== undefined && (conversation === null || conversation.conversation_id !== input.chatId && conversation.id !== input.chatId)) {
                        throw new Error(`ChatGPT 话题上下文缺失: ${input.chatId}`);
                    }
                    const models = input.modelId === undefined && chatgpt_com_state.model === undefined && chatgpt_com_state.models === undefined
                        ? (await http.get<{
                            readonly models?: readonly {
                                readonly id?: string;
                                readonly slug?: string;
                            }[];
                        }>('/models?iim=false&include_icons=false&is_gizmo=false&merged=false')).data
                        : null;
                    if (chatgpt_com_state.models === undefined && models?.models !== undefined) chatgpt_com_state.models = models.models;
                    const model = input.modelId
                        ?? chatgpt_com_state.model
                        ?? chatgpt_com_state.models?.find(candidate => candidate.slug !== undefined)?.slug
                        ?? chatgpt_com_state.models?.find(candidate => candidate.id !== undefined)?.id
                        ?? models?.models?.find(candidate => candidate.slug !== undefined)?.slug
                        ?? models?.models?.find(candidate => candidate.id !== undefined)?.id;
                    if (!model) throw new Error('ChatGPT 模型目录没有可用模型');
                    const messageId = window.crypto.randomUUID();
                    const parts = typeof input.input === 'string'
                        ? [input.input]
                        : input.input.map(part => typeof part.text === 'string' ? part.text : JSON.stringify(part));
                    const response = await window.fetch('/backend-api/f/conversation', {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            accept: 'text/event-stream',
                            'content-type': 'application/json',
                            'x-oai-mcp-form-version': '2',
                        },
                        body: JSON.stringify({
                            action: 'next',
                            conversation_id: input.chatId,
                            parent_message_id: conversation?.current_node ?? window.crypto.randomUUID(),
                            model,
                            thinking_effort: input.reasoningLevelId ?? chatgpt_com_state.reasoningLevel,
                            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                            timezone_offset_min: new Date().getTimezoneOffset(),
                            conversation_origin: 'chat',
                            client_contextual_info: { app_name: 'chatgpt.com', app_surface: 'codex_browser' },
                            local_function_names: input.tools?.map(tool => tool.name),
                            local_function_signatures: input.tools === undefined ? undefined : Object.fromEntries(input.tools.map(tool => [tool.name, {
                                name: tool.name,
                                description: tool.description ?? '',
                                parameters: tool.parameters ?? { type: 'object', properties: {} },
                            }])),
                            messages: [{
                                id: messageId,
                                author: { role: 'user' },
                                content: { content_type: 'text', parts },
                                metadata: {},
                            }],
                        }),
                    });
                    if (!response.ok) throw new Error(`ChatGPT 对话请求失败 ${response.status}: ${await response.text()}`);
                    if (!response.body) throw new Error('ChatGPT 没有返回流式响应体');
                    const requestId = response.headers.get('x-oai-request-id') ?? window.crypto.randomUUID();
                    const reader = response.body.getReader();
                    const decoder = new TextDecoder();
                    let buffer = '';
                    let chatId = input.chatId;
                    let message: unknown;
                    const events: Array<Record<string, unknown> & { readonly event?: string; readonly data?: unknown }> = [];
                    let completed = false;
                    while (!completed) {
                        const chunk = await reader.read();
                        buffer += decoder.decode(chunk.value ?? new Uint8Array(), { stream: !chunk.done });
                        const blocks = buffer.split(/\r?\n\r?\n/);
                        buffer = blocks.pop() ?? '';
                        for (const block of blocks) {
                            const eventName = block.split(/\r?\n/).find(line => line.startsWith('event:'))?.slice(6).trim();
                            const data = block.split(/\r?\n/).find(line => line.startsWith('data:'))?.slice(5).trim();
                            if (!data || data === '[DONE]') continue;
                            if (eventName === 'delta_encoding') {
                                events.push({ event: eventName, data });
                                continue;
                            }
                            let event: Record<string, unknown>;
                            try {
                                event = JSON.parse(data) as Record<string, unknown>;
                            } catch {
                                events.push({ event: eventName, data });
                                continue;
                            }
                            if (eventName) events.push({ event: eventName, data: event });
                            else events.push(event);
                            if (typeof event.conversation_id === 'string') chatId = event.conversation_id;
                            if (event.message !== undefined) message = event.message;
                            if (event.type === 'message_stream_complete') completed = true;
                        }
                        if (chunk.done) break;
                    }
                    chatgpt_com_state.model = model;
                    if (input.reasoningLevelId !== undefined) chatgpt_com_state.reasoningLevel = input.reasoningLevelId;
                    return { requestId, chatId, message, events } satisfies {
                        readonly requestId: string;
                        readonly chatId?: string;
                        readonly message?: unknown;
                        readonly events: readonly (Record<string, unknown> & { readonly event?: string; readonly data?: unknown })[];
                    };
                },
            ),

            // 停止指定话题正在进行的回复。
            'conversation.stop': route(
                zod.object({ chatId: zod.string().uuid() }),
                async ({ input }) => (await http.post<Record<string, unknown>>(
                    '/stop_conversation',
                    { conversation_id: input.chatId, exclude_async_types: [] },
                )).data,
            ),
        });
    });
