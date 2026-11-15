import { Hono } from 'hono';
import configTomlRouter from './config-toml.js';
import vscodeExtensionRouter from './vscode-extension.js';

export default new Hono()
    .route('/codex-config', configTomlRouter)
    .route('/vscode-extension', vscodeExtensionRouter);
