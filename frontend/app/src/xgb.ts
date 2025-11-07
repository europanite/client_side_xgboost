const WASM_URL = new URL(
  `${import.meta.env.BASE_URL}vendor/ml-xgboost/xgboost.wasm`,
  self.location.href
).toString();

async function fetchWasmBinary(url: string): Promise<ArrayBuffer> {
  const u = new URL(url);
  u.searchParams.set("t", String(Date.now()));        // bust cache in dev/HMR
  const r = await fetch(u.toString(), { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to fetch wasm: ${u} status=${r.status} ${r.statusText}`);
  return await r.arrayBuffer();
}

export async function initXGBoostCtor(): Promise<any> {
  const wasmBytes = await fetchWasmBinary(WASM_URL);
  const wasmResp = new Response(new Blob([wasmBytes], { type: "application/wasm" }), {
    status: 200,
    headers: { "Content-Type": "application/wasm" },
  });

  const origFetch = self.fetch.bind(self);
  (self as any).fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === "string" ? input : (input as Request).url;
      if (url.includes("xgboost.wasm")) {
        return Promise.resolve(wasmResp.clone());
      }
    } catch { /* ignore */ }
    return origFetch(input as any, init as any);
  };

  let mod: any;
  try {
    mod = await import("ml-xgboost");
  } finally {
    (self as any).fetch = origFetch;
  }

    const normalize = async (m: any): Promise<any | null> => {
    if (!m) return null;

    if (typeof m?.then === "function") {
        return await normalize(await m);
    }

    if (m?.default) {
        return await normalize(m.default);
    }

    if (m?.XGBoost && typeof m.XGBoost === "function") {
        return m.XGBoost;
    }

    if (typeof m === "function") {
        const src = Function.prototype.toString.call(m);
        const looksLikeClass =
        src.startsWith("class ") ||
        /class\s+[A-Za-z0-9_]+/.test(src) ||
        ("prototype" in m && Object.getOwnPropertyNames(m.prototype || {}).length > 1);

        if (looksLikeClass) {
        return m;
        }

        try {
        const ctor = await m({
            locateFile: (p: string) => (p.endsWith(".wasm") ? WASM_URL : p),
        });
        return ctor;
        } catch (e: any) {
        if (String(e).includes("cannot be invoked without 'new'")) {
            return m; 
        }
        throw e;
        }
    }

    return null;
    };

  const ctor =
    (await normalize(mod)) ??
    (await normalize(mod?.default)) ??
    (await normalize((mod && mod["ml-xgboost"]) || null));

  if (!ctor || typeof ctor !== "function") {
    const keys = Object.keys(mod || {});
    throw new Error(`ml-xgboost export shape unsupported. typeof default=${typeof mod?.default}, keys=${keys.join(",")}`);
  }
  return ctor;
}