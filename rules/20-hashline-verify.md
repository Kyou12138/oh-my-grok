# Hashline + Verify

- Before editing an existing file: **Read** it first (Hashline cache).
- Prefer exact `old_string` from current file content; optional `LINE#TAG|` anchors from `<HASHLINE_CACHE>`.
- After edits: run tests/typecheck. Configure `.omg/config.json` → `diagCommand` for auto diagnostics.
- Claim done only with evidence: `<promise>VERIFIED</promise>` or diagnostics clean / tests passed.
- Avoid AI-slop comments (narrating the obvious).
