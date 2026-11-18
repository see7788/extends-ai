import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { access, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createNodeWebSocket } from '@hono/node-ws';
import { getCookie } from 'hono/cookie';
import { jsx } from 'hono/jsx';
import auth from 'users/honorouter/auth';
import config from './declare/config';
import store from './store';


const routes = {
    root: '/kasmvnc',
    config: '/download/config.toml',
    codex: '/websocket/v1/codex',
    chromeExtension: '/websocket/v1/chrome-extension',
} as const;

const kasmvnc = {
    store,
    async checkRuntime() {
        if (store.runtime) return store.runtime;
        const state = store.config;
        try {
            await promisify(execFile)(state.vnc.executable, ['-list']);
        } catch (error) {
            throw new Error('云服务未安装或无法执行 vncserver', { cause: error });
        }
        const executable = (await Promise.all(state.chrome.executableCandidates.map(async path => await access(path).then(() => path).catch(() => undefined)))).find(path => path !== undefined);
        if (!executable) throw new Error('云服务未找到 Chrome 或 Chromium 可执行文件');
        try {
            await access(state.chrome.extensionPath);
        } catch (error) {
            throw new Error('Chrome 扩展构建目录不存在，请先构建 responses-chrome-extension', { cause: error });
        }
        const runtime = { executable, extensionPath: state.chrome.extensionPath };
        store.runtime = runtime;
        return runtime;
    },
    async portIsFree(port: number) {
        const server = createServer();
        const available = await new Promise<boolean>(resolve => {
            server.once('error', () => resolve(false));
            server.listen(port, '127.0.0.1', () => resolve(true));
        });
        if (!available) return false;
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        return true;
    },
    async allocateInternalPort() {
        while (true) {
            const port = store.reserveInternalPort();
            if (await kasmvnc.portIsFree(port)) return port;
        }
    },
    allocateDisplay() {
        return store.reserveDisplay();
    },
    async vncIsRunning(display: string) {
        try {
            const { stdout } = await promisify(execFile)(store.config.vnc.executable, ['-list']);
            return stdout.split(/\r?\n/).some(line => line.trim().split(/\s+/)[0] === display);
        } catch (error) {
            throw new Error('查询 KasmVNC 实例失败', { cause: error });
        }
    },
    async createSession(userId: string) {
        const previous = store.sessions.get(userId);
        if (previous) return previous;
        const creating = store.creatingSessions.get(userId);
        if (creating) return creating;
        const promise = (async () => {
            const runtime = await kasmvnc.checkRuntime();
            let instance = store.getInstance(userId);
            if (!instance) {
                instance = {
                    kasmvnc: {
                        display: kasmvnc.allocateDisplay(),
                        websocketPort: await kasmvnc.allocateInternalPort(),
                    },
                    chrome: {
                        remoteDebuggingPort: await kasmvnc.allocateInternalPort(),
                    },
                };
                store.setInstance(userId, instance);
            }
            const latest = store.config;
            const userDataDir = join(latest.chrome.dataRoot, encodeURIComponent(userId));
            await mkdir(userDataDir, { recursive: true });
            let vncStarted = false;
            let chromeProcess: ChildProcess | null = null;
            try {
                if (!await kasmvnc.vncIsRunning(instance.kasmvnc.display)) {
                    await promisify(execFile)(latest.vnc.executable, [
                        instance.kasmvnc.display,
                        '-websocketPort', String(instance.kasmvnc.websocketPort),
                        '-localhost', latest.vnc.localhost,
                        '-geometry', latest.vnc.geometry,
                    ]);
                    vncStarted = true;
                }
                if (await kasmvnc.portIsFree(instance.chrome.remoteDebuggingPort)) {
                    const child = spawn(runtime.executable, [
                        `--user-data-dir=${userDataDir}`,
                        `--load-extension=${runtime.extensionPath}`,
                        `--remote-debugging-port=${instance.chrome.remoteDebuggingPort}`,
                        '--remote-debugging-address=127.0.0.1',
                        '--no-sandbox',
                        `https://chatgpt.com/?responses_user_id=${encodeURIComponent(userId)}`,
                    ], {
                        env: { DISPLAY: instance.kasmvnc.display },
                        stdio: 'ignore',
                    });
                    chromeProcess = child;
                    await new Promise<void>((resolve, reject) => {
                        child.once('spawn', resolve);
                        child.once('error', reject);
                    });
                } else {
                    const response = await fetch(`http://127.0.0.1:${instance.chrome.remoteDebuggingPort}/json/version`);
                    if (!response.ok) throw new Error(`Chrome 远程调试端口已被其他进程占用：${instance.chrome.remoteDebuggingPort}`);
                }
                return store.createSession(userId, instance, runtime, userDataDir, chromeProcess);
            } catch (error) {
                if (chromeProcess && !chromeProcess.killed) chromeProcess.kill();
                if (vncStarted) {
                    try {
                        await promisify(execFile)(latest.vnc.executable, ['-kill', instance.kasmvnc.display]);
                    } catch (cleanupError) {
                        throw new AggregateError([error, cleanupError], '创建用户实例失败，且清理 KasmVNC 实例失败');
                    }
                }
                throw error;
            }
        })();
        store.creatingSessions.set(userId, promise);
        try {
            return await promise;
        } finally {
            store.creatingSessions.delete(userId);
        }
    },
};

