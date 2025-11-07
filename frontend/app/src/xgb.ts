// Thin wrapper to lazily obtain an XGBoost-like constructor from "ml-xgboost".
// In browser: uses actual WASM.
// In tests: resolved via Jest's __mocks__/ml-xgboost.ts.

let cachedCtor: any | null = null;

// Relative path; resolved with a base URL inside fetchWasmBinary.
const WASM_URL = "vendor/ml-xgboost/xgboost.wasm";

async function fetchWasmBinary(url: string): Promise<ArrayBuffer> {
  const base =
    typeof window !== "undefined" && window.location
      ? // real browser: use current origin/path as base
        window.location.origin +
        window.location.pathname.replace(/\/[^/]*$/, "/")
      : // Node / Jest: dummy origin so relative URL
        "http://localhost/";

  const u = new URL(url, base);
  u.searchParams.set("t", String(Date.now())); // cache busting (harmless in tests)

  const res = await fetch(u.toString(), { cache: "no-store" } as any);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch wasm: ${u.toString()} status=${res.status} ${res.statusText}`
    );
  }
  return res.arrayBuffer();
}

export async function initXGBoostCtor(): Promise<any> {
  if (cachedCtor) return cachedCtor;

  const mod: any = await import("ml-xgboost");

  try {
    await fetchWasmBinary(WASM_URL);
  } catch {
    // ignore in non-browser / mocked env
  }

  const XGBoost =
    mod.XGBoost || (mod.default && mod.default.XGBoost) || mod;

  if (!XGBoost) {
    throw new Error("XGBoost constructor not found in ml-xgboost module");
  }

  cachedCtor = XGBoost;
  return XGBoost;
}
