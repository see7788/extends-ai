import type { ServerType } from '@hono/node-server';
import type { Hono } from 'hono';

declare const hono: {
    honoServer(app: Hono): ServerType;
};

export default hono;
