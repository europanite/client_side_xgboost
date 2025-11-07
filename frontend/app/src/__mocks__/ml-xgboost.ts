// Jest mock module for "ml-xgboost" used only in tests.
// Provides a minimal XGBoost-like class compatible with xgb.ts normalize() logic.

export class XGBoost {
  public config: any;
  public trainedOn: { X: number[][]; y: number[] } | null = null;

  constructor(config: any) {
    this.config = config;
  }

  train(X: number[][], y: number[]): void {
    this.trainedOn = { X, y };
  }

  predict(rows: number[][]): number[] {
    // Simple deterministic mock: return the row length as prediction.
    return rows.map((r) => r.length);
  }
}

const defaultExport = { XGBoost };

export default defaultExport;
