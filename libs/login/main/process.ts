export const electronRendererUrlRead = (): string | undefined => {
  const value = process.env.ELECTRON_RENDERER_URL?.trim();
  return value || undefined;
};

export default electronRendererUrlRead;