const app = auth.factory.createApp();
app.onError((error, c) => c.text(error instanceof Error ? error.message : String(error), 500));
app.use(routes.root, auth.middleware);
app.use(`${routes.root}/*`, auth.middleware);
app.use(routes.config, auth.middleware);
app.get(routes.root, async c => {
    try {
        const session = await kasmvnc.createSession(c.get('userId'));
        return c.html(String(jsx('html', null,
        jsx('head', null, jsx('meta', { charSet: 'utf-8' }), jsx('title', null, 'Codex Responses')),
        jsx('body', null,
            jsx('h1', null, 'Codex Responses'),
            jsx('p', null, `用户：${session.userId}`),
            jsx('p', null, `KasmVNC：${session.kasmvnc.display}，Chrome PID：${session.chrome.process === null ? 'existing' : session.chrome.process.pid}`),
            jsx('a', { href: routes.config }, '下载 config.toml'),
        ),
        )));
    } catch (error) {
        return c.text(error instanceof Error ? error.message : String(error), 500);
    }
});
app.get(routes.config, async c => {
    try {
        await kasmvnc.createSession(c.get('userId'));
    } catch (error) {
        return c.text(error instanceof Error ? error.message : String(error), 500);
    }
    const refreshJwt = getCookie(c, 'userrefresh');
    if (!refreshJwt) return c.text('缺少刷新令牌', 401);
    c.header('content-type', 'application/toml; charset=utf-8');
    c.header('content-disposition', 'attachment; filename="config.toml"');
    return c.body([
        'model_provider = "chatgpt_web"',
        '',
        '[model_providers.chatgpt_web]',
        'name = "ChatGPT Web"',
        `base_url = "ws://${config.ip}:${config.port}${routes.codex}"`,
        'wire_api = "responses_websocket"',
        'requires_openai_auth = false',
        'supports_websockets = true',
        '',
        '[model_providers.chatgpt_web.auth]',
        'command = "curl"',
        `args = ${JSON.stringify(['-sS', '-X', 'POST', '-H', 'content-type: application/json', '-d', JSON.stringify(refreshJwt), `http://${config.ip}:${config.port}${auth.refreshJwtPath}`])}`,
        'refresh_interval_ms = 300000',
        '',
    ].join('\n'));
});

