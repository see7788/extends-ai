import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { authJsonImport as producer } from "codex-app-server-main/accountAdd/authJsonImport/store.ts";

type AuthJsonImportSlice = {
  authJsonImport: ReturnType<typeof producer.authJsonImportValidator.parse>;
};

const authJsonImportStore: ImmerStateCreator<AuthJsonImportSlice> = (set, get) => ({
  authJsonImport: structuredClone(producer.initial),
});

export { producer as authJsonImport };
export default authJsonImportStore;
