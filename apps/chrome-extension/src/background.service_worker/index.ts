﻿import endpoint from './invoke-protocol.ts';

// Service Worker 启动阶段不要使用顶层 await；部分 Chrome 版本会因此让模块初始化失败。
void endpoint.dispatchInit();

