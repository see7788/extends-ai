import store from "../../store.ts";
import type { AuthJsonCreateInput } from "./store.ts";

const create = async (input: {
  carrier: AuthJsonCreateInput;
}) => {
  const browserActions = store.getState().browserActions;
  const application = await browserActions.applicationRead({
    browserId: input.carrier.browserId,
  });
  let opened: Awaited<ReturnType<typeof browserActions.windowOpen>> | undefined;
  try {
    const source = await store.getState().authJsonCreateActions.create({
      browserId: input.carrier.browserId,
      openAuthUrl: async (authUrl, signal) => {
        opened = await browserActions.windowOpen(
          application.executablePath,
          authUrl,
          application.launchArguments,
          signal,
        );
        void opened.closed.then(
          () => store.getState().authJsonCreateActions.cancel(),
          () => store.getState().authJsonCreateActions.cancel(),
        );
      },
    });
    return { source };
  } finally {
    await opened?.close().catch(() => false);
  }
};

export default create;
