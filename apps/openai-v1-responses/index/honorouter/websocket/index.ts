import type { serve } from '@hono/node-server';
import { WebSocket, WebSocketServer } from 'ws';

export default (server: ReturnType<typeof serve>, path: string, host: string): void => {
    const peers = new Set<WebSocket>();
    const webSocketServer = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
        const pathname = new URL(request.url ?? '/', `http://${request.headers.host ?? host}`).pathname;
        if (pathname !== path) {
            socket.destroy();
            return;
        }
        webSocketServer.handleUpgrade(request, socket, head, client => {
            webSocketServer.emit('connection', client, request);
        });
    });

    webSocketServer.on('connection', socket => {
        peers.add(socket);
        const close = (): void => { peers.delete(socket); };
        socket.on('message', message => {
            for (const peer of peers) if (peer !== socket && peer.readyState === WebSocket.OPEN) peer.send(message);
        });
        socket.once('close', close);
        socket.once('error', close);
    });

    webSocketServer.on('error', error => {
        throw error;
    });
};
