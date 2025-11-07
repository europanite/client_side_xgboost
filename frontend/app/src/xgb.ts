import type { XGBoostInterface } from "./types/ml-xgboost";

let cachedCtor: (new (...args: any[]) => XGBoostInterface) | null = null;

const WASM_PATH = "vendor/ml-xgboost/xgboost.wasm";

function guessBase(): string {
  if (typeof window === "undefined" || !window.location) {
    return "http://localhost/";
  }

  const { origin, pathname } = window.location;

  const m = pathname.match(/^\/([^/]+)\/(index\.html)?$/);
  if (m) {
    return `${origin}/${m[1]}/`;
  }

  return `${origin}/`;
}

function getWasmUrl(): string {
  return guessBase() + WASM_PATH;
}

async function initXGBoostCtor(): Promise<
  new (...args: any[]) => XGBoostInterface
> {
  if (cachedCtor) return cachedCtor;

  const wasmUrl = getWasmUrl();

  const originalFetch = (globalThis as any).fetch?.bind(globalThis);
  if (typeof originalFetch !== "function") {
    throw new Error("global fetch is not available to load XGBoost wasm.");
  }

  // Right wasm 
  const resp = await originalFetch(wasmUrl);
  if (!resp.ok) {
    throw new Error(
      `Failed to fetch xgboost.wasm from ${wasmUrl} (status ${resp.status})`
    );
  }

  const buf = await resp.arrayBuffer();
  const view = new Uint8Array(buf);

  // wasm Magic Number Check (00 61 73 6d)
  if (
    view.length < 4 ||
    view[0] !== 0x00 ||
    view[1] !== 0x61 ||
    view[2] !== 0x73 ||
    view[3] !== 0x6d
  ) {
    throw new Error(
      `Invalid xgboost.wasm at ${wasmUrl}.`
    );
  }

  const wasmResponse: any =
    typeof Response !== "undefined"
      ? new Response(buf, {
          status: 200,
          headers: { "Content-Type": "application/wasm" },
        })
      : {
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
          clone() {
            // good enough for our usage in tests
            return this;
          },
        };

  (globalThis as any).fetch = (input: any, init?: any) => {
    const url = typeof input === "string" ? input : input?.url;
    if (typeof url === "string" && url.includes("xgboost.wasm")) {
      return Promise.resolve(wasmResponse.clone());
    }
    return originalFetch(input, init);
  };

  try {
    const mod: any = await import("ml-xgboost");
    const ctor = await resolveCtor(mod);

    if (!ctor) {
      throw new Error("ml-xgboost module did not expose a usable constructor.");
    }

    cachedCtor = ctor;
    return ctor;
  } finally {
    (globalThis as any).fetch = originalFetch;
  }
}

async function resolveCtor(mod: any): Promise<any | null> {
  if (!mod) return null;

  // Promise
  if (typeof mod.then === "function") {
    return resolveCtor(await mod);
  }

  if (mod.default) {
    const r = await resolveCtor(mod.default);
    if (r) return r;
  }

  if (typeof mod.XGBoost === "function") {
    return mod.XGBoost;
  }

  if (typeof mod === "function") {
    return mod;
  }

  return null;
}

export { initXGBoostCtor };
