﻿import { defineConfig } from 'vite';
import Peerjs from 'ubuntu-lib/peerjs/index';
import Ports from 'ubuntu-lib/ports/index';

const port = 10010;

export default defineConfig({
    server: { port, strictPort: true },
    plugins: [
        new Peerjs().vitePlugin(port),
        new Ports(port).writeFilePlugin({ port }),
    ],
});
