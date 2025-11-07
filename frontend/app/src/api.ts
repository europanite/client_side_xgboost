import type * as XLSXType from "xlsx";

/**
 * Parse a CSV string to rows of objects.
 * If you later want PapaParse, you can plug it in via window.__parseCSV.
 */
export function parseCSV(csvText: string): { rows: any[]; headers: string[] } {
  // @ts-ignore optional hook
  if (typeof window !== "undefined" && window.__parseCSV) {
    // @ts-ignore
    return window.__parseCSV(csvText);
  }
  return simpleCSV(csvText);
}

/** Minimal CSV parser (no quotes/escapes magic, just enough for this demo). */
function simpleCSV(text: string): { rows: any[]; headers: string[] } {
  const trimmed = text.trim();
  if (!trimmed) return { rows: [], headers: [] };

  const lines = trimmed.split(/\r?\n/);
  const headers = (lines[0] ?? "")
    .split(",")
    .map((h) => h.trim());

  const rows = lines
    .slice(1)
    .filter((line) => line.length > 0)
    .map((line) => {
      const vals = line.split(",").map((v) => v.trim());
      const obj: Record<string, any> = {};
      headers.forEach((h, i) => {
        obj[h] = vals[i];
      });
      return obj;
    });

  return { rows, headers };
}

/**
 * Feature builder:
 * - uses all non-datetime, non-target columns as numeric features
 * - adds simple time-index encodings
 * Returns full matrix + last-step feature row for +1 prediction.
 */
export function buildFeatures(
  rows: any[],
  datetimeKey: string,
  targetKey: string
): { X: number[][]; y: number[]; lastFeatureRow: number[] } {
  if (!rows.length) {
    return { X: [], y: [], lastFeatureRow: [] };
  }

  const headers = Object.keys(rows[0] ?? {});
  const featureKeys = headers.filter(
    (h) => h !== datetimeKey && h !== targetKey
  );

  const toNum = (v: any) =>
    v === "" || v == null || (typeof v === "number" && Number.isNaN(v))
      ? NaN
      : Number(v);

  const X: number[][] = [];
  const y: number[] = [];

  rows.forEach((r, idx) => {
    const t = idx;
    const feats: number[] = [];

    // Other series as features
    featureKeys.forEach((k) => {
      feats.push(toNum(r[k]));
    });

    // Time encodings
    feats.push(t);
    feats.push(Math.sin((2 * Math.PI * t) / 24));
    feats.push(Math.cos((2 * Math.PI * t) / 24));
    feats.push(Math.sin((2 * Math.PI * t) / 168));
    feats.push(Math.cos((2 * Math.PI * t) / 168));

    X.push(feats);
    y.push(toNum(r[targetKey]));
  });

  // +1 step feature row, reusing last row's non-target features
  const last = rows[rows.length - 1];
  const tNext = rows.length;
  const nextFeats: number[] = [];

  featureKeys.forEach((k) => {
    nextFeats.push(toNum(last[k]));
  });

  nextFeats.push(tNext);
  nextFeats.push(Math.sin((2 * Math.PI * tNext) / 24));
  nextFeats.push(Math.cos((2 * Math.PI * tNext) / 24));
  nextFeats.push(Math.sin((2 * Math.PI * tNext) / 168));
  nextFeats.push(Math.cos((2 * Math.PI * tNext) / 168));

  return { X, y, lastFeatureRow: nextFeats };
}

/**
 * Parse XLSX ArrayBuffer into rows and headers using npm `xlsx`.
 */
export async function parseXLSX(
  buf: ArrayBuffer
): Promise<{ rows: any[]; headers: string[] }> {
  const XLSX = (await import("xlsx")) as typeof XLSXType;

  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  const rows: any[] = XLSX.utils.sheet_to_json(ws, { raw: true });
  const headers = rows.length ? Object.keys(rows[0]) : [];

  return { rows, headers };
}
