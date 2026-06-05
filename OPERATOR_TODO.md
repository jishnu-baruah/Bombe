# OPERATOR_TODO.md — human-in-the-loop queue

This is the human-in-the-loop queue. When the autonomous agent hits something it **cannot do without the operator** — a credential, a need-to-verify-against-a-live-service, or an owner-only decision — it appends an `OP-N` entry here, sets the related `TODO.md` task to `Status: blocked — see OP-N`, and continues with other unblocked work so long unattended sessions never stall. `TODO.md` = what to build; `OPERATOR_TODO.md` = what needs the operator. **Never fabricate credentials or fake verification to appear done** — record the honest half-done state instead.

## Entry format

```
## OP-N — <short title>   [open]
- Date: YYYY-MM-DD
- Blocks: T-XXX (and/or a short description)
- Need: <exactly what the operator must provide/do>
- Half-done state: <what's already built and verified; what's left>
- To resolve: <the concrete step, then tell the agent "OP-N ready">
```

The status toggles `[open]` → `[done]` once the operator resolves the entry; the blocked `TODO.md` task then reopens.

## Open

## OP-2 — YieldProof submodule URL   [open]
- Date: 2026-06-05
- Blocks: optional real-submodule wiring (T-101 uses the vendored interface meanwhile, so nothing is truly blocked)
- Need: operator to provide the correct YieldProof git repo URL to add as a submodule under `contracts/lib/yieldproof` (no URL has been provided yet)
- Half-done state: vendored `IYieldProofAttestor.sol` fallback in place and building under `contracts/src/interfaces/`; `forge build` succeeds; all downstream contract tasks (T-101+) proceed against the vendored interface, so nothing is truly blocked
- To resolve: provide the URL, then the agent runs `git submodule add <url> contracts/lib/yieldproof` and reconciles the vendored interface against the real one

## Resolved

## OP-1 — GitHub remote & auth   [done]
- Date: 2026-06-05
- Blocks: T-008 (remote create + push)
- Need: operator confirms repo + working push auth.
- Half-done state: remote `origin` = https://github.com/jishnu-baruah/Bombe.git wired; `main` pushed successfully (auth via cached credentials). Repo owner Jishnu Baruah (jishnu-baruah).
- To resolve: RESOLVED — remote exists and push works. (Minor: a stale `credential.helper=manager-core` git config prints a harmless warning on push; fix only if pushes start prompting.)
