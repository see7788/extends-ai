/// <reference types="chrome" />

import { create } from "remote-desktop-commander-chatgpt-com-peerjs";
import { publishTopic, publishTopicClosed } from "remote-desktop-commander-chatgpt-com-peerjs/bridge";

type PageSnapshot = {
  href: string;
  topicId?: string;
  assistantCount: number;
  userCount: number;
  text: string;
  streaming: boolean;
  ready: boolean;
  draft: string;
};

let chat: Awaited<ReturnType<typeof create>> | undefined;
let connected = false;
let instanceId = new URL(location.href).searchParams.get("rdcInstanceId") ?? "";
let publishedTopicId = "";
let publishInFlight = false;

const topicPublish = async (): Promise<void> => {
  const topicId = snapshotRead().topicId;
  if (!instanceId || !topicId || !chat || publishedTopicId === topicId || publishInFlight) return;
  publishInFlight = true;
  let failed = false;
  try {
    if (publishedTopicId && publishedTopicId !== topicId) {
      await publishTopicClosed(instanceId, publishedTopicId);
    }
    await publishTopic(instanceId, topicId, chat.address);
    publishedTopicId = topicId;
  } catch (error) {
    failed = true;
    console.error("VNC topic bridge publish failed:", error);
    setTimeout(() => void topicPublish(), 1500);
  } finally {
    publishInFlight = false;
    if (!failed && snapshotRead().topicId && snapshotRead().topicId !== publishedTopicId) setTimeout(() => void topicPublish(), 0);
  }
};

void chrome.storage.local.get("rdcInstanceId").then(value => {
  if (!instanceId && typeof value.rdcInstanceId === "string") instanceId = value.rdcInstanceId;
  if (instanceId) void chrome.storage.local.set({ rdcInstanceId: instanceId });
  void topicPublish();
});
let connectError = "";
let activeRequestId: string | undefined;
let activeRequestTopicId: string | undefined;
let baselineAssistantCount = 0;
let lastTopicId: string | undefined;
let observer: MutationObserver | undefined;
let completionTimer: ReturnType<typeof setTimeout> | undefined;
const bootstrappedTopics = new Set<string>();
const bootstrappingTopics = new Set<string>();

const snapshotRead = (): PageSnapshot => {
  const assistants = [...document.querySelectorAll<HTMLElement>('[data-message-author-role="assistant"]')];
  const users = [...document.querySelectorAll<HTMLElement>('[data-message-author-role="user"]')];
  const lastAssistant = assistants.at(-1);
  const input = document.querySelector<HTMLElement>("#prompt-textarea, [data-testid='prompt-textarea'], textarea");
  const topicId = location.pathname.match(/\/c\/([a-zA-Z0-9-]+)/)?.[1];

  return {
    href: location.href,
    topicId,
    assistantCount: assistants.length,
    userCount: users.length,
    text: lastAssistant?.innerText || lastAssistant?.textContent || "",
    streaming: Boolean(document.querySelector('[data-testid="stop-button"], button[aria-label*="Stop"], button[aria-label*="停止"]')),
    ready: Boolean(input),
    draft: input instanceof HTMLTextAreaElement ? input.value : input?.innerText ?? "",
  };
};

const inputWrite = async (message: string): Promise<void> => {
  const deadline = Date.now() + 15_000;
  let input: HTMLElement | null = null;
  while (Date.now() < deadline) {
    input = document.querySelector<HTMLElement>("#prompt-textarea, [data-testid='prompt-textarea'], textarea");
    if (input) break;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  if (!input) throw new Error("ChatGPT prompt input not found");

  input.focus();
  if (input instanceof HTMLTextAreaElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(input, message);
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: message }));
  } else {
    input.replaceChildren(document.createTextNode(message));
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: message }));
  }

  activeRequestId = crypto.randomUUID();
  activeRequestTopicId = snapshotRead().topicId;
  baselineAssistantCount = document.querySelectorAll('[data-message-author-role="assistant"]').length;
  await new Promise(resolve => setTimeout(resolve, 100));
  const sendButton = document.querySelector<HTMLButtonElement>(
    '[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="发送"]',
  );
  if (!sendButton || sendButton.disabled) {
    activeRequestId = undefined;
    activeRequestTopicId = undefined;
    throw new Error("ChatGPT send button is unavailable");
  }
  sendButton.click();
};

