/// <reference types="chrome" />

/**
 * DevTools 页面端点：打开 Chrome DevTools 后由扩展加载。
 *
 * 这个切片可以使用 window、document、chrome.devtools、chrome.runtime；通信对象是
 * background.service_worker。这里先用函数把可用环境和通信入口写清楚。
 */

function getEnvironment() {
    return {
        window,
        document,
        chromeRuntime: chrome.runtime,
        chromeDevtools: chrome.devtools,
    };
}

function getCommunicationTargets() {
    return ['background.service_worker'] as const;
}

function connectBackgroundServiceWorker(): chrome.runtime.Port {
    return chrome.runtime.connect({ name: 'devtools_page' });
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
