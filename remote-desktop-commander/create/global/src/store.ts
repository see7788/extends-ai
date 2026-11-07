// 此文件只负责组装切片仓库，不承担任何业务。
// createStore 内用 ReturnType & 合并，不要定义碎片类型。
// 让所有切片无副作用，副作用方法放在独立文件执行。
import { immer } from "zustand/middleware/immer";
import { createStore } from "zustand/vanilla";
import kasmvncStore from "./routers/kasmvnc/store";

export default createStore<ReturnType<typeof kasmvncStore>>()(
  immer((...options) => ({
    ...kasmvncStore(...options),
  })),
);