const bootstrapTopic = async (topicId?: string): Promise<void> => {
  const snapshot = snapshotRead();
  if (!topicId || !chat || !connected || !chat.isConnected || activeRequestId || snapshot.streaming || bootstrappedTopics.has(topicId) || bootstrappingTopics.has(topicId)) return;
  bootstrappingTopics.add(topicId);
  try {
    const { tools } = await chat.tools();
    const prompt = [
      "你可以使用本机 Desktop Commander 工具完成用户任务。",
      "需要调用工具时，整条回复只能是一个 <rdc-tool-call>...</rdc-tool-call> 标记，内部必须是 JSON，不得附带其他文字或 Markdown 代码围栏。",
      "格式：<rdc-tool-call>{\"name\":\"tool_name\",\"arguments\":{}}</rdc-tool-call>",
      "收到 <rdc-tool-result>...</rdc-tool-result> 后，依据结果继续任务；需要更多工具时再输出下一次调用。普通回答直接正常回复。",
      "每次只调用一个工具。不要伪造工具结果。",
      "可用工具：",
      JSON.stringify(tools),
    ].join("\n\n");
    const latest = snapshotRead();
    if (latest.topicId !== topicId || latest.streaming || activeRequestId || latest.draft.trim()) return;
    await inputWrite(prompt);
    bootstrappedTopics.add(topicId);
  } catch (error) {
    connectError = error instanceof Error ? error.message : String(error);
    console.error("Desktop Commander bootstrap failed:", error);
  } finally {
    bootstrappingTopics.delete(topicId);
  }
};

const toolCallHandle = async (text: string): Promise<void> => {
  const match = text.trim().match(/^<rdc-tool-call>([\s\S]*?)<\/rdc-tool-call>$/);
  if (!match) return;
  let request: { name?: unknown; arguments?: unknown };
  try {
    request = JSON.parse(match[1] ?? "") as { name?: unknown; arguments?: unknown };
  } catch {
    await inputWrite("<rdc-tool-result>{\"isError\":true,\"error\":\"Invalid tool-call JSON\"}</rdc-tool-result>\n请修正工具调用格式后继续。");
    return;
  }
  if (typeof request.name !== "string" || !request.name) {
    await inputWrite("<rdc-tool-result>{\"isError\":true,\"error\":\"Missing tool name\"}</rdc-tool-result>\n请检查工具名称后继续。");
    return;
  }
  if (!chat || !connected || !chat.isConnected) {
    await inputWrite("<rdc-tool-result>{\"isError\":true,\"error\":\"Desktop Commander is not connected\"}</rdc-tool-result>\n请告知用户工具连接尚未建立。");
    return;
  }

  const args = request.arguments && typeof request.arguments === "object" && !Array.isArray(request.arguments)
    ? request.arguments as Record<string, unknown>
    : {};
  try {
    const result = await chat.call(request.name, args);
    await inputWrite([
      "<rdc-tool-result>",
      JSON.stringify({ name: request.name, result }),
      "</rdc-tool-result>",
      "请根据工具结果继续完成用户任务；如需工具，按约定格式继续调用。",
    ].join("\n"));
  } catch (error) {
    await inputWrite([
      "<rdc-tool-result>",
      JSON.stringify({ name: request.name, isError: true, error: error instanceof Error ? error.message : String(error) }),
      "</rdc-tool-result>",
      "请分析错误并决定如何继续。",
    ].join("\n"));
  }
};

