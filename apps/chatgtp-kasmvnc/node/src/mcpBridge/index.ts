﻿import { Peer, type DataConnection } from 'peerjs';
import BaseCore, { type context_t, type invokeProxy_t } from 'invoke-protocol';
import config from '../declare/__declare__.ts';
import { store_t } from "./store.ts"
import type { StoreApi } from "zustand/vanilla";
import kasmVnc from '../kasmVnc/index.ts';
interface Context extends context_t {
    readonly peer: Peer
    readonly store: StoreApi<store_t>
    readonly dataConnection: DataConnection
    readonly invokeProxy: invokeProxy_t<this["routers"]>;
}

class Base extends BaseCore<Context> {
    private async createPeer(): Promise<Peer> {
        if (typeof process !== 'undefined' && process.release?.name === 'node') {
            const { WebSocket } = await import('ws')
            const wrtc = await import('wrtc' as any)
            Object.assign(globalThis, {
                WebSocket,
                RTCPeerConnection: wrtc.RTCPeerConnection,
                RTCSessionDescription: wrtc.RTCSessionDescription,
                RTCIceCandidate: wrtc.RTCIceCandidate,
            });
        }
        return new Peer(config.peerjs);
    }

    public async dispatchInit(store: Context['store']): Promise<void> {
        const peer = await this.createPeer();
        const dataConnectionProxy = (dataConnection: DataConnection) => {
            const invokeProxyFrom = this.invokeProxyFromSendOn(
                message => dataConnection.send(message),
                listener => { dataConnection.on('data', listener); }
            );
            const dispatchFrom = this.dispatchFromSendOn({
                sendUnknown: message => dataConnection.send(message),
                onUnknown: listener => { dataConnection.on('data', listener); },
                routeParam: operation => ({
                    ...operation,
                    peer,
                    store,
                    dataConnection,
                    invokeProxy: invokeProxyFrom.invokeProxy,
                }),
            });

            dataConnection.once('close', () => {
                invokeProxyFrom.close();
                dispatchFrom.close();
            })
        }
        const connect = ({ peerId, metadata }: { peerId: string, metadata: string }) => {
            const dataConnection = peer.connect(peerId, { metadata })
            dataConnectionProxy(dataConnection)
        }
        peer.on('connection', dataConnection => {
            if (dataConnection.metadata) {
                dataConnection.peer
            }
        });
    }

    public async invokeProxyInit() {
        return new Promise<ReturnType<typeof this.invokeProxyFromSendOn<this>> & { peer: Peer }>(async ok => {
            const peer = await this.createPeer();
            peer.on('connection', dataConnection => {
                const invokeProxyFrom = this.invokeProxyFromSendOn(
                    message => dataConnection.send(message),
                    listener => { dataConnection.on('data', listener); }
                )
                dataConnection.on('close', () => {
                    invokeProxyFrom.close()
                })
                ok({
                    peer: peer,
                    invokeProxy: invokeProxyFrom.invokeProxy,
                    close: () => {
                        invokeProxyFrom.close()
                        dataConnection.close()
                    }
                })
            })
        })
    }
}

export default new Base().register(({ route, routes, zod }) => {
    return routes({
        'peer.register': route(zod.object({ peerid: zod.string(), metadata: zod.string() }), ({ input, store }) => {
            if (!store.getState().mcpBridgeActions.password(input.metadata)) throw new Error('Invalid password');
            return true
        }),
    });
}).registerMergeThis(kasmVnc);
