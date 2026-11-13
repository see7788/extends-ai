﻿import Base_core, {
  type context_t as context_core,
  type invokeProxy_t,
} from 'invoke-protocol';

interface Context extends context_core {
  readonly port: chrome.runtime.Port;
  readonly tabId: number | undefined;
}

export interface TabInfo {
  readonly id: number;
  readonly windowId: number;
  readonly active: boolean;
  readonly title: string;
  readonly url: string;
  readonly favIconUrl?: string;
  readonly status?: chrome.tabs.Tab['status'];
}

class Base extends Base_core<Context> {
  public override async dispatchInit(): Promise<void> {
    chrome.runtime.onConnect.addListener(port => {
      if (port.name !== 'mcp-browser-tabs') return;

      const connection = this.dispatchFromSendOn({
        sendUnknown: message => port.postMessage(message),
        onUnknown: listener => {
          const onMessage = (message: unknown): void => listener(message);
          port.onMessage.addListener(onMessage);
          return () => port.onMessage.removeListener(onMessage);
        },
        routeParam: operation => ({
          ...operation,
          port,
          tabId: port.sender?.tab?.id,
        }),
      });

      port.onDisconnect.addListener(connection.close);
    });
  }

  public invokeProxyInit(): invokeProxy_t<this['routers']> {
    const port = chrome.runtime.connect({ name: 'mcp-browser-tabs' });
    const connection = this.invokeProxyFromSendOn(
      message => port.postMessage(message),
      listener => {
        const onMessage = (message: unknown): void => listener(message);
        port.onMessage.addListener(onMessage);
        return () => port.onMessage.removeListener(onMessage);
      },
    );
    port.onDisconnect.addListener(connection.close);
    return connection.invokeProxy;
  }
}

export default new Base()
  .register(({ route, routes, zod, zodUndefined }) => routes({
    'tabs.list': route(zodUndefined, async ({ port }) => {
      void port;
      const tabs = await chrome.tabs.query({});
      return tabs.map<TabInfo>(tab => {
        if (tab.id === undefined) throw new Error('Chrome tab missing id');
        if (tab.title === undefined) throw new Error(`Chrome tab ${tab.id} missing title`);
        if (tab.url === undefined) throw new Error(`Chrome tab ${tab.id} missing URL`);
        return {
        id: tab.id,
        windowId: tab.windowId,
        active: Boolean(tab.active),
        title: tab.title,
        url: tab.url,
        ...(tab.favIconUrl ? { favIconUrl: tab.favIconUrl } : {}),
        status: tab.status,
        };
      });
    }),
    'tabs.select': route(zod.object({ tabId: zod.number() }), async ({ input }) => {
      const target = await chrome.tabs.get(input.tabId);
      if (target.url === undefined) throw new Error(`Chrome tab ${input.tabId} missing URL`);
      if (target.url.startsWith('chrome://') || target.url.startsWith('chrome-extension://')) {
        throw new Error(`无法在浏览器内部页面打开扩展面板: ${target.url}`);
      }
      await chrome.tabs.update(input.tabId, { active: true });
      await chrome.tabs.sendMessage(input.tabId, { type: 'panel.open' });
      return true as const;
    }),
    'tabs.create': route(
      zod.object({
        url: zod.string().optional(),
        active: zod.boolean().optional(),
      }),
      ({ input }) => chrome.tabs.create(input),
    ),
    'tabs.close': route(
      zod.object({ tabId: zod.number() }),
      async ({ input }) => {
        await chrome.tabs.remove(input.tabId);
        return true as const;
      },
    ),
  }));
