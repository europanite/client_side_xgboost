import { parseCSV, buildFeatures, parseXLSX } from "../api";

describe("parseCSV", () => {
  it("parses simple CSV into rows and headers", () => {
    const text = `
datetime,a,b,target
2025-01-01,1,2,3
2025-01-02,4,5,6
`.trim();

    const { rows, headers } = parseCSV(text);

    expect(headers).toEqual(["datetime", "a", "b", "target"]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      datetime: "2025-01-01",
      a: "1",
      b: "2",
      target: "3",
    });
  });

  it("returns empty arrays for blank input", () => {
    const { rows, headers } = parseCSV("   ");
    expect(rows).toEqual([]);
    expect(headers).toEqual([]);
  });
});

describe("buildFeatures", () => {
  it("builds rich feature matrix and last-step feature row", () => {
    const rows = [
      { datetime: "t0", a: "1", b: "2", target: "10" },
      { datetime: "t1", a: "3", b: "4", target: "20" },
    ];

    const { X, y, lastFeatureRow } = buildFeatures(
      rows,
      "datetime",
      "target"
    );

    // Still one feature row per input row
    expect(X).toHaveLength(2);

    // Dimension is now much larger than the original 7
    expect(X[0].length).toBeGreaterThan(7);
    expect(X[1].length).toBe(X[0].length);
    expect(lastFeatureRow.length).toBe(X[0].length);

    // Target values unchanged
    expect(y).toEqual([10, 20]);

    // First few features still use the last row's exogenous values
    // (so callers can rely on "a, b ..." ordering for the base series)
    expect(lastFeatureRow[0]).toBe(3); // a from last row
    expect(lastFeatureRow[1]).toBe(4); // b from last row
  });

  it("returns empty structures for no rows", () => {
    const { X, y, lastFeatureRow } = buildFeatures([], "datetime", "target");
    expect(X).toEqual([]);
    expect(y).toEqual([]);
    expect(lastFeatureRow).toEqual([]);
  });
});

jest.mock("xlsx", () => {
  return {
    read: (_buf: Uint8Array) => ({
      SheetNames: ["Sheet1"],
      Sheets: {
        Sheet1: {
          "!ref": "A1:B3",
        },
      },
    }),
    utils: {
      sheet_to_json: () => [
        { datetime: "2025-01-01", x: 1 },
        { datetime: "2025-01-02", x: 2 },
      ],
    },
  };
});

describe("parseXLSX", () => {
  it("parses XLSX buffer via xlsx utils", async () => {
    const buf = new ArrayBuffer(8);
    const { rows, headers } = await parseXLSX(buf);

    expect(rows).toHaveLength(2);
    expect(headers).toEqual(["datetime", "x"]);
  });
});
