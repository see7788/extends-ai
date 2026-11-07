import type { ImmerStateCreator } from "zustand-lib/immerStateCreator";

export type Instance = {
  id: string;
  port: number;
  display: number;
  url: string;
  status: "running" | "stopped";
};

const store: ImmerStateCreator<{
  kasmvnc: { instances: Instance[] };
  kasmvncActions: {};
}> = () => ({
  kasmvnc: { instances: [] },
  kasmvncActions: {},
});

export default store;
