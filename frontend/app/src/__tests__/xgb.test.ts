import { initXGBoostCtor } from "../xgb";

// Ensure Jest uses the manual mock in src/__mocks__/ml-xgboost.ts
jest.mock("ml-xgboost");

describe("initXGBoostCtor", () => {
  beforeAll(() => {
    (globalThis as any).fetch = jest.fn(async () => {
      // Create a fake wasm buffer with the correct magic header "\0asm"
      const buf = new ArrayBuffer(8);
      const view = new Uint8Array(buf);
      view[0] = 0x00;
      view[1] = 0x61;
      view[2] = 0x73;
      view[3] = 0x6d;

      // Return a minimal Response-like object.
      // xgb.ts only uses: status / headers.get / arrayBuffer()
      return {
        ok: true,
        status: 200,
        headers: {
          get(name: string) {
            return name.toLowerCase() === "content-type"
              ? "application/wasm"
              : null;
          },
        },
        async arrayBuffer() {
          return buf;
        },
      } as any;
    });

    // xgb.ts checks for `self`, so provide it in Node.
    if (typeof (globalThis as any).self === "undefined") {
      (globalThis as any).self = globalThis;
    }
  });

  it("returns a usable XGBoost class from mocked ml-xgboost", async () => {
    const XGBoost = await initXGBoostCtor();
    const model = new XGBoost({});

    expect(typeof model.train).toBe("function");
    expect(typeof model.predict).toBe("function");

    // These calls hit the manual mock (src/__mocks__/ml-xgboost.ts)
    model.train([[1, 2]], [3]);
    const preds = model.predict([[1, 2]]);

    expect(Array.isArray(preds)).toBe(true);
  });
});
