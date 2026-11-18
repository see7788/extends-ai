openai-v1-responses/
├─ package.json
│  ├─ pnpm-workspace
│  ├─ workspace-scripts
│  └─ typescript
├─ pnpm-workspace.yaml
│  ├─ hono
│  └─ chrome-extension
├─ tsconfig.base.json
│  ├─ typescript
│  └─ node
├─ hono/
│  ├─ package.json
│  │  ├─ typescript
│  │  ├─ node
│  │  ├─ hono
│  │  └─ hono-websocket-adapter
│  ├─ tsconfig.json
│  ├─ config/
│  │  └─ codex-provider.toml
│  │     ├─ model_provider
│  │     ├─ model_providers.chatgpt_web
│  │     ├─ base_url
│  │     ├─ wire_api
│  │     ├─ requires_openai_auth
│  │     ├─ supports_websockets
│  │     ├─ model_providers.chatgpt_web.auth
│  │     ├─ command
│  │     ├─ args
│  │     └─ refresh_interval_ms
│  └─ src/
│     ├─ index.ts
│     │  ├─ startServer
│     │  ├─ stopServer
│     │  └─ ServerRuntime
│     ├─ app.ts
│     │  ├─ createApp
│     │  ├─ registerHealthRoute
│     │  ├─ registerAuthRoute
│     │  ├─ registerCodexRoute
│     │  └─ registerExtensionRoute
│     ├─ routes/
│     │  ├─ health.ts
│     │  │  ├─ GET /health
│     │  │  └─ HealthStatus
│     │  ├─ auth-refresh.ts
│     │  │  ├─ POST /auth/refresh-jwt
│     │  │  ├─ verifyRefreshJwt
│     │  │  ├─ issueAccessToken
│     │  │  ├─ RefreshJwtRequest
│     │  │  └─ AccessTokenClaims
│     │  ├─ codex-responses.ts
│     │  │  ├─ WS /codex/responses
│     │  │  ├─ authenticateConnection
│     │  │  ├─ openResponseSession
│     │  │  ├─ forwardResponseCreate
│     │  │  ├─ forwardResponseCancel
│     │  │  ├─ closeResponseSession
│     │  │  ├─ CodexConnection
│     │  │  └─ CodexResponseSession
│     │  └─ extension-runtime.ts
│     │     ├─ WS /extension/runtime
│     │     ├─ authenticateExtension
│     │     ├─ registerExtension
│     │     ├─ unregisterExtension
│     │     ├─ receiveExtensionEvent
│     │     └─ ExtensionConnection
│     ├─ runtime/
│     │  ├─ runtime-registry.ts
│     │  │  ├─ register
│     │  │  ├─ find
│     │  │  ├─ remove
│     │  │  ├─ heartbeat
│     │  │  └─ UserRuntime
│     │  ├─ runtime-session.ts
│     │  │  ├─ bindCodexConnection
│     │  │  ├─ bindExtensionConnection
│     │  │  ├─ forwardRequest
│     │  │  ├─ forwardEvent
│     │  │  ├─ cancelRequest
│     │  │  └─ UserRuntimeSession
│     │  └─ runtime-resources.ts
│     │     ├─ kasmvnc
│     │     ├─ chrome
│     │     ├─ chrome_extension
│     │     └─ RuntimeResourceState
│     ├─ auth/
│     │  ├─ token-service.ts
│     │  │  ├─ verifyRefreshToken
│     │  │  ├─ issueAccessToken
│     │  │  ├─ verifyAccessToken
│     │  │  ├─ RefreshTokenClaims
│     │  │  └─ AccessTokenClaims
│     │  └─ auth-config.ts
│     │     ├─ loadAuthConfig
│     │     └─ AuthConfig
│     ├─ protocol/
│     │  ├─ codex-responses.ts
│     │  │  ├─ ResponseCreateRequest
│     │  │  ├─ ResponseCancelRequest
│     │  │  ├─ ResponseEvent
│     │  │  ├─ ResponseOutputTextDelta
│     │  │  ├─ ResponseCompleted
│     │  │  └─ ResponseError
│     │  ├─ extension-runtime.ts
│     │  │  ├─ ExtensionHello
│     │  │  ├─ RuntimeHeartbeat
│     │  │  ├─ WebChatRequest
│     │  │  ├─ WebChatStreamChunk
│     │  │  ├─ WebChatCompleted
│     │  │  └─ WebChatError
│     │  └─ protocol-codec.ts
│     │     ├─ encodeMessage
│     │     ├─ decodeMessage
│     │     └─ ProtocolMessage
│     ├─ webchat/
│     │  ├─ webchat-adapter.ts
│     │  │  ├─ sendRequest
│     │  │  ├─ cancelRequest
│     │  │  ├─ translateRequest
│     │  │  ├─ translateStreamChunk
│     │  │  └─ WebChatAdapterState
│     │  └─ webchat-session.ts
│     │     ├─ create
│     │     ├─ close
│     │     ├─ acceptChunk
│     │     └─ WebChatSession
│     └─ config/
│        ├─ config.ts
│        │  ├─ loadConfig
│        │  ├─ validateConfig
│        │  └─ HonoConfig
│        └─ routes.ts
│           ├─ codex
│           ├─ extension
│           ├─ auth_refresh
│           └─ health
└─ chrome-extension/
   ├─ package.json
   │  ├─ typescript
   │  ├─ chrome-extension-manifest
   │  └─ build-scripts
   ├─ tsconfig.json
   ├─ manifest.json
   │  ├─ manifest_version
   │  ├─ background.service_worker
   │  ├─ permissions.debugger
   │  ├─ permissions.storage
   │  ├─ host_permissions
   │  └─ content_security_policy
   └─ src/
      ├─ background.ts
      │  ├─ start
      │  ├─ stop
      │  ├─ handleGatewayCommand
      │  └─ ExtensionRuntime
      ├─ gateway/
      │  ├─ websocket.ts
      │  │  ├─ connect
      │  │  ├─ reconnect
      │  │  ├─ send
      │  │  ├─ close
      │  │  └─ GatewayConnection
      │  └─ protocol.ts
      │     ├─ encode
      │     ├─ decode
      │     ├─ GatewayCommand
      │     ├─ GatewayEvent
      │     └─ ExtensionIdentity
      ├─ chrome/
      │  ├─ debugger-session.ts
      │  │  ├─ attach
      │  │  ├─ detach
      │  │  ├─ sendCommand
      │  │  └─ DebuggerSession
      │  ├─ network-observer.ts
      │  │  ├─ start
      │  │  ├─ stop
      │  │  ├─ requestWillBeSent
      │  │  ├─ responseReceived
      │  │  ├─ loadingFinished
      │  │  ├─ loadingFailed
      │  │  └─ NetworkRequest
      │  └─ response-body.ts
      │     ├─ readResponseBody
      │     ├─ readStreamChunk
      │     └─ ResponseBody
      ├─ webchat/
      │  ├─ matcher.ts
      │  │  ├─ matchRequest
      │  │  ├─ matchResponse
      │  │  └─ WebChatRoutePattern
      │  ├─ request-forwarder.ts
      │  │  ├─ forwardRequest
      │  │  ├─ cancelRequest
      │  │  └─ ForwardingRequest
      │  ├─ response-parser.ts
      │  │  ├─ parseResponse
      │  │  ├─ parseStream
      │  │  ├─ toWebChatEvent
      │  │  └─ WebChatEvent
      │  └─ site-profile.ts
      │     ├─ requestPattern
      │     ├─ responsePattern
      │     ├─ streamFormat
      │     └─ WebChatSiteProfile
      └─ storage/
         ├─ settings.ts
         │  ├─ readSettings
         │  ├─ writeSettings
         │  └─ ExtensionSettings
         └─ session.ts
            ├─ readSession
            ├─ writeSession
            └─ ExtensionSession