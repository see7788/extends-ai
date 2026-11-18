import config from '../declare/config';
import endpoint from './invoke-protocol.ts';

const context = {
    window,
    chatgpt_com_state: { topics: new Map() },
    responses_context: { chatId: undefined as string | undefined },
};
const socket = new WebSocket(`ws://${config.ip}:${config.port}${config.chromeExtensionWebSocketPath}`);
let sequence = 0;
const send = (event: Record<string, unknown>): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ sequence_number: ++sequence, ...event }));
};

socket.addEventListener('open', () => {
    const userId = new URL(window.location.href).searchParams.get('responses_user_id');
    socket.send(JSON.stringify({ type: 'session', userId }));
});

socket.addEventListener('message', async ({ data }) => {
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
});
