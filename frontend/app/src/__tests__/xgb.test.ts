import { initXGBoostCtor } from "../xgb";

describe("initXGBoostCtor", () => {
  beforeAll(() => {
    (globalThis as any).fetch = jest.fn(async () => {
      const buf = new ArrayBuffer(8);
      return new Response(buf, {
        status: 200,
        headers: { "Content-Type": "application/wasm" }
      }) as any;
    });

    if (typeof (globalThis as any).self === "undefined") {
      (globalThis as any).self = globalThis;
    }
  });

  it("returns a usable XGBoost class from mocked ml-xgboost", async () => {
    const XGBoost = await initXGBoostCtor();
    const model = new XGBoost({});

    expect(typeof model.train).toBe("function");
    expect(typeof model.predict).toBe("function");

    model.train([[1, 2]], [3]);
    const preds = model.predict([[1, 2]]);
    expect(Array.isArray(preds)).toBe(true);
  });
});
