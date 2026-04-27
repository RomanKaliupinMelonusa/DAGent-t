# Dev Server Validation (Pre-Commit Gate)

Before committing your implementation, you **MUST** validate that webpack resolves all modules correctly. Babel/AST parsing alone is insufficient — it validates syntax but cannot detect missing module paths (e.g., `@salesforce/retail-react-app/app/components/<new-component>` for components that only exist in `overrides/`).

## Single-server invariant (HARD RULE)

You MUST run **at most one** `npm start` invocation per session.

A prior `product-quick-view-plp` run wedged because three concurrent `npm start &` dev servers were spawned in the same agent session. Each PWA Kit dev server allocates ~1.2 GB of webpack-worker RSS; three of them exhausted devcontainer memory and the kernel OOM-killer reaped the VS Code Server `node` process — taking the orchestrator with it.

Concrete rules:

- **Never** issue a second `npm start` (foreground or `&`) while a previous one is alive in this session.
- Reuse the same `SERVER_PGID` for every probe in this session.
- If you genuinely need a fresh server (e.g. you changed `config/` and webpack must restart), tear down the existing process group first via the trap below — do not layer a second server on top.
- Cap **2 routes maximum** per session (the root `/` plus the single most relevant route from the table in the Route-Aware Validation section). Do not loop over the table — the agent that emitted three dev servers also probed five routes.

## Required Validation Step

After all files are written and before running `agent-commit.sh`:

```bash
# 1) Reap any stranded webpack workers from a prior crashed run before
#    we start our own. Without this, port 3000 is held and `npm start`
#    silently double-binds, doubling memory use.
lsof -ti:3000 | xargs -r kill -KILL
sleep 2

# 2) Launch under setsid so the dev server is its own process group
#    leader. SERVER_PGID equals the PID of the setsid child, which is
#    also the PGID — passing -PGID to `kill` reaps every webpack worker
#    in one syscall.
setsid npm start &
SERVER_PGID=$!

# 3) Register a trap BEFORE any sleep/curl so a panic, ^C, `set -e` exit,
#    or even an uncaught error in this script still tears the server down.
#    Negative sign on the kill target = process group, not single PID.
trap 'kill -TERM "-$SERVER_PGID" 2>/dev/null' EXIT

# 4) Wait for webpack to compile, then verify HTTP 200.
sleep 60
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/)

# 5) Explicit teardown of the whole process group (the trap is a backstop).
kill -TERM "-$SERVER_PGID" 2>/dev/null

if [ "$HTTP_STATUS" != "200" ]; then
  echo "ERROR: Dev server returned HTTP $HTTP_STATUS — webpack module resolution failed"
  # Debug: check the server output for ModuleNotFoundError
  exit 1
fi
echo "OK: Dev server returned HTTP 200 — all modules resolve correctly"
```

If the server returns anything other than HTTP 200, inspect the terminal output for `ModuleNotFoundError` and fix the import paths before committing.

## Route-Aware Validation (CRITICAL)

Checking only the root route (`/`) is **NOT sufficient**. SSR crashes are often page-specific — a component override can crash only the pages that render it while the homepage works fine.

**After verifying `/`, also verify the single most relevant route affected by your code change** (max 2 routes total per session — see the single-server invariant above):

| If you modified… | Also check this route |
|---|---|
| `components/product-tile/` | `/category/newarrivals` (PLP) |
| `components/product-view/` or `pages/product-detail/` | `/product/{any-product-id}` (PDP) |
| `components/header/` or `components/footer/` | Any route (header/footer render everywhere) |
| `pages/cart/` or `components/cart-*` | `/cart` |
| `pages/checkout/` | `/checkout` |
| `pages/account/` | `/account` |
| `components/search/` or `pages/product-list/` | `/search?q=shirt` |
| `pages/home/` | `/` |

Reuse the same `$SERVER_PGID` from the launch block above — do **not** spawn a second `npm start`:

```bash
# Example: after modifying product-tile override, also check PLP.
# This runs against the SAME server started above; no second `npm start`.
PLP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/category/newarrivals)
if [ "$PLP_STATUS" != "200" ]; then
  echo "ERROR: PLP returned HTTP $PLP_STATUS — SSR crash on affected route"
  exit 1
fi
```

**If the affected route returns a non-200 status**, the SSR is crashing. Check the server terminal output for the error stack trace. Common causes:
- Commerce SDK hooks (`useProduct`, `useProductViewModal`) executing during SSR
- Missing import paths for override components
- Hydration mismatches from browser-only APIs in the render path

