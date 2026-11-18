import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { crx, defineManifest } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';

const require = createRequire(import.meta.url);
const chatgptMatches = ['https://chatgpt.com/*', 'https://*.chatgpt.com/*'];

export default defineConfig({
    plugins: [{
        name: 'extends-icons',
        configResolved(viteConfig) {
            if (viteConfig.command !== 'serve') return;
            const publicIcons = new URL('./public/icons/', import.meta.url);
            mkdirSync(publicIcons, { recursive: true });
            for (const size of [24, 128]) writeFileSync(
                new URL(`${size}.png`, publicIcons),
                readFileSync(require.resolve(`extends-icons/png/${size}.png`)),
            );
        },
        generateBundle() {
            for (const size of [24, 128]) this.emitFile({
                type: 'asset',
                fileName: `icons/${size}.png`,
                source: readFileSync(require.resolve(`extends-icons/png/${size}.png`)),
            });
        },
    }, crx({
        manifest: defineManifest({
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
            host_permissions: chatgptMatches,
            content_scripts: [{
                matches: chatgptMatches,
                js: ['src/content_scripts/index.ts'],
                run_at: 'document_idle',
            }],
        }),
    })],
});