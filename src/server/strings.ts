/** Treats an empty string like "not provided". */
export const nonEmpty = (value: string | undefined): string | undefined =>
  value === undefined || value === "" ? undefined : value;
