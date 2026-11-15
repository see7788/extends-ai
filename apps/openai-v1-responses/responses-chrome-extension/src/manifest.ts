import config from 'openai-v1-responses-config';

export default {
    manifest_version: 3,
    name: 'ChatGPT Responses Bridge',
    version: '0.1.0',
    description: '把已登录的 ChatGPT 页面提供为 Responses 协议浏览器端点。',
    icons: {
        24: 'icons/24.png',
        128: 'icons/128.png',
    },
    action: {
        default_icon: {
            24: 'icons/24.png',
            128: 'icons/128.png',
        },
    },
    host_permissions: config.chatgpt.matches,
    content_scripts: [{
        matches: config.chatgpt.matches,
        js: ['src/content_scripts/index.ts'],
        run_at: 'document_idle',
    }],
} as const;
