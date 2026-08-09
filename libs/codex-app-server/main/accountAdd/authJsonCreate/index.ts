import {
  applicationRead,
  windowOpen,
} from "browser-partition-main/browser/index.ts";
import { z } from "zod";
import store from "../../store.ts";
import { authJsonCreate } from "./store.ts";

const create = async (input: {
  carrier: z.infer<typeof authJsonCreate.input.create>;
  controller: AbortController;
}) => {
  const application = await applicationRead({ browserId: input.carrier.browserId });
  let opened: Awaited<ReturnType<typeof windowOpen>> | undefined;
  try {
    const source = await store.getState().authJsonCreateActions.create({
      openAuthUrl: async authUrl => {
        opened = await windowOpen(
          application.executablePath,
          authUrl,
          application.launchArguments,
          input.controller.signal,
        );
        void opened.closed.then(
          () => input.controller.abort(),
          () => input.controller.abort(),
        );
      },
      signal: input.controller.signal,
    });
    return { source };
  } finally {
    await opened?.close().catch(() => false);
  }
};

export default create;
