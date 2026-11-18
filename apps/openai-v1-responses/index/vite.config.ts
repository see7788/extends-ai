import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import honoVite from 'hono-vite-config/plugin2';

const openaiV1ResponsesConfig = {
    server: {
        ip: '127.0.0.1',
        port: 11111,
    },
    websocket: {
        chromeExtensionPath: '/websocket/v1/chrome-extension',
    },
} as const;

export default defineConfig({
    plugins: [
        ...honoVite({
            hono: {
                external: ['@hono/node-server'],
                path: './src/index.ts',
                port: String(openaiV1ResponsesConfig.server.port),
            },
            renderer: { paths: [] },
        }),
        {
            name: 'generate-openai-v1-responses-config',
            buildStart() {
                const root = new URL('./src/declare/', import.meta.url);
                mkdirSync(root, { recursive: true });
                writeFileSync(new URL('./config.ts', root), (`\ufeffexport default ${JSON.stringify(openaiV1ResponsesConfig.server, null, 4)} as const;\n`).replaceAll('\n', '\r\n'), 'utf8');
                const routeRoot = new URL('../../responses-kasmvnc-chrome/src/declare/', import.meta.url);
                mkdirSync(routeRoot, { recursive: true });
                writeFileSync(new URL('./config.ts', routeRoot), (`\ufeffexport default ${JSON.stringify(openaiV1ResponsesConfig.server, null, 4)} as const;\n`).replaceAll('\n', '\r\n'), 'utf8');
                const extensionRoot = new URL('../../responses-chrome-extension/src/declare/', import.meta.url);
                mkdirSync(extensionRoot, { recursive: true });
                writeFileSync(new URL('./config.ts', extensionRoot), (`\ufeffexport default ${JSON.stringify({ ...openaiV1ResponsesConfig.server, chromeExtensionWebSocketPath: openaiV1ResponsesConfig.websocket.chromeExtensionPath }, null, 4)} as const;\n`).replaceAll('\n', '\r\n'), 'utf8');
                execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['--filter', 'responses-chrome-extension', 'build'], { cwd: fileURLToPath(new URL('..', import.meta.url)), stdio: 'inherit' });
            },
        },
    ],
});
