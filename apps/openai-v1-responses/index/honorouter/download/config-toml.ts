import { Hono } from 'hono';
import config from 'openai-v1-responses-config';

export default new Hono().get('/config.toml', c => {
    const baseUrl = `${config.relay.origin}${config.relay.path.replace(/\/responses$/, '')}`;
    c.header('content-type', 'application/toml; charset=utf-8');
    c.header('content-disposition', 'attachment; filename="config.toml"');
    return c.body([
        'model_provider = "chatgpt_web"',
        '',
        '[model_providers.chatgpt_web]',
        'name = "ChatGPT Web"',
        `base_url = "${baseUrl}"`,
        'wire_api = "responses_websocket"',
        'requires_openai_auth = false',
        'supports_websockets = true',
        '',
    ].join('\n'));
});
