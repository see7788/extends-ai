﻿# peerjs-create-token

React + Ant Design 的浏览器 PeerJS 字符串收发节点。

## 运行

在仓库根目录执行：

```powershell
pnpm --filter peerjs-create-token dev
```

打开 `http://127.0.0.1:11402/`。

## Vite 插件与 devPort

`devPort = 11402` 是本项目自己的开发端口，不是 PeerJS signaling server 端口。

- `new Peerjs().vitePlugin(devPort)`：准备 PeerJS 服务，并将 endpoint 合并到当前项目端口状态。
- `new Ports(devPort).writeFilePlugin()`：生成 `src/declare/declare.ts`，提供 PeerJS endpoint。Peer ID 不注入配置，由 PeerJS 库在运行时自动分配。

两个插件传入相同 devPort。PeerJS 的 host、port、path、key、secure、ICE servers 都从 `declare.peerjs` 获取，不在前端硬编码。

## 页面

- PeerJS 库自动分配 Peer ID；页面显示实际分配的 ID 和完整连接 URL。
- 每个页面会话生成 256 bit 随机 token，并放入连接 URL；接收连接时通过 PeerJS `connection.metadata` 验证 token，不匹配就立即关闭连接。
- 输入字符串并发送给已连接的 PeerJS 客户端。
- 收到字符串后原样显示。

## 通信约定

PeerJS DataConnection 只收发 string：

- 收到什么字符串，就显示什么字符串。
- 输入什么字符串，就直接 send 什么字符串。

不解析 JSON，不包装对象，不添加 id/type，不定义结束标记或业务协议。浏览器页面仅作为可视化测试节点。
