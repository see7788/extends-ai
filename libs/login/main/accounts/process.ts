import { session, type BrowserWindow as ElectronBrowserWindow } from "electron";
import BrowserPartitionWindow from "browser-partition-main/BrowserWindow/index.ts";

type AccountSession = {
  user?: { email: string } | null;
};

type Verification = {
  checkedAt: string;
  email: string | null;
  error: string | null;
  status: "valid" | "expired" | "unknown";
};

const errorText = (error: unknown): string => error instanceof Error
  ? error.message
  : String(error);
const canceled = (error: unknown): boolean => (
  error instanceof Error && error.name === "AbortError"
);

const verificationRead = async (
  partition: string,
  accountSessionParse: (input: unknown) => AccountSession,
  signal?: AbortSignal,
): Promise<Verification> => {
  const checkedAt = new Date().toISOString();
  try {
    const response = await session.fromPartition(partition).fetch(
      "https://chatgpt.com/api/auth/session",
      {
        credentials: "include",
        ...(signal ? { signal } : {}),
      },
    );
    if (response.status === 401) {
      return { checkedAt, email: null, error: null, status: "expired" };
    }
    if (!response.ok) {
      return {
        checkedAt,
        email: null,
        error: `ChatGPT 登录态检查失败：${response.status}`,
        status: "unknown",
      };
    }
    let parsed: AccountSession;
    try {
      parsed = accountSessionParse(await response.json() as unknown);
    } catch {
      return {
        checkedAt,
        email: null,
        error: "ChatGPT 登录态响应中没有可识别的账号",
        status: "unknown",
      };
    }
    if (!parsed.user) {
      return { checkedAt, email: null, error: null, status: "expired" };
    }
    return {
      checkedAt,
      email: parsed.user.email,
      error: null,
      status: "valid",
    };
  } catch (error) {
    if (canceled(error)) throw error;
    return {
      checkedAt,
      email: null,
      error: errorText(error),
      status: "unknown",
    };
  }
};

let accountWindow: BrowserPartitionWindow | undefined;

const accountWindowDispose = (): void => {
  accountWindow?.dispose();
  accountWindow = undefined;
};

const accountWindowOpen = async (options: {
  email: string;
  parent: ElectronBrowserWindow;
  partition: string;
}): Promise<void> => {
  accountWindowDispose();
  accountWindow = await BrowserPartitionWindow.open({
    height: 760,
    minHeight: 520,
    minWidth: 760,
    onClose: () => {
      accountWindow = undefined;
    },
    parent: options.parent,
    partition: options.partition,
    title: options.email,
    url: "https://chatgpt.com/",
    width: 920,
  });
};

const partitionClear = async (partition: string): Promise<void> => {
  await BrowserPartitionWindow.storageClear(partition);
};

export {
  accountWindowDispose,
  accountWindowOpen,
  partitionClear,
  verificationRead,
};
