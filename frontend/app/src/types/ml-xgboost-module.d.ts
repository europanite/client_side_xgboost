// Ambient module declaration so TS understands imports of the real "ml-xgboost" package.

declare module "ml-xgboost" {
  export interface XGBoostInterface {
    train(X: number[][], y: number[]): void | Promise<void>;
    predict(rows: number[][]): number[] | Promise<number[]>;
  }

  export class XGBoost implements XGBoostInterface {
    constructor(config?: any);
    train(X: number[][], y: number[]): void | Promise<void>;
    predict(rows: number[][]): number[] | Promise<number[]>;
  }

  const _default: {
    XGBoost: typeof XGBoost;
  };

  export default _default;
}
