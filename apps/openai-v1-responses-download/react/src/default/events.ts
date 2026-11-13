﻿import type { installTask_t, peerStatus_t } from "openai-v1-responses-download-hono/default/rpc";

type EventHandlers = {
  install?: (task: installTask_t) => void;
  peerStatus?: (status: peerStatus_t) => void;
};

class DefaultEventsConsumer {
  subscribe(handlers: EventHandlers): () => void {
    // The server resolves the current task; the browser does not own task identity.
    const source = new EventSource("/events");
    source.addEventListener("install", event => {
      try {
        handlers.install?.(JSON.parse((event as MessageEvent<string>).data) as installTask_t);
      } catch {
        // Ignore malformed events. EventSource handles reconnects.
      }
    });
    source.addEventListener("peer-status", event => {
      try {
        handlers.peerStatus?.(JSON.parse((event as MessageEvent<string>).data) as peerStatus_t);
      } catch {
        // Ignore malformed events. EventSource handles reconnects.
      }
    });
    return () => source.close();
  }
}

export default new DefaultEventsConsumer();
