import Base_core from 'invoke-protocol';
import chatgptProtocol, { type context_t as chatgpt_context } from 'lib-chatgpt-com';

class Base extends Base_core<chatgpt_context & {
    readonly responses_context: {
        chatId?: string;
    };
}> { }

const endpoint = new Base().registerMergeThis(chatgptProtocol);

export default endpoint.register(({ route, zod }) => ({
    // 处理一个完整的 Responses WebSocket 事件；口令、错误、对话和取消都属于同一个业务接口。
    'responses.message': route(
        zod.object({
            request: zod.record(zod.string(), zod.unknown()),
        }),
        async ({ input, chatgpt_com_state, responses_context, window }) => {
            const request = input.request;
            const invoke = chatgptProtocol.invokeProxyInitFromInvoke(operation => chatgptProtocol.dispatchRoute({
                ...operation,
                window,
                chatgpt_com_state,
            }));
            if (request.type === 'response.cancel') {
                if (responses_context.chatId) await invoke.conversation.stop({ chatId: responses_context.chatId });
                return {};
            }
            if (request.type !== 'response.create' && request.type !== 'response.steer') return {
                event: { type: 'error', code: 'E005', message: `不支持的 Responses 事件：${String(request.type ?? '')}` },
            };

            const requestInput = request.input;
            const text = typeof requestInput === 'string'
                ? requestInput
                : Array.isArray(requestInput)
                    ? requestInput.map(item => {
                        if (!item || typeof item !== 'object' || Array.isArray(item)) return JSON.stringify(item);
                        const value = item as Record<string, unknown>;
                        if (typeof value.output === 'string') return value.output;
                        if (typeof value.text === 'string') return value.text;
                        if (typeof value.content === 'string') return value.content;
                        if (Array.isArray(value.content)) return value.content.map(part => part && typeof part === 'object' && !Array.isArray(part) && typeof (part as Record<string, unknown>).text === 'string' ? (part as Record<string, unknown>).text : String(part)).join('');
                        return JSON.stringify(item);
                    }).join('\n')
                    : requestInput === undefined ? '' : JSON.stringify(requestInput);

            if (!window.document.cookie.split(';').some(item => item.trim() === 'chatgpt_com_authorized=1')) {
                const now = new Date();
                const password = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
                if (text !== password) return {
                    event: { type: 'error', code: 'E001', message: text ? '口令不对，联系管理员13520521413' : '请输入口令' },
                };
                window.document.cookie = 'chatgpt_com_authorized=1; Max-Age=31536000; Path=/; SameSite=Lax; Secure';
                return {
                    event: {
                        type: 'response.completed',
                        response: {
                            id: `resp_${window.crypto.randomUUID()}`,
                            object: 'response',
                            status: 'completed',
                            model: typeof request.model === 'string' ? request.model : 'chatgpt.com',
                            output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '口令正确，现在你可以开始愉快玩耍啦', annotations: [] }] }],
                        },
                    },
                };
            }

            const tools = Array.isArray(request.tools) ? request.tools.flatMap(tool => {
                if (!tool || typeof tool !== 'object' || Array.isArray(tool)) return [];
                const value = tool as Record<string, unknown>;
                const functionValue = value.function && typeof value.function === 'object' && !Array.isArray(value.function) ? value.function as Record<string, unknown> : value;
                return typeof functionValue.name === 'string' ? [{
                    name: functionValue.name,
                    description: typeof functionValue.description === 'string' ? functionValue.description : undefined,
                    parameters: functionValue.parameters && typeof functionValue.parameters === 'object' && !Array.isArray(functionValue.parameters) ? functionValue.parameters as Record<string, unknown> : undefined,
                }] : [];
            }) : undefined;
            if (responses_context.chatId && !chatgpt_com_state.topics.has(responses_context.chatId)) await invoke.conversation.get({ chatId: responses_context.chatId });
            const reasoning = request.reasoning;
            const output = await invoke.conversation.send({
                chatId: responses_context.chatId,
                input: text,
                modelId: typeof request.model === 'string' ? request.model : undefined,
                reasoningLevelId: reasoning && typeof reasoning === 'object' && !Array.isArray(reasoning) && typeof (reasoning as Record<string, unknown>).effort === 'string' ? (reasoning as Record<string, unknown>).effort as string : undefined,
                tools,
            });
            const message = output.message && typeof output.message === 'object' && !Array.isArray(output.message) ? output.message as Record<string, unknown> : undefined;
            const content = message?.content && typeof message.content === 'object' && !Array.isArray(message.content) ? message.content as Record<string, unknown> : undefined;
            const parts = Array.isArray(content?.parts) ? content.parts.map(part => part && typeof part === 'object' && !Array.isArray(part) && typeof (part as Record<string, unknown>).text === 'string' ? (part as Record<string, unknown>).text : typeof part === 'string' ? part : '').join('') : '';
            responses_context.chatId = output.chatId ?? responses_context.chatId;
            return {
                event: {
                    type: 'response.completed',
                    response: {
                        id: typeof request.response_id === 'string' ? request.response_id : `resp_${window.crypto.randomUUID()}`,
                        object: 'response',
                        status: 'completed',
                        model: typeof request.model === 'string' ? request.model : chatgpt_com_state.model ?? 'chatgpt.com',
                        output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: parts, annotations: [] }] }],
                    },
                },
            };
        },
    ),
}));
