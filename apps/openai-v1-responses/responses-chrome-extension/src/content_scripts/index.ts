import config from 'openai-v1-responses-config';
import endpoint from './invoke-protocol.ts';

const context = {
    window,
    chatgpt_com_state: { topics: new Map() },
    responses_context: { chatId: undefined as string | undefined },
};
const socket = new WebSocket(`${config.relay.origin}${config.relay.path}`);
let sequence = 0;
const send = (event: Record<string, unknown>): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ sequence_number: ++sequence, ...event }));
};

socket.addEventListener('message', ({ data }) => {
    void (async () => {
        let request: Record<string, unknown>;
        try {
            if (typeof data !== 'string') throw new Error('Responses 消息必须是 JSON 文本');
            request = JSON.parse(data) as Record<string, unknown>;
            if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('消息不是对象');
        } catch (cause) {
            send({ type: 'error', code: 'E005', message: cause instanceof Error ? cause.message : String(cause) });
            return;
        }
        try {
            const output = await endpoint.dispatchRoute({
                path: 'responses.message',
                input: { request },
                ...context,
            }) as { readonly event?: Record<string, unknown> };
            if (output.event) send(output.event);
        } catch (cause) {
            send({ type: 'error', code: 'E002', message: cause instanceof Error ? cause.message : String(cause) });
        }
    })();
});