app.use(routes.codex, async (c, next) => {
    const authorization = c.req.header('authorization');
    if (!authorization || !authorization.startsWith('Bearer ')) return c.text('需要登录', 401);
    const jwt = authorization.slice('Bearer '.length);
    let payload: Awaited<ReturnType<typeof auth.verifyJwt>>;
    try {
        payload = await auth.verifyJwt(jwt);
    } catch (error) {
        return c.text(error instanceof Error ? `登录令牌无效或已过期：${error.message}` : `登录令牌无效或已过期：${String(error)}`, 401);
    }
    c.set('userId', payload.sub);
    c.set('jwt', jwt);
    await next();
});

const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });
app.get(routes.codex, upgradeWebSocket(c => ({
    onOpen: async (_event, socket) => {
        try {
            const session = await kasmvnc.createSession(c.get('userId'));
            const previous = session.getSocket('codex');
            if (previous && previous !== socket) previous.close(4000, 'Codex 连接已替换');
            session.setSocket('codex', socket);
        } catch (error) {
            socket.send(JSON.stringify({ type: 'error', code: 'E002', message: error instanceof Error ? error.message : String(error) }));
            socket.close(1011, '无法创建用户实例');
        }
    },
    onMessage: async (event, socket) => {
        const session = store.getSessionBySocket(socket);
        if (!session) return socket.send(JSON.stringify({ type: 'error', code: 'E001', message: 'Codex 连接未完成初始化' }));
        const chrome = session.getSocket('chromeExtension');
        if (!chrome) return socket.send(JSON.stringify({ type: 'error', code: 'E002', message: 'Chrome 扩展尚未连接' }));
        try {
            chrome.send(typeof event.data === 'string' ? event.data : event.data instanceof Blob ? new Uint8Array(await event.data.arrayBuffer()) : new Uint8Array(event.data) as Uint8Array<ArrayBuffer>);
        } catch (error) {
            socket.send(JSON.stringify({ type: 'error', code: 'E002', message: error instanceof Error ? error.message : String(error) }));
        }
    },
    onClose: (_event, socket) => store.getSessionBySocket(socket)?.clearSocket(socket),
})));
app.get(routes.chromeExtension, upgradeWebSocket(() => ({
    onMessage: async (event, socket) => {
        const session = store.getSessionBySocket(socket);
        if (!session) {
            if (typeof event.data !== 'string') return socket.send(JSON.stringify({ type: 'error', code: 'E005', message: 'Chrome 扩展初始化消息必须是 JSON 文本' }));
            let input: { readonly type?: unknown; readonly userId?: unknown };
            try {
                input = JSON.parse(event.data) as { readonly type?: unknown; readonly userId?: unknown };
            } catch (error) {
                return socket.send(JSON.stringify({ type: 'error', code: 'E005', message: error instanceof Error ? error.message : String(error) }));
            }
            if (input.type !== 'session' || typeof input.userId !== 'string' || input.userId.length === 0) return socket.send(JSON.stringify({ type: 'error', code: 'E001', message: 'Chrome 扩展缺少用户标识' }));
            try {
                const created = await kasmvnc.createSession(input.userId);
                const previous = created.getSocket('chromeExtension');
                if (previous && previous !== socket) previous.close(4000, 'Chrome 扩展连接已替换');
                created.setSocket('chromeExtension', socket);
            } catch (error) {
                socket.send(JSON.stringify({ type: 'error', code: 'E002', message: error instanceof Error ? error.message : String(error) }));
                socket.close(1011, '无法创建用户实例');
            }
            return;
        }
        const codex = session.getSocket('codex');
        if (!codex) return socket.send(JSON.stringify({ type: 'error', code: 'E002', message: 'Codex 尚未连接' }));
        try {
            codex.send(typeof event.data === 'string' ? event.data : event.data instanceof Blob ? new Uint8Array(await event.data.arrayBuffer()) : new Uint8Array(event.data) as Uint8Array<ArrayBuffer>);
        } catch (error) {
            socket.send(JSON.stringify({ type: 'error', code: 'E002', message: error instanceof Error ? error.message : String(error) }));
        }
    },
    onClose: (_event, socket) => store.getSessionBySocket(socket)?.clearSocket(socket),
})));
export default { app, injectWebSocket };
