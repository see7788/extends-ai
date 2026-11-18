import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { promisify } from 'node:util';
import { z } from 'zod';
import Base_code, { type context_t as context_core } from 'invoke-protocol';

const kasmvnc_zod = z.object({
    userId: z.string().min(1), // 用户业务唯一标识
    kasmvnc: z.object({
        display: z.string().regex(/^:\d+$/), // X 桌面显示编号，例如 :1
        geometry: z.string().regex(/^\d+x\d+$/).optional(), // 桌面分辨率，例如 1920x1080
        httpd: z.string().min(1).optional(), // KasmVNC 内置 HTTP 目录
        sslOnly: z.boolean().optional(), // 是否只允许 SSL 连接
        api: z.object({
            username: z.string().min(1), // KasmVNC owner 用户名
            password: z.string().min(1), // KasmVNC owner 密码
        }).optional(),
    }),
    chrome: z.object({
        executable: z.string().min(1), // Chrome 或 Chromium 可执行文件
        display: z.string().regex(/^:\d+$/), // Chrome 连接的 X 显示编号
        userDataDir: z.string().min(1), // Chrome 用户数据目录
        extensionPath: z.string().min(1), // responses-chrome-extension 目录
        window: z.object({
            width: z.number().int().positive(), // Chrome 窗口宽度
            height: z.number().int().positive(), // Chrome 窗口高度
        }).optional(),
        noSandbox: z.boolean().optional(), // 是否使用 --no-sandbox 启动
    }),
});

export interface context_t extends context_core {
    readonly kasmvncs: Map<z.infer<typeof kasmvnc_zod>['userId'], {
        readonly userId: z.infer<typeof kasmvnc_zod>['userId'];
        readonly kasmvnc: z.infer<typeof kasmvnc_zod>['kasmvnc'] & { readonly websocketPort: number };
        readonly chrome: z.infer<typeof kasmvnc_zod>['chrome'] & { readonly remoteDebuggingPort: number };
        readonly chromeProcess: ChildProcess;
    }>;
}

class Base extends Base_code<context_t> { }

