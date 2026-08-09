import {
  applicationRead,
  windowOpen,
} from "browser-partition-main/browser/index.ts";
import { z } from "zod";
import store from "../../store.ts";
import { authJsonCreate } from "./store.ts";

const create = async (input: {
  carrier: z.infer<typeof authJsonCreate.input.create>;
}) => {
  const application = await applicationRead({ browserId: input.carrier.browserId });
  let opened: Awaited<ReturnType<typeof windowOpen>> | undefined;
  try {
    const source = await store.getState().authJsonCreateActions.create({
      browserId: input.carrier.browserId,
      openAuthUrl: async (authUrl, signal) => {
        opened = await windowOpen(
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
