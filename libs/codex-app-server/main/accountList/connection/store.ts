import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import {
  accountConnectionRequest,
  type AccountConnectionRequestOptions,
} from "../../process.ts";

type ConnectionSlice = {
  connectionActions: {
    request<T>(options: AccountConnectionRequestOptions<T>): Promise<T>;
  };
};

const accountQueues = new Map<string, Promise<unknown>>();
const connectionStore: ImmerStateCreator<ConnectionSlice> = (set, get) => ({
  connectionActions: {
    async request<T>(options: AccountConnectionRequestOptions<T>): Promise<T> {
      const previous = accountQueues.get(options.accountId) ?? Promise.resolve();
      const current = previous.catch(() => undefined).then(
        () => accountConnectionRequest(options),
      );
      accountQueues.set(options.accountId, current);
      try {
        return await current;
      } finally {
        if (accountQueues.get(options.accountId) === current) {
          accountQueues.delete(options.accountId);
        }
      }
    },
  },
});

export default connectionStore;
