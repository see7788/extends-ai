import type { ImmerStateCreator } from "extends-zustand/immerStateCreator";
import { z } from "zod";

const themeValidator = z.object({
  colorPrimary: z.string().regex(/^#[a-f\d]{6}$/i),
  colorPrimaryGlass: z.string().regex(/^rgba\(\d{1,3}, ?\d{1,3}, ?\d{1,3}, ?(?:0|1|0?\.\d+)\)$/),
});
const colorPrimarySetValidator = themeValidator.pick({ colorPrimary: true });

type Theme = z.infer<typeof themeValidator>;
type ThemeSlice = {
  theme: Theme;
  themeActions: {
    colorPrimarySet(input: z.infer<typeof colorPrimarySetValidator>): void;
  };
};

const initial: Theme = {
  colorPrimary: "#22c55e",
  colorPrimaryGlass: "rgba(34, 197, 94, 0.72)",
};

const themeStore: ImmerStateCreator<ThemeSlice> = set => ({
  theme: structuredClone(initial),
  themeActions: {
    colorPrimarySet(input) {
      const value = colorPrimarySetValidator.parse(input);
      set(state => {
        state.theme.colorPrimary = value.colorPrimary;
      });
    },
  },
});

export default themeStore;
