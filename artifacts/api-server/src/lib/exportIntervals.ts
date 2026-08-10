export const EXPORT_INTERVALS = ["semiannual", "annual", "five_years"] as const;
export type ExportInterval = (typeof EXPORT_INTERVALS)[number];

export const EXPORT_INTERVAL_LABEL: Record<ExportInterval, string> = {
  semiannual: "halbjaehrlich",
  annual: "jaehrlich",
  five_years: "5 Jahre",
};

export const EXPORT_INTERVAL_MS: Record<ExportInterval, number> = {
  semiannual: 182 * 24 * 60 * 60 * 1000,
  annual: 365 * 24 * 60 * 60 * 1000,
  five_years: 5 * 365 * 24 * 60 * 60 * 1000,
};
