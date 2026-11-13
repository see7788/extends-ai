﻿import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import Base_core, { type context_t } from 'invoke-protocol';

class Base extends Base_core<context_t> {
    public async dispatchInit(): Promise<void> { }
}

export default new Base()
    .register(({ route, routes, zod, zodUndefined }) => {
        type Session = {
            readonly display: `:${number}`;
            readonly geometry?: `${number}x${number}`;
            readonly websocketPort?: number;
            readonly httpd?: string;
            readonly sslOnly?: boolean;
            readonly localhost?: boolean;
        };
        type ApiAuth = {
            readonly port: number;
            readonly username: string;
            readonly password: string;
        };
        const execFileAsync = promisify(execFile);
        const vncBinary = 'vncserver';
        const session = zod.custom<Session>();
        const list = async () => {
            const { stdout } = await execFileAsync(vncBinary, ['-list']);
            return {
                output: stdout,
                sessions: stdout.split(/\r?\n/)
                    .map(line => line.match(/^(?::\d+)/)?.[0])
                    .filter((display): display is `:${number}` => display !== undefined)
                    .map(display => ({ display })),
            };
        };
        const args = (input: Session): string[] => [
            input.display,
            ...(input.geometry === undefined ? [] : ['-geometry', input.geometry]),
            ...(input.websocketPort === undefined ? [] : ['-websocketPort', String(input.websocketPort)]),
            ...(input.httpd === undefined ? [] : ['-httpd', input.httpd]),
            ...(input.sslOnly === undefined ? [] : ['-sslOnly', input.sslOnly ? '1' : '0']),
            ...(input.localhost === undefined ? [] : ['-localhost', input.localhost ? 'yes' : 'no']),
        ];
        const api = async (input: ApiAuth, path: string, init?: RequestInit) => {
            const response = await fetch(`http://127.0.0.1:${input.port}/api/${path}`, {
                ...init,
                headers: {
                    authorization: `Basic ${Buffer.from(`${input.username}:${input.password}`).toString('base64')}`,
                    ...(init?.headers ?? {}),
                },
            });
            if (!response.ok) throw new Error(`KasmVNC API ${response.status}: ${await response.text()}`);
            return response.json();
        };

        return routes({
            'kasmVnc.session.list': route(zodUndefined, async () => list()),
            'kasmVnc.session.create': route(session, async ({ input }) => {
                await execFileAsync(vncBinary, args(input));
                return list();
            }),
            'kasmVnc.session.set': route(session, async ({ input }) => {
                await execFileAsync(vncBinary, ['-kill', input.display]).catch(() => undefined);
                await execFileAsync(vncBinary, args(input));
                return list();
            }),
            'kasmVnc.session.delete': route(
                zod.custom<Pick<Session, 'display'>>(),
                async ({ input }) => {
                    await execFileAsync(vncBinary, ['-kill', input.display]);
                    return list();
                },
            ),
            'kasmVnc.api.createUser': route(zod.custom<ApiAuth & {
                readonly name: string;
                readonly userPassword: string;
                readonly write: boolean;
                readonly read?: boolean;
                readonly owner?: boolean;
            }>(), async ({ input }) => api(input, 'create_user', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ user: input.name, password: input.userPassword, write: input.write, read: input.read, owner: input.owner }),
            })),
            'kasmVnc.api.updateUser': route(zod.custom<ApiAuth & {
                readonly name: string;
                readonly userPassword?: string;
                readonly write?: boolean;
                readonly read?: boolean;
                readonly owner?: boolean;
            }>(), async ({ input }) => api(input, 'update_user', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ user: input.name, password: input.userPassword, write: input.write, read: input.read, owner: input.owner }),
            })),
            'kasmVnc.api.removeUser': route(zod.custom<ApiAuth & { readonly name: string }>(), async ({ input }) => api(input, 'remove_user', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ user: input.name }),
            })),
        });
    });
