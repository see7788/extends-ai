/// <reference types="chrome" />
import { createRoot } from "react-dom/client";
import { useEffect, useMemo, useState } from "react";
type PageState = { peerId?: string; address?: string; connected: boolean; error?: string; topicId?: string };
type ChatTab = { id: number; title: string; active: boolean; state?: PageState };
function PairPopup() {
  const [tabs, setTabs] = useState<ChatTab[]>([]);
  const [filter, setFilter] = useState("");
  const [status, setStatus] = useState("正在读取 ChatGPT 标签页…");
  const refresh = async () => {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    const all = await chrome.tabs.query({});
    const chatTabs = all.filter(tab => tab.id !== undefined && /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(tab.url ?? ""));
    const rows = await Promise.all(chatTabs.map(async tab => {
      let state: PageState | undefined;
      try { state = await chrome.tabs.sendMessage(tab.id!, { type: "rdc.state" }) as PageState; } catch { /* content script not ready */ }
      return { id: tab.id!, title: tab.title || "ChatGPT", active: tab.id === active?.id, state };
    }));
    setTabs(rows);
    setStatus(rows.length ? String(rows.length) + " 个 ChatGPT 话题" : "当前浏览器没有 ChatGPT 标签页");
  };
  useEffect(() => { void refresh(); }, []);
  const visibleTabs = useMemo(() => {
    const keyword = filter.trim().toLocaleLowerCase();
    return keyword ? tabs.filter(tab => tab.title.toLocaleLowerCase().includes(keyword) || (tab.state?.topicId ?? "").includes(keyword)) : tabs;
  }, [tabs, filter]);
  const newTopic = async () => {
    const { rdcInstanceId } = await chrome.storage.local.get("rdcInstanceId");
    if (typeof rdcInstanceId !== "string" || !rdcInstanceId) { setStatus("Chromium 未配置 rdcInstanceId，请由 global 启动时注入"); return; }
    const url = new URL("https://chatgpt.com/");
    url.searchParams.set("rdcInstanceId", rdcInstanceId);
    await chrome.tabs.create({ url: url.toString() });
    await refresh();
  };
  const activate = async (id: number) => {
    await chrome.tabs.update(id, { active: true });
    const tab = await chrome.tabs.get(id);
    if (tab.windowId !== undefined) await chrome.windows.update(tab.windowId, { focused: true });
    await refresh();
  };
  const close = async (id: number) => { await chrome.tabs.remove(id); await refresh(); };
  const copy = async (state?: PageState) => {
    if (!state?.address) return;
    await navigator.clipboard.writeText(state.address);
    setStatus("PeerJS 地址已复制");
  };
  return (
    <main style={{ width: 390, padding: 12, color: "#222", fontFamily: "system-ui" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
        <strong>Remote Desktop Commander</strong><button onClick={() => void newTopic()}>＋ 新建话题</button>
      </header>
      <p style={{ margin: "8px 0", fontSize: 12, color: "#666" }}>{status}</p>
      <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="搜索话题标题 / ID" style={{ boxSizing: "border-box", width: "100%", padding: 7 }} />
      <section style={{ display: "grid", gap: 6, marginTop: 10, maxHeight: 430, overflow: "auto" }}>
        {visibleTabs.map(tab => (
          <article key={tab.id} style={{ padding: 8, border: "1px solid #ddd", borderRadius: 6, background: tab.active ? "#f0f5ff" : "#fff" }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={tab.title}>{tab.title}</span>
              <span style={{ fontSize: 10, color: tab.state?.connected ? "#16803c" : "#888" }}>{tab.state?.connected ? "Peer 就绪" : tab.state ? "连接中" : "页面加载中"}</span>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
              <button onClick={() => void activate(tab.id)} disabled={tab.active}>切换</button>
              <button onClick={() => void copy(tab.state)} disabled={!tab.state?.address}>复制 Peer</button>
              <button onClick={() => void close(tab.id)}>关闭</button>
            </div>
          </article>
        ))}
        {!visibleTabs.length && <p style={{ fontSize: 12, color: "#888" }}>没有匹配的话题</p>}
      </section>
      <footer style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
        <span style={{ fontSize: 11, color: "#777" }}>每个话题独立 PeerJS / Runtime</span><button onClick={() => void refresh()}>刷新</button>
      </footer>
    </main>
  );
}
const root = document.getElementById("app");
if (!root) throw new Error("Extension popup root is missing");
createRoot(root).render(<PairPopup />);
