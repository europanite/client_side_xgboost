export interface XGBoostInterface {
  train(X: number[][], y: number[]): void | Promise<void>;
  predict(rows: number[][]): number[] | Promise<number[]>;
}

export declare class XGBoost implements XGBoostInterface {
  constructor(config?: any);
  train(X: number[][], y: number[]): void | Promise<void>;
  predict(rows: number[][]): number[] | Promise<number[]>;
}

// Shape of the default export from the real "ml-xgboost" library.
declare const _default: {
  XGBoost: typeof XGBoost;
};

export default _default;