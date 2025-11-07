declare module "ml-xgboost" {
  export class XGBoost {
    constructor(config?: any);
    train(X: number[][], y: number[]): void | Promise<void>;
    predict(rows: number[][]): number[] | Promise<number[]>;
  }

  const _default: {
    XGBoost: typeof XGBoost;
  };

  export default _default;
}
