﻿import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import 'antd/dist/reset.css';
import './styles.css';
import { Alert, Button, Drawer, Empty, FloatButton, Input, List, Space, Spin, Tooltip, Typography } from 'antd';
import { CloseOutlined, LinkOutlined, PlusOutlined, WindowsOutlined } from '@ant-design/icons';
import endpoint, { type TabInfo } from '../background.service_worker/invoke-protocol.ts';
import logoUrl from '../assets/extends-logo-24.png?inline';
import maskLogoUrl from '../assets/extends-logo.png?inline';
import Hyperspeed from 'react-src/Hyperspeed';

const invokeProxy = endpoint.invokeProxyInit();

function App() {
  const [open, setOpen] = useState(false);
  const [tabs, setTabs] = useState<TabInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [url, setUrl] = useState('');
  const [busyTabId, setBusyTabId] = useState<number>();
  const [error, setError] = useState<string>();

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      setTabs(await invokeProxy.tabs.list());
    } catch (reason) {
      setTabs([]);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const onTabsChanged = (message: unknown) => {
      if (message && typeof message === 'object' && 'type' in message && message.type === 'panel.open') {
        setOpen(true);
        return;
      }
      if (open) void refresh();
    };
    chrome.runtime.onMessage.addListener(onTabsChanged);
    return () => chrome.runtime.onMessage.removeListener(onTabsChanged);
  }, [open, refresh]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const createTab = async () => {
    const value = url.trim();
    setBusyTabId(-1);
    try {
      await invokeProxy.tabs.create(value ? { url: value, active: true } : { active: true });
      setUrl('');
      await refresh();
    } finally { setBusyTabId(undefined); }
  };

  const selectTab = async (tabId: number) => {
    setBusyTabId(tabId);
    try { await invokeProxy.tabs.select({ tabId }); await refresh(); }
    finally { setBusyTabId(undefined); }
  };

  const closeTab = async (tabId: number) => {
    setBusyTabId(tabId);
    try { await invokeProxy.tabs.close({ tabId }); await refresh(); }
    finally { setBusyTabId(undefined); }
  };

  return <>
    {!open && <FloatButton shape="square" icon={<img className="mcp-browser-tabs-logo" src={logoUrl} alt="" />} onClick={() => setOpen(true)} />}
    {open && <div className="mcp-browser-tabs-global-aurora"><Hyperspeed /></div>}
    <Drawer className="mcp-browser-tabs-drawer" title={null} closable={false} maskClosable maskStyle={{ backgroundColor: 'rgba(0, 0, 0, 0.82)', backgroundImage: `url(${maskLogoUrl})`, backgroundRepeat: 'no-repeat', backgroundSize: 'min(70vw, 520px) min(70vw, 520px)', backgroundPosition: 'center' }} placement="right" width={380} open={open} onClose={() => setOpen(false)} getContainer={false} styles={{ header: { display: 'none' }, content: { height: '100%', background: 'transparent' }, body: { height: '100%', padding: 20, display: 'flex', flexDirection: 'column', background: 'transparent' } }}>
      <div className="mcp-browser-tabs-layout">
        {error && <Alert type="error" showIcon message="标签列表加载失败" description={error} />}
        {loading && tabs.length === 0 ? <Spin /> : tabs.length === 0 ? <Empty description="没有可用标签" /> : <List className="mcp-browser-tabs-list" size="small" dataSource={tabs} renderItem={tab => <List.Item
          onClick={() => void selectTab(tab.id)}
          style={{ cursor: 'pointer' }}
          actions={[
            <Tooltip title="关闭" key="close"><Button type="text" danger icon={<CloseOutlined />} loading={busyTabId === tab.id} onClick={event => { event.stopPropagation(); void closeTab(tab.id); }} /></Tooltip>,
          ]}
        ><List.Item.Meta avatar={tab.favIconUrl ? <img src={tab.favIconUrl} width={16} height={16} alt="" /> : <WindowsOutlined />} title={<Typography.Text strong={tab.active} ellipsis>{tab.title}</Typography.Text>} description={<Typography.Text type="secondary" ellipsis>{tab.url}</Typography.Text>} /></List.Item>} />} 
        <Space.Compact className="mcp-browser-tabs-footer" style={{ width: '100%' }}>
          <Input value={url} onChange={event => setUrl(event.target.value)} onPressEnter={() => void createTab()} placeholder="输入网址，新建标签" prefix={<LinkOutlined />} />
          <Button type="primary" icon={<PlusOutlined />} onClick={() => void createTab()} loading={busyTabId === -1} />
        </Space.Compact>
      </div>
    </Drawer>
  </>;
}

const root = document.createElement('div');
root.id = 'mcp-browser-tabs-root';
root.style.cssText = [
  'all:initial',
  'display:block',
  'position:fixed',
  'inset:0',
  'z-index:2147483646',
  'isolation:isolate',
  'pointer-events:none',
].join(';');
document.documentElement.append(root);
const mount = document.createElement('div');
mount.style.cssText = 'all:initial;display:block;pointer-events:auto;';
root.append(mount);
createRoot(mount).render(<App />);



