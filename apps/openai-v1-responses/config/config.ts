export default {
    chatgpt: {
        origin: 'https://chatgpt.com',
        matches: ['https://chatgpt.com/*', 'https://*.chatgpt.com/*'],
        backendPath: '/backend-api',
    },
    responses: {
        origin: 'http://127.0.0.1:11111',
        host: '127.0.0.1',
        port: 11111,
        path: '/v1/responses',
    },
    relay: {
        origin: 'ws://127.0.0.1:11111',
        path: '/v1/responses',
    },
} as const;
