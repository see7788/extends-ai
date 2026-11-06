/// <reference types="chrome" />

/**
 * New Tab 页面端点：替换 Chrome 新标签页。
 *
 * 这个切片可以使用 New Tab 自己的 window、document、chrome.runtime；通信对象是
 * background.service_worker。这里先用函数把可用环境和通信入口写清楚，具体 RPC
 * 路由由业务代码决定。
 */

function getEnvironment() {
    return {
        window,
        document,
        chromeRuntime: chrome.runtime,
    };
}

function getCommunicationTargets() {
    return ['background.service_worker'] as const;
}

function connectBackgroundServiceWorker(): chrome.runtime.Port {
    return chrome.runtime.connect({ name: 'chrome_url_overrides.newtab' });
}

function sendToBackgroundServiceWorker(
    port: chrome.runtime.Port,
    message: unknown,
): void {
    port.postMessage(message);
}

function onBackgroundServiceWorkerMessage(
    port: chrome.runtime.Port,
    listener: (message: unknown) => void,
): () => void {
    port.onMessage.addListener(listener);
    return () => port.onMessage.removeListener(listener);
}

export {};
