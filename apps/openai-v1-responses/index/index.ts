import { serve } from '@hono/node-server';
import config from 'openai-v1-responses-config';
import app from './honorouter/index.js';
import attachWebSocket from './honorouter/websocket/index.js';

const server = serve({
    fetch: app.fetch,
    hostname: config.responses.host,
    port: config.responses.port,
});

attachWebSocket(server, config.relay.path, config.responses.host);
server.on('error', error => {
    throw error;
});
