﻿import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { crx, defineManifest } from '@crxjs/vite-plugin';

export default defineConfig({
  publicDir: fileURLToPath(import.meta.resolve('extends-icons/png/')),
  plugins: [
    crx({
      manifest: defineManifest({
        manifest_version: 3,
        name: 'MCP Browser Tabs',
        version: '0.1.0',
        description: 'Create and close browser tabs from an in-page control.',
        permissions: ['tabs'],
        host_permissions: ['<all_urls>'],
        icons: { 24: '24.png', 128: '128.png', 256: '256.png' },
        background: {
          service_worker: 'src/background.service_worker/index.ts',
          type: 'module',
        },
        content_scripts: [{
          matches: ['<all_urls>'],
          js: ['src/content_scripts/index.tsx'],
          run_at: 'document_idle',
        }],
      }),
    }),
  ],
});
