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
 * Feature builder (rich version):
 * - uses all non-datetime, non-target columns as exogenous numeric series
 * - adds lags, differences, rolling means
 * - adds target-series history (lags, diff, rolling mean)
 * - adds cross-series interactions (spread / ratio / product)
 * - adds time index + Fourier encodings
 *
 * Returns full matrix + last-step feature row for +1 prediction.
 */
export function buildFeatures(
  rows: any[],
  datetimeKey: string,
  targetKey: string
): { X: number[][]; y: number[]; lastFeatureRow: number[] } {
  const MAX_LAG = 3;
  const ROLLING_WINDOW = 7;
  const EPS = 1e-9;

  if (!rows.length) {
    return { X: [], y: [], lastFeatureRow: [] };
  }

  const headers = Object.keys(rows[0] ?? {});

  // Exogenous series = all non-datetime, non-target columns
  const featureKeys = headers.filter(
    (h) => h !== datetimeKey && h !== targetKey
  );

  const toNum = (v: any): number =>
    v === "" || v == null || (typeof v === "number" && Number.isNaN(v))
      ? NaN
      : Number(v);

  // Numeric series map (exogenous + target)
  const seriesKeys: string[] = [...featureKeys];
  if (targetKey && headers.includes(targetKey)) {
    seriesKeys.push(targetKey);
  }

  const seriesMap: Record<string, number[]> = {};
  for (const key of seriesKeys) {
    seriesMap[key] = rows.map((r) => toNum(r[key]));
  }

  const n = rows.length;

  const getValue = (key: string, t: number): number => {
    const arr = seriesMap[key];
    if (!arr || !arr.length) return NaN;
    const idx = t <= 0 ? 0 : t >= arr.length ? arr.length - 1 : t;
    return arr[idx];
  };

  const rollingMean = (key: string, t: number): number => {
    const arr = seriesMap[key];
    if (!arr || !arr.length) return NaN;

    const end = t >= arr.length ? arr.length - 1 : t;
    const start = Math.max(0, end - (ROLLING_WINDOW - 1));

    let sum = 0;
    let count = 0;
    for (let i = start; i <= end; i += 1) {
      const v = arr[i];
      if (Number.isFinite(v)) {
        sum += v;
        count += 1;
      }
    }
    if (count === 0) return NaN;
    return sum / count;
  };

  // For cross-series interactions we use all numeric series (including target)
  const allKeysForCross: string[] = [...seriesKeys];

  const buildRowFeatures = (t: number, isFuture: boolean): number[] => {
    const feats: number[] = [];

    // For the hypothetical future step we approximate "current" values
    // by reusing the last observed index.
    const baseIndex = isFuture ? n - 1 : t;

    // --- 1) all exogenous current ---
    for (const key of featureKeys) {
      const cur = getValue(key, baseIndex);
      feats.push(cur);
    }

    // --- 2) Lag・diff・rolling mean ---
    for (const key of featureKeys) {
      const cur = getValue(key, baseIndex);

      // Lags up to MAX_LAG
      for (let lag = 1; lag <= MAX_LAG; lag += 1) {
        feats.push(getValue(key, baseIndex - lag));
      }

      // First difference vs previous step
      const prev = getValue(key, baseIndex - 1);
      feats.push(cur - prev);

      // Rolling mean (window = ROLLING_WINDOW)
      feats.push(rollingMean(key, baseIndex));
    }

    // 3) Cross-series interactions at "current" time
    for (let i = 0; i < allKeysForCross.length; i += 1) {
      const ki = allKeysForCross[i];
      const vi = getValue(ki, baseIndex);

      for (let j = i + 1; j < allKeysForCross.length; j += 1) {
        const kj = allKeysForCross[j];
        const vj = getValue(kj, baseIndex);

        // Spread
        feats.push(vi - vj);

        // Ratio (with small epsilon to avoid 0-div)
        const denom =
          Math.abs(vj) < EPS ? (vj >= 0 ? EPS : -EPS) : vj;
        feats.push(vi / denom);

        // Product
        feats.push(vi * vj);
      }
    }

    // 4) Time encodings (index + Fourier)
    const timeIndex = isFuture ? n : t;
    feats.push(timeIndex);
    feats.push(Math.sin((2 * Math.PI * timeIndex) / 24));
    feats.push(Math.cos((2 * Math.PI * timeIndex) / 24));
    feats.push(Math.sin((2 * Math.PI * timeIndex) / 168));
    feats.push(Math.cos((2 * Math.PI * timeIndex) / 168));

    return feats;
  };

  const X: number[][] = [];
  const y: number[] = [];

  for (let t = 0; t < n; t += 1) {
    X.push(buildRowFeatures(t, false));

    const series = seriesMap[targetKey];
    const targetVal =
      series && series.length > t
        ? series[t]
        : toNum(rows[t]?.[targetKey]);
    y.push(targetVal);
  }

  // +1 step feature row (future step)
  const lastFeatureRow = buildRowFeatures(n, true);

  return { X, y, lastFeatureRow };
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
