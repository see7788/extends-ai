/// <reference types="chrome" />

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

type PageMessage =
  | { type: "topic.changed"; topicId?: string; href: string }
  | { type: "chat.snapshot"; requestId: string; snapshot: PageSnapshot }
  | { type: "chat.completed"; requestId: string; snapshot: PageSnapshot }
  | { type: "chat.error"; requestId: string; message: string };

let activeRequestId: string | undefined;
let baselineAssistantCount = 0;
let lastSnapshot = "";
let lastTopicId: string | undefined;
let observer: MutationObserver | undefined;
let completionTimer: ReturnType<typeof setTimeout> | undefined;

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

const backgroundSend = (data: PageMessage): void => {
  void chrome.runtime.sendMessage({ type: "page.message", data }).catch(() => undefined);
};

const topicReport = (snapshot: PageSnapshot): void => {
  if (snapshot.topicId === lastTopicId) return;
  lastTopicId = snapshot.topicId;
  backgroundSend({ type: "topic.changed", topicId: snapshot.topicId, href: snapshot.href });
};

const responseReport = (): void => {
  const snapshot = snapshotRead();
  topicReport(snapshot);
  if (!activeRequestId || snapshot.assistantCount <= baselineAssistantCount) return;
  const serialized = JSON.stringify(snapshot);
  if (serialized !== lastSnapshot) {
    lastSnapshot = serialized;
    backgroundSend({ type: "chat.snapshot", requestId: activeRequestId, snapshot });
  }

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
    const requestId = activeRequestId;
    activeRequestId = undefined;
    backgroundSend({ type: "chat.completed", requestId, snapshot: finalSnapshot });
  }, 900);
};

const observerStart = (): void => {
  if (observer || !document.documentElement) return;
  observer = new MutationObserver(() => responseReport());
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });
  responseReport();
};

const userSubmitMark = (): void => {
  if (activeRequestId) return;
  const input = document.querySelector<HTMLElement>(
    "#prompt-textarea, [data-testid='prompt-textarea'], textarea",
  );
  const draft = input instanceof HTMLTextAreaElement ? input.value : input?.innerText;
  if (!draft?.trim()) return;
  activeRequestId = crypto.randomUUID();
  baselineAssistantCount = document.querySelectorAll('[data-message-author-role="assistant"]').length;
  lastSnapshot = "";
};

document.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="发送"]')) {
    userSubmitMark();
  }
}, true);

document.addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest("#prompt-textarea, [data-testid='prompt-textarea'], textarea")) userSubmitMark();
}, true);

const inputWrite = async (message: string): Promise<void> => {
  const deadline = Date.now() + 15_000;
  let input: HTMLElement | null = null;
  while (Date.now() < deadline) {
    input = document.querySelector<HTMLElement>(
      "#prompt-textarea, [data-testid='prompt-textarea'], textarea",
    );
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
  baselineAssistantCount = document.querySelectorAll('[data-message-author-role="assistant"]').length;
  lastSnapshot = "";
  const sendButton = document.querySelector<HTMLButtonElement>(
    '[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="发送"]',
  );
  if (!sendButton || sendButton.disabled) throw new Error("ChatGPT send button is unavailable");
  sendButton.click();
};

const messageHandle = async (value: unknown): Promise<void> => {
  if (!value || typeof value !== "object" || !("type" in value)) return;
  const message = value as { type: string; requestId?: string; text?: string; topicId?: string };
  if (message.type === "chat.submit" && message.requestId && typeof message.text === "string") {
    try {
      await inputWrite(message.text);
    } catch (error) {
      activeRequestId = undefined;
      backgroundSend({
        type: "chat.error",
        requestId: message.requestId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }
  if (message.type === "topic.select" && message.topicId) {
    location.assign(`https://chatgpt.com/c/${encodeURIComponent(message.topicId)}`);
  }
};

chrome.runtime.onMessage.addListener(message => {
  void messageHandle(message);
});

const initialSnapshot = snapshotRead();
void chrome.runtime.sendMessage({ type: "page.ready", snapshot: initialSnapshot }).catch(() => undefined);
observerStart();

export {};
