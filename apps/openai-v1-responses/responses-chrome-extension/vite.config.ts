import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { crx, defineManifest } from '@crxjs/vite-plugin';
import { defineConfig } from 'vite';
import manifest from './src/manifest.ts';

const require = createRequire(import.meta.url);

export default defineConfig({
    plugins: [{
        name: 'extends-icons',
        generateBundle() {
            for (const size of [24, 128]) this.emitFile({
                type: 'asset',
                fileName: `icons/${size}.png`,
                source: readFileSync(require.resolve(`extends-icons/png/${size}.png`)),
            });
        },
    }, crx({ manifest: defineManifest(manifest) })],
});
