import {
  loadFromCSV,
  loadFromXLSX,
  trainModel,
  predictNext,
  type LoadedData,
} from "../core";
import { parseXLSX, buildFeatures } from "../api";
import { initXGBoostCtor } from "../xgb";

// --- mocks setup ---

jest.mock("../api", () => {
  const actual = jest.requireActual("../api");
  return {
    __esModule: true,
    ...actual,
    parseXLSX: jest.fn(actual.parseXLSX),
    buildFeatures: jest.fn(actual.buildFeatures),
  };
});

jest.mock("../xgb");

const mockedParseXLSX = parseXLSX as jest.MockedFunction<typeof parseXLSX>;
const mockedBuildFeatures = buildFeatures as jest.MockedFunction<
  typeof buildFeatures
>;
const mockedInitXGBoostCtor =
  initXGBoostCtor as jest.MockedFunction<typeof initXGBoostCtor>;

// --- tests ---

describe("loadFromCSV", () => {
  it("infers datetimeKey from headers containing date/time", async () => {
    const csv = `Date,value
2025-01-01,10`;

    const data = await loadFromCSV(csv);

    expect(data.headers).toEqual(["Date", "value"]);
    expect(data.datetimeKey).toBe("Date");
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toEqual({ Date: "2025-01-01", value: "10" });
  });

  it("returns null datetimeKey when no date/time-like column", async () => {
    const csv = `x,y
1,2`;

    const data = await loadFromCSV(csv);

    expect(data.headers).toEqual(["x", "y"]);
    expect(data.datetimeKey).toBeNull();
    expect(data.rows).toHaveLength(1);
    expect(data.rows[0]).toEqual({ x: "1", y: "2" });
  });
});

describe("loadFromXLSX", () => {
  it("uses parseXLSX and infers datetimeKey", async () => {
    const rows = [{ timestamp: "2025-01-01", v: 1 }];

    mockedParseXLSX.mockResolvedValueOnce({
      rows,
      headers: ["timestamp", "v"],
    });

    const buf = new ArrayBuffer(8);
    const data = await loadFromXLSX(buf);

    expect(mockedParseXLSX).toHaveBeenCalledTimes(1);
    expect(data.headers).toEqual(["timestamp", "v"]);
    expect(data.datetimeKey).toBe("timestamp");
    expect(data.rows).toEqual(rows);
  });
});

describe("trainModel & predictNext", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls initXGBoostCtor, trains model, and predicts using lastFeatureRow", async () => {
    const rows = [
      { datetime: "t0", a: "1", target: "10" },
      { datetime: "t1", a: "3", target: "30" },
    ];

    const fakeFeatures = {
      X: [
        [1],
        [3],
      ],
      y: [10, 30],
      lastFeatureRow: [3],
    };

    mockedBuildFeatures.mockReturnValue(fakeFeatures as any);

    class FakeXGBoost {
      public trainedX: number[][] | null = null;
      public trainedY: number[] | null = null;

      constructor(_config: any) {}

      train(X: number[][], y: number[]): void {
        this.trainedX = X;
        this.trainedY = y;
      }

      predict(rowsIn: number[][]): number[] {
        const ys = this.trainedY ?? [];
        const mean =
          ys.length === 0
            ? 0
            : ys.reduce((sum, v) => sum + v, 0) / ys.length; // (10 + 30) / 2 = 20
        return rowsIn.map(() => mean);
      }
    }

    mockedInitXGBoostCtor.mockResolvedValueOnce(FakeXGBoost as any);

    const data: LoadedData = {
      rows,
      headers: ["datetime", "a", "target"],
      datetimeKey: "datetime",
    };

    const booster = await trainModel(data, "target");

    expect(mockedInitXGBoostCtor).toHaveBeenCalledTimes(1);
    expect(mockedBuildFeatures).toHaveBeenCalledWith(
      data.rows,
      "datetime",
      "target"
    );
    expect(booster).toBeInstanceOf(FakeXGBoost);

    const yhat = predictNext(data, "target", booster);
    expect(yhat).toBeCloseTo(20);
  });
});
