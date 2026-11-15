import { Hono } from 'hono';
import downloadRouter from './download/index.js';

export default new Hono()
    .get('/health', c => c.json({ ok: true }))
    .route('/download', downloadRouter);
