import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { WSContext } from 'hono/ws';
import { createStore, type StateCreator } from 'zustand/vanilla';
import cwdPersist from 'zustand-lib/cwdPersist';

type Runtime = {
    readonly executable: string;
    readonly extensionPath: string;
};

type DurableInstance = {
    readonly kasmvnc: {
        readonly display: string;
        readonly websocketPort: number;
    };
    readonly chrome: {
        readonly remoteDebuggingPort: number;
    };
};

type SocketRole = 'codex' | 'chromeExtension';

class UserSession {
    readonly userId: string;
    readonly kasmvnc: DurableInstance['kasmvnc'];
    readonly chrome: DurableInstance['chrome'] & {
        readonly executable: string;
        readonly userDataDir: string;
        readonly extensionPath: string;
        readonly process: ChildProcess | null;
    };
    codex: WSContext | null = null;
    chromeExtension: WSContext | null = null;

    constructor(userId: string, instance: DurableInstance, runtime: Runtime, userDataDir: string, chromeProcess: ChildProcess | null) {
        this.userId = userId;
        this.kasmvnc = instance.kasmvnc;
        this.chrome = {
            ...instance.chrome,
            executable: runtime.executable,
            userDataDir,
            extensionPath: runtime.extensionPath,
            process: chromeProcess,
        };
    }

    setSocket(role: SocketRole, socket: WSContext) {
        if (role === 'codex') this.codex = socket;
        else this.chromeExtension = socket;
    }

    getSocket(role: SocketRole) {
        return role === 'codex' ? this.codex : this.chromeExtension;
    }

    clearSocket(socket: WSContext) {
        if (this.codex === socket) this.codex = null;
        if (this.chromeExtension === socket) this.chromeExtension = null;
    }

    hasSocket(socket: WSContext) {
        return this.codex === socket || this.chromeExtension === socket;
    }
}

const initializer = () => ({
    config: {
        vnc: {
            executable: 'vncserver',
            geometry: '1920x1080',
            localhost: 'yes' as const,
        },
        chrome: {
            executableCandidates: [
                '/snap/chromium/current/usr/lib/chromium-browser/chrome',
                '/usr/bin/google-chrome',
                '/usr/bin/chromium',
                '/usr/bin/chromium-browser',
            ] as readonly string[],
            extensionPath: fileURLToPath(new URL('../../responses-chrome-extension/dist/', import.meta.url)),
            dataRoot: fileURLToPath(new URL('../../.log/kasmvnc/', import.meta.url)),
        },
        allocation: {
            nextDisplay: 1,
            nextInternalPort: 10003,
            instances: {} as Record<string, DurableInstance>,
        },
    },
});

class Store {
    readonly sessions = new Map<string, UserSession>();
    readonly creatingSessions = new Map<string, Promise<UserSession>>();
    runtime: Runtime | null = null;
    readonly #persisted = createStore(
        cwdPersist({
            cwd: fileURLToPath(new URL('../../.log/', import.meta.url)),
            name: 'responses-kasmvnc-chrome',
            initializer,
        }) as unknown as StateCreator<ReturnType<typeof initializer>>,
    );

    get config() {
        return this.#persisted.getState().config;
    }

    reserveDisplay() {
        const display = `:${this.config.allocation.nextDisplay}`;
        this.#persisted.setState({
            config: {
                ...this.config,
                allocation: { ...this.config.allocation, nextDisplay: this.config.allocation.nextDisplay + 1 },
            },
        });
        return display;
    }

    reserveInternalPort() {
        const port = this.config.allocation.nextInternalPort;
        if (port > 65535) throw new Error('云服务内部端口已耗尽');
        this.#persisted.setState({
            config: {
                ...this.config,
                allocation: { ...this.config.allocation, nextInternalPort: port + 1 },
            },
        });
        return port;
    }

    getInstance(userId: string) {
        return this.config.allocation.instances[userId];
    }

    setInstance(userId: string, instance: DurableInstance) {
        this.#persisted.setState({
            config: {
                ...this.config,
                allocation: {
                    ...this.config.allocation,
                    instances: { ...this.config.allocation.instances, [userId]: instance },
                },
            },
        });
    }

    createSession(userId: string, instance: DurableInstance, runtime: Runtime, userDataDir: string, chromeProcess: ChildProcess | null) {
        const session = new UserSession(userId, instance, runtime, userDataDir, chromeProcess);
        this.sessions.set(userId, session);
        return session;
    }

    getSessionBySocket(socket: WSContext) {
        for (const session of this.sessions.values()) if (session.hasSocket(socket)) return session;
    }
}

const store = new Store();

export default store;
