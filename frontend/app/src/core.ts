import { parseCSV, parseXLSX, buildFeatures } from "./api";
import { initXGBoostCtor } from "./xgb";

export type LoadedData = {
  rows: any[];
  headers: string[];
  datetimeKey: string | null;
};

export async function loadFromCSV(text: string): Promise<LoadedData> {
  const { rows, headers } = parseCSV(text);
  const datetimeKey =
    headers.find((h) =>
      h.toLowerCase().includes("date") || h.toLowerCase().includes("time")
    ) || null;
  return { rows, headers, datetimeKey };
}

export async function loadFromXLSX(buf: ArrayBuffer): Promise<LoadedData> {
  const { rows, headers } = await parseXLSX(buf); // ensure `await` is present
  const datetimeKey =
    headers.find((h) =>
      h.toLowerCase().includes("date") || h.toLowerCase().includes("time")
    ) || null;
  return { rows, headers, datetimeKey };
}

export async function trainModel(
  data: LoadedData,
  targetKey: string
): Promise<any> {
  const { X, y } = buildFeatures(
    data.rows,
    data.datetimeKey!,
    targetKey
  );
  const XGBoost = await initXGBoostCtor();
  const booster = new XGBoost({
    booster: "gbtree",
    objective: "reg:linear",
    max_depth: 4,
    eta: 0.1,
    min_child_weight: 1,
    subsample: 0.8,
    colsample_bytree: 1,
    silent: 1,
    iterations: 200,
  });
  booster.train(X, y);
  return booster;
}

export function predictNext(
  data: LoadedData,
  targetKey: string,
  model: any
): number {
  const { lastFeatureRow } = buildFeatures(
    data.rows,
    data.datetimeKey!,
    targetKey
  );
  const pred = model.predict([lastFeatureRow]);
  const yhat = Array.isArray(pred) ? Number(pred[0]) : Number(pred);
  return yhat;
}
