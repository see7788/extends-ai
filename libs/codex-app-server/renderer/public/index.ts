export const errorText = (error: unknown): string => error instanceof Error
  ? error.message
  : String(error);

export const timeText = (value: string | null | undefined): string => value
  ? new Date(value).toLocaleString()
  : "—";
