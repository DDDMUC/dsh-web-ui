var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.js
var KINDS = /* @__PURE__ */ new Set(["skin", "pet", "plugin"]);
var ASSET_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
var FP_RE = /^[A-Za-z0-9_-]{16,64}$/;
var STATS_CACHE = new Request("https://dsh-market.com/api/stats");
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extra
    }
  });
}
__name(json, "json");
async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
__name(sha256, "sha256");
async function readStats(env) {
  const { results } = await env.DB.prepare("SELECT kind, asset_id, votes FROM counts").all();
  const out = { skin: {}, pet: {}, plugin: {} };
  for (const r of results || []) {
    if (!(r.kind in out)) continue;
    out[r.kind][r.asset_id] = r.votes;
  }
  return out;
}
__name(readStats, "readStats");
var src_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/api/health") {
      return json({ ok: true });
    }
    if (path === "/api/stats" && request.method === "GET") {
      const cache = caches.default;
      const hit = await cache.match(STATS_CACHE);
      if (hit) return hit;
      const stats = await readStats(env);
      const resp = new Response(JSON.stringify(stats), {
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "public, max-age=60, stale-while-revalidate=300",
          "access-control-allow-origin": "*"
        }
      });
      ctx.waitUntil(cache.put(STATS_CACHE, resp.clone()));
      return resp;
    }
    if (path === "/api/like" && request.method === "POST") {
      let body;
      try {
        body = await request.json();
      } catch {
        return json({ ok: false, error: "invalid-json" }, 400);
      }
      const kind = typeof body.kind === "string" ? body.kind : "";
      const assetId = typeof body.asset_id === "string" ? body.asset_id : "";
      const fp = typeof body.device_fp === "string" ? body.device_fp : "";
      const unlike = body.unlike === true;
      if (!KINDS.has(kind) || !ASSET_RE.test(assetId) || !FP_RE.test(fp)) {
        return json({ ok: false, error: "invalid-params" }, 400);
      }
      const hash = await sha256(fp);
      let voteResult = null;
      if (unlike) {
        const del = await env.DB.prepare(
          "DELETE FROM likes WHERE kind = ?1 AND asset_id = ?2 AND device_hash = ?3"
        ).bind(kind, assetId, hash).run();
        if (del.meta && del.meta.changes > 0) {
          await env.DB.prepare(
            "UPDATE counts SET votes = MAX(votes - 1, 0) WHERE kind = ?1 AND asset_id = ?2 AND votes > 0"
          ).bind(kind, assetId).run();
        }
        voteResult = { liked: false };
      } else {
        const ins = await env.DB.prepare(
          "INSERT OR IGNORE INTO likes (kind, asset_id, device_hash, created_at) VALUES (?1, ?2, ?3, ?4)"
        ).bind(kind, assetId, hash, Date.now()).run();
        if (ins.meta && ins.meta.changes > 0) {
          await env.DB.prepare(
            "INSERT INTO counts (kind, asset_id, votes) VALUES (?1, ?2, 1) ON CONFLICT(kind, asset_id) DO UPDATE SET votes = votes + 1"
          ).bind(kind, assetId).run();
        }
        voteResult = { liked: true };
      }
      ctx.waitUntil(caches.default.delete(STATS_CACHE));
      const row = await env.DB.prepare(
        "SELECT votes FROM counts WHERE kind = ?1 AND asset_id = ?2"
      ).bind(kind, assetId).first();
      return json({ ok: true, liked: voteResult.liked, votes: row ? row.votes : 0 });
    }
    return json({ ok: false, error: "not-found" }, 404);
  }
};

// ../../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-fLFmBC/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = src_default;

// ../../../../../../opt/homebrew/lib/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-fLFmBC/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=index.js.map