const responseReport = (): void => {
  const snapshot = snapshotRead();
  if (snapshot.topicId !== lastTopicId) {
    const previousTopicId = lastTopicId;
    lastTopicId = snapshot.topicId;
    if (activeRequestId) {
      if (activeRequestTopicId === undefined && previousTopicId === undefined && snapshot.topicId) {
        activeRequestTopicId = snapshot.topicId;
      } else if (activeRequestTopicId !== snapshot.topicId) {
        activeRequestId = undefined;
        activeRequestTopicId = undefined;
      }
    }
    if (completionTimer) clearTimeout(completionTimer);
    completionTimer = undefined;
  }

  if (snapshot.topicId) void topicPublish();
  if (snapshot.topicId && !snapshot.streaming && !activeRequestId && !snapshot.draft.trim() &&
      !bootstrappedTopics.has(snapshot.topicId)) {
    void bootstrapTopic(snapshot.topicId);
  }

  if (!activeRequestId || snapshot.assistantCount <= baselineAssistantCount) return;
  if (snapshot.streaming) {
    if (completionTimer) clearTimeout(completionTimer);
    completionTimer = undefined;
    return;
  }
  if (!snapshot.text) return;
  if (completionTimer) clearTimeout(completionTimer);
  completionTimer = setTimeout(() => {
    const finalSnapshot = snapshotRead();
    if (finalSnapshot.streaming || !activeRequestId || finalSnapshot.assistantCount <= baselineAssistantCount) return;
    activeRequestId = undefined;
    activeRequestTopicId = undefined;
    if (/^<rdc-tool-call>[\s\S]*<\/rdc-tool-call>$/.test(finalSnapshot.text.trim())) {
      void toolCallHandle(finalSnapshot.text);
    } else if (finalSnapshot.topicId) {
      void bootstrapTopic(finalSnapshot.topicId);
    }
  }, 900);
};

const userSubmitMark = (): void => {
  if (activeRequestId) return;
  const input = document.querySelector<HTMLElement>("#prompt-textarea, [data-testid='prompt-textarea'], textarea");
  const draft = input instanceof HTMLTextAreaElement ? input.value : input?.innerText;
  if (!draft?.trim()) return;
  activeRequestTopicId = snapshotRead().topicId;
  activeRequestId = crypto.randomUUID();
  baselineAssistantCount = document.querySelectorAll('[data-message-author-role="assistant"]').length;
};

document.addEventListener("submit", event => {
  const target = event.target;
  if (target instanceof HTMLFormElement && target.querySelector("#prompt-textarea, [data-testid='prompt-textarea'], textarea")) {
    userSubmitMark();
  }
}, true);

document.addEventListener("click", event => {
  const target = event.target;
  if (target instanceof Element && target.closest('[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="发送"]')) userSubmitMark();
}, true);
document.addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  const target = event.target;
  if (target instanceof Element && target.closest("#prompt-textarea, [data-testid='prompt-textarea'], textarea")) userSubmitMark();
}, true);

const observerStart = (): void => {
  if (observer || !document.documentElement) return;
  observer = new MutationObserver(responseReport);
  observer.observe(document.documentElement, { childList: true, characterData: true, subtree: true });
  responseReport();
};

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) return;
  if (message.type === "rdc.state") {
    sendResponse({
      peerId: chat?.peerId,
      address: chat?.address,
      connected: connected && Boolean(chat?.isConnected),
      error: connectError,
      topicId: snapshotRead().topicId,
    });
  }
});

void create().then(instance => {
  chat = instance;
  void topicPublish();
  void chat.connected().then(() => {
    connected = true;
    void topicPublish();
    void bootstrapTopic(snapshotRead().topicId);
  }).catch(error => {
    connectError = error instanceof Error ? error.message : String(error);
    console.error("Desktop Commander PeerJS connection failed:", error);
  });
}).catch(error => {
  connectError = error instanceof Error ? error.message : String(error);
  console.error("ChatGPT PeerJS initialization failed:", error);
});

observerStart();
window.addEventListener("pagehide", () => {
  const topicId = snapshotRead().topicId;
  if (instanceId && topicId) void publishTopicClosed(instanceId, topicId);
}, { once: true });
export {};