const protocol = new Base()
    .register(({ route, routes, zodUndefined }) => {
        return routes({
            // 有则覆盖、无则新建一个用户唯一的 KasmVNC 会话和 Chrome。
            'kasmvncs.set': route(kasmvnc_zod, async ({ input, kasmvncs }) => {
                if (input.kasmvnc.display !== input.chrome.display) throw new Error('KasmVNC display 与 Chrome display 必须一致');
                const previous = kasmvncs.get(input.userId);
                if (previous) {
                    if (!previous.chromeProcess.killed && previous.chromeProcess.exitCode === null) previous.chromeProcess.kill('SIGTERM');
                    try {
                        await promisify(execFile)('vncserver', ['-kill', previous.kasmvnc.display]);
                    } catch (cause) {
                        if (!/No matching|does not exist|no such display|not running/i.test(cause instanceof Error ? cause.message : String(cause))) throw new Error(cause instanceof Error ? cause.message : String(cause));
                    }
                    kasmvncs.delete(input.userId);
                }
                const reservePort = (): Promise<{ readonly server: ReturnType<typeof createServer>; readonly port: number }> => new Promise((resolve, reject) => {
                    const server = createServer();
                    server.once('error', reject);
                    server.listen(0, '127.0.0.1', () => {
                        const address = server.address();
                        if (!address || typeof address === 'string') {
                            server.close();
                            reject(new Error('无法取得内部端口号'));
                            return;
                        }
                        resolve({ server, port: address.port });
                    });
                });
                const websocketReservation = await reservePort();
                let remoteDebuggingReservation: Awaited<ReturnType<typeof reservePort>>;
                try {
                    remoteDebuggingReservation = await reservePort();
                } catch (cause) {
                    await new Promise<void>((resolve, reject) => websocketReservation.server.close(error => error ? reject(error) : resolve()));
                    throw cause;
                }
                const websocketPort = websocketReservation.port;
                const remoteDebuggingPort = remoteDebuggingReservation.port;
                await Promise.all([
                    new Promise<void>((resolve, reject) => websocketReservation.server.close(error => error ? reject(error) : resolve())),
                    new Promise<void>((resolve, reject) => remoteDebuggingReservation.server.close(error => error ? reject(error) : resolve())),
                ]);
                await promisify(execFile)('vncserver', [
                    input.kasmvnc.display,
                    '-websocketPort', String(websocketPort),
                    '-localhost', 'yes',
                    ...(input.kasmvnc.geometry === undefined ? [] : ['-geometry', input.kasmvnc.geometry]),
                    ...(input.kasmvnc.httpd === undefined ? [] : ['-httpd', input.kasmvnc.httpd]),
                    ...(input.kasmvnc.sslOnly === undefined ? [] : ['-sslOnly', input.kasmvnc.sslOnly ? '1' : '0']),
                ]);
                try {
                    const chromeProcess = spawn(input.chrome.executable, [
                        `--user-data-dir=${input.chrome.userDataDir}`,
                        `--load-extension=${input.chrome.extensionPath}`,
                        ...(input.chrome.window === undefined ? [] : [`--window-size=${input.chrome.window.width},${input.chrome.window.height}`]),
                        `--remote-debugging-port=${remoteDebuggingPort}`,
                        '--remote-debugging-address=127.0.0.1',
                        ...(input.chrome.noSandbox ? ['--no-sandbox'] : []),
                        `https://chatgpt.com/?responses_user_id=${encodeURIComponent(input.userId)}`,
                    ], {
                        env: { DISPLAY: input.chrome.display },
                        stdio: 'ignore',
                    });
                    await new Promise<void>((resolve, reject) => {
                        chromeProcess.once('spawn', resolve);
                        chromeProcess.once('error', reject);
                    });
                    kasmvncs.set(input.userId, {
                        userId: input.userId,
                        kasmvnc: { ...input.kasmvnc, websocketPort },
                        chrome: { ...input.chrome, remoteDebuggingPort },
                        chromeProcess,
                    });
                    return {
                        userId: input.userId,
                        replaced: previous !== undefined,
                        display: input.kasmvnc.display,
                        websocketPort,
                        remoteDebuggingPort,
                        chromePid: chromeProcess.pid,
                    };
                } catch (cause) {
                    try {
                        await promisify(execFile)('vncserver', ['-kill', input.kasmvnc.display]);
                    } catch (cleanupError) {
                        if (!/No matching|does not exist|no such display|not running/i.test(cleanupError instanceof Error ? cleanupError.message : String(cleanupError))) throw new Error(cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
                    }
                    throw cause;
                }
            }),

            // 查询当前进程维护的全部真实会话。
            'kasmvncs.list': route(zodUndefined, async ({ kasmvncs }) => {
                const { stdout } = await promisify(execFile)('vncserver', ['-list']);
                return [...kasmvncs.values()].map(session => ({
                    userId: session.userId,
                    display: session.kasmvnc.display,
                    websocketPort: session.kasmvnc.websocketPort,
                    remoteDebuggingPort: session.chrome.remoteDebuggingPort,
                    chromePid: session.chromeProcess.pid,
                    chromeRunning: !session.chromeProcess.killed && session.chromeProcess.exitCode === null,
                    vncOutput: stdout,
                }));
            }),

            // 查询一个用户对应的 KasmVNC 会话和唯一 Chrome。
            'kasmvncs.get.session': route(
                kasmvnc_zod.pick({ userId: true }),
                ({ input, kasmvncs }) => {
                    const session = kasmvncs.get(input.userId);
                    if (!session) throw new Error('userId not found');
                    return {
                        userId: session.userId,
                        kasmvnc: session.kasmvnc,
                        chrome: session.chrome,
                        chromePid: session.chromeProcess.pid,
                        chromeRunning: !session.chromeProcess.killed && session.chromeProcess.exitCode === null,
                    };
                },
            ),

            // 只替换打包扩展并重启 Chrome，不重建 KasmVNC 会话。
            'kasmvncs.set.chrome.extension': route(
                kasmvnc_zod.pick({ userId: true }).extend({
                    extension: z.object({
                        fileName: z.string().regex(/\.zip$/i), // 已打包的 Chrome 扩展文件名
                        contentBase64: z.string().min(1), // 扩展 zip 文件的 Base64 内容
                    }),
                }),
                async ({ input, kasmvncs }) => {
                    const session = kasmvncs.get(input.userId);
                    if (!session) throw new Error('userId not found');
                    const content = Buffer.from(input.extension.contentBase64, 'base64');
                    if (content.length === 0) throw new Error('扩展上传内容为空');
                    await rm(session.chrome.extensionPath, { recursive: true, force: true });
                    await mkdir(session.chrome.extensionPath, { recursive: true });
                    const unzip = spawn('unzip', ['-oq', '/dev/stdin', '-d', session.chrome.extensionPath], {
                        stdio: ['pipe', 'ignore', 'pipe'],
                    });
                    let errorOutput = '';
                    unzip.stderr?.on('data', chunk => { errorOutput += String(chunk); });
                    await new Promise<void>((resolve, reject) => {
                        unzip.once('error', reject);
                        unzip.once('close', code => code === 0 ? resolve() : reject(new Error(errorOutput.trim() || `unzip exited with code ${code}`)));
                        unzip.stdin?.end(content);
                    });
                    if (!session.chromeProcess.killed && session.chromeProcess.exitCode === null) session.chromeProcess.kill('SIGTERM');
                    try {
                        const chromeProcess = spawn(session.chrome.executable, [
                            `--user-data-dir=${session.chrome.userDataDir}`,
                            `--load-extension=${session.chrome.extensionPath}`,
                            ...(session.chrome.window === undefined ? [] : [`--window-size=${session.chrome.window.width},${session.chrome.window.height}`]),
                            `--remote-debugging-port=${session.chrome.remoteDebuggingPort}`,
                            '--remote-debugging-address=127.0.0.1',
                            ...(session.chrome.noSandbox ? ['--no-sandbox'] : []),
                            `https://chatgpt.com/?responses_user_id=${encodeURIComponent(input.userId)}`,
                        ], {
                            env: { DISPLAY: session.chrome.display },
                            stdio: 'ignore',
                        });
                        await new Promise<void>((resolve, reject) => {
                            chromeProcess.once('spawn', resolve);
                            chromeProcess.once('error', reject);
                        });
                        kasmvncs.set(input.userId, { ...session, chromeProcess });
                        return { userId: input.userId, fileName: input.extension.fileName, chromePid: chromeProcess.pid, updated: true as const };
                    } catch (cause) {
                        kasmvncs.delete(input.userId);
                        throw cause;
                    }
                },
            ),

            // 代理 KasmVNC 官方 HTTP 接口：获取瓶颈统计。
            'kasmvncs.get.bottleneckStats': route(
                kasmvnc_zod.pick({ userId: true }),
                async ({ input, kasmvncs }) => {
                    const session = kasmvncs.get(input.userId);
                    if (!session) throw new Error('userId not found');
                    if (!session.kasmvnc.api) throw new Error('KasmVNC HTTP API 未配置');
                    const response = await fetch(`${session.kasmvnc.sslOnly ? 'https' : 'http'}://127.0.0.1:${session.kasmvnc.websocketPort}/api/get_bottleneck_stats`, {
                        headers: { authorization: `Basic ${Buffer.from(`${session.kasmvnc.api.username}:${session.kasmvnc.api.password}`).toString('base64')}` },
                    });
                    if (!response.ok) throw new Error(`KasmVNC API ${response.status}: ${await response.text()}`);
                    return response.json();
                },
            ),

            // 代理 KasmVNC 官方 HTTP 接口：获取帧统计。
            'kasmvncs.get.frameStats': route(
                kasmvnc_zod.pick({ userId: true }).extend({ client: z.string().optional() }),
                async ({ input, kasmvncs }) => {
                    const session = kasmvncs.get(input.userId);
                    if (!session) throw new Error('userId not found');
                    if (!session.kasmvnc.api) throw new Error('KasmVNC HTTP API 未配置');
                    const url = new URL(`${session.kasmvnc.sslOnly ? 'https' : 'http'}://127.0.0.1:${session.kasmvnc.websocketPort}/api/get_frame_stats`);
                    if (input.client !== undefined) url.searchParams.set('client', input.client);
                    const response = await fetch(url, {
                        headers: { authorization: `Basic ${Buffer.from(`${session.kasmvnc.api.username}:${session.kasmvnc.api.password}`).toString('base64')}` },
                    });
                    if (!response.ok) throw new Error(`KasmVNC API ${response.status}: ${await response.text()}`);
                    return response.json();
                },
            ),

            // 代理 KasmVNC 官方 HTTP 接口：获取当前桌面截图。
            'kasmvncs.get.screenshot': route(
                kasmvnc_zod.pick({ userId: true }).extend({
                    width: z.number().int().positive().optional(), // 截图宽度
                    height: z.number().int().positive().optional(), // 截图高度
                    quality: z.number().int().min(0).max(10).optional(), // JPEG 质量
                    deduplicate: z.boolean().optional(), // 无变化时是否返回空结果
                }),
                async ({ input, kasmvncs }) => {
                    const session = kasmvncs.get(input.userId);
                    if (!session) throw new Error('userId not found');
                    if (!session.kasmvnc.api) throw new Error('KasmVNC HTTP API 未配置');
                    const url = new URL(`${session.kasmvnc.sslOnly ? 'https' : 'http'}://127.0.0.1:${session.kasmvnc.websocketPort}/api/get_screenshot`);
                    if (input.width !== undefined) url.searchParams.set('width', String(input.width));
                    if (input.height !== undefined) url.searchParams.set('height', String(input.height));
                    if (input.quality !== undefined) url.searchParams.set('quality', String(input.quality));
                    if (input.deduplicate !== undefined) url.searchParams.set('deduplicate', String(input.deduplicate));
                    const response = await fetch(url, {
                        headers: { authorization: `Basic ${Buffer.from(`${session.kasmvnc.api.username}:${session.kasmvnc.api.password}`).toString('base64')}` },
                    });
                    if (!response.ok) throw new Error(`KasmVNC API ${response.status}: ${await response.text()}`);
                    return { contentType: response.headers.get('content-type') ?? 'image/jpeg', contentBase64: Buffer.from(await response.arrayBuffer()).toString('base64') };
                },
            ),

            // 代理 KasmVNC 官方 HTTP 接口：新增共享会话用户。
            'kasmvncs.get.createUser': route(
                kasmvnc_zod.pick({ userId: true }).extend({
                    name: z.string().min(1), // 新用户名称
                    password: z.string().min(1), // 新用户密码
                    write: z.boolean(), // 是否允许控制鼠标和键盘
                    read: z.boolean().optional(), // 是否允许只读访问
                    owner: z.boolean().optional(), // 是否允许管理用户
                }),
                async ({ input, kasmvncs }) => {
                    const session = kasmvncs.get(input.userId);
                    if (!session) throw new Error('userId not found');
                    if (!session.kasmvnc.api) throw new Error('KasmVNC HTTP API 未配置');
                    const response = await fetch(`${session.kasmvnc.sslOnly ? 'https' : 'http'}://127.0.0.1:${session.kasmvnc.websocketPort}/api/create_user`, {
                        method: 'POST',
                        headers: {
                            authorization: `Basic ${Buffer.from(`${session.kasmvnc.api.username}:${session.kasmvnc.api.password}`).toString('base64')}`,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({ user: input.name, password: input.password, write: input.write, read: input.read, owner: input.owner }),
                    });
                    if (!response.ok) throw new Error(`KasmVNC API ${response.status}: ${await response.text()}`);
                    return response.json();
                },
            ),

            // 代理 KasmVNC 官方 HTTP 接口：更新共享会话用户。
            'kasmvncs.get.updateUser': route(
                kasmvnc_zod.pick({ userId: true }).extend({
                    name: z.string().min(1), // 目标用户名称
                    password: z.string().min(1).optional(), // 新密码
                    write: z.boolean().optional(), // 是否允许控制鼠标和键盘
                    read: z.boolean().optional(), // 是否允许只读访问
                    owner: z.boolean().optional(), // 是否允许管理用户
                }),
                async ({ input, kasmvncs }) => {
                    const session = kasmvncs.get(input.userId);
                    if (!session) throw new Error('userId not found');
                    if (!session.kasmvnc.api) throw new Error('KasmVNC HTTP API 未配置');
                    const response = await fetch(`${session.kasmvnc.sslOnly ? 'https' : 'http'}://127.0.0.1:${session.kasmvnc.websocketPort}/api/update_user`, {
                        method: 'POST',
                        headers: {
                            authorization: `Basic ${Buffer.from(`${session.kasmvnc.api.username}:${session.kasmvnc.api.password}`).toString('base64')}`,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({ user: input.name, password: input.password, write: input.write, read: input.read, owner: input.owner }),
                    });
                    if (!response.ok) throw new Error(`KasmVNC API ${response.status}: ${await response.text()}`);
                    return response.json();
                },
            ),

            // 代理 KasmVNC 官方 HTTP 接口：移除共享会话用户。
            'kasmvncs.get.removeUser': route(
                kasmvnc_zod.pick({ userId: true }).extend({ name: z.string().min(1) }),
                async ({ input, kasmvncs }) => {
                    const session = kasmvncs.get(input.userId);
                    if (!session) throw new Error('userId not found');
                    if (!session.kasmvnc.api) throw new Error('KasmVNC HTTP API 未配置');
                    const response = await fetch(`${session.kasmvnc.sslOnly ? 'https' : 'http'}://127.0.0.1:${session.kasmvnc.websocketPort}/api/remove_user`, {
                        method: 'POST',
                        headers: {
                            authorization: `Basic ${Buffer.from(`${session.kasmvnc.api.username}:${session.kasmvnc.api.password}`).toString('base64')}`,
                            'content-type': 'application/json',
                        },
                        body: JSON.stringify({ user: input.name }),
                    });
                    if (!response.ok) throw new Error(`KasmVNC API ${response.status}: ${await response.text()}`);
                    return response.json();
                },
            ),

            // 代理 KasmVNC 官方 HTTP 接口：向所有只读用户发送完整画面。
            'kasmvncs.get.sendFullFrame': route(
                kasmvnc_zod.pick({ userId: true }),
                async ({ input, kasmvncs }) => {
                    const session = kasmvncs.get(input.userId);
                    if (!session) throw new Error('userId not found');
                    if (!session.kasmvnc.api) throw new Error('KasmVNC HTTP API 未配置');
                    const response = await fetch(`${session.kasmvnc.sslOnly ? 'https' : 'http'}://127.0.0.1:${session.kasmvnc.websocketPort}/api/send_full_frame`, {
                        headers: { authorization: `Basic ${Buffer.from(`${session.kasmvnc.api.username}:${session.kasmvnc.api.password}`).toString('base64')}` },
                    });
                    if (!response.ok) throw new Error(`KasmVNC API ${response.status}: ${await response.text()}`);
                    return response.json();
                },
            ),

            // 代理 KasmVNC 官方 HTTP 接口：清空桌面剪贴板。
            'kasmvncs.get.clearClipboard': route(
                kasmvnc_zod.pick({ userId: true }),
                async ({ input, kasmvncs }) => {
                    const session = kasmvncs.get(input.userId);
                    if (!session) throw new Error('userId not found');
                    if (!session.kasmvnc.api) throw new Error('KasmVNC HTTP API 未配置');
                    const response = await fetch(`${session.kasmvnc.sslOnly ? 'https' : 'http'}://127.0.0.1:${session.kasmvnc.websocketPort}/api/clear_clipboard`, {
                        headers: { authorization: `Basic ${Buffer.from(`${session.kasmvnc.api.username}:${session.kasmvnc.api.password}`).toString('base64')}` },
                    });
                    if (!response.ok) throw new Error(`KasmVNC API ${response.status}: ${await response.text()}`);
                    return response.json();
                },
            ),

            // 代理 KasmVNC 官方 HTTP 接口：查询下载目录。
            'kasmvncs.get.downloads': route(
                kasmvnc_zod.pick({ userId: true }).extend({ path: z.string().optional() }),
                async ({ input, kasmvncs }) => {
                    const session = kasmvncs.get(input.userId);
                    if (!session) throw new Error('userId not found');
                    if (!session.kasmvnc.api) throw new Error('KasmVNC HTTP API 未配置');
                    const url = new URL(`${session.kasmvnc.sslOnly ? 'https' : 'http'}://127.0.0.1:${session.kasmvnc.websocketPort}/api/downloads`);
                    if (input.path !== undefined) url.searchParams.set('path', input.path);
                    const response = await fetch(url, {
                        headers: { authorization: `Basic ${Buffer.from(`${session.kasmvnc.api.username}:${session.kasmvnc.api.password}`).toString('base64')}` },
                    });
                    if (!response.ok) throw new Error(`KasmVNC API ${response.status}: ${await response.text()}`);
                    return response.json();
                },
            ),

            // 代理 KasmVNC 官方 HTTP 接口：查询共享会话用户。
            'kasmvncs.get.sessions': route(
                kasmvnc_zod.pick({ userId: true }),
                async ({ input, kasmvncs }) => {
                    const session = kasmvncs.get(input.userId);
                    if (!session) throw new Error('userId not found');
                    if (!session.kasmvnc.api) throw new Error('KasmVNC HTTP API 未配置');
                    const response = await fetch(`${session.kasmvnc.sslOnly ? 'https' : 'http'}://127.0.0.1:${session.kasmvnc.websocketPort}/api/get_sessions`, {
                        headers: { authorization: `Basic ${Buffer.from(`${session.kasmvnc.api.username}:${session.kasmvnc.api.password}`).toString('base64')}` },
                    });
                    if (!response.ok) throw new Error(`KasmVNC API ${response.status}: ${await response.text()}`);
                    return response.json();
                },
            ),

            // 删除一个用户的真实 KasmVNC 会话和唯一 Chrome。
            'kasmvncs.delete': route(
                kasmvnc_zod.pick({ userId: true }),
                async ({ input, kasmvncs }) => {
                    const session = kasmvncs.get(input.userId);
                    if (!session) throw new Error('userId not found');
                    if (!session.chromeProcess.killed && session.chromeProcess.exitCode === null) session.chromeProcess.kill('SIGTERM');
                    try {
                        await promisify(execFile)('vncserver', ['-kill', session.kasmvnc.display]);
                    } catch (cause) {
                        if (!/No matching|does not exist|no such display|not running/i.test(cause instanceof Error ? cause.message : String(cause))) throw new Error(cause instanceof Error ? cause.message : String(cause));
                    }
                    kasmvncs.delete(input.userId);
                    return { userId: input.userId, deleted: true as const };
                },
            ),
        });
    });

export default protocol;
