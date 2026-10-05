# Audit reproduction harness

Reviewed application revision: `fbb3db3`, 2026-10-04.

These are **characterization checks**, kept separate from the normal acceptance suite. A passing `DEFECT` check confirms unsafe current behavior; it does not mean the product is correct. A passing `FIXED` check confirms one narrowly specified repair. After repairs, replace defect assertions with expected safe behavior in the normal test suite.

From `extension/`:

```powershell
npx vitest run --config audit/vitest.config.mjs --reporter=verbose
```

This runs 64 deterministic checks with mocked external boundaries and skips one opt-in live check. It uses the project's existing dependencies. The React tests mount the real App component; they do not launch Chrome, exercise browser permission enforcement, or synthesize audio.

To reproduce the optional local Ollama smoke check:

```powershell
$env:EXPLAIN_ALOUD_AUDIT_LIVE='1'
npx vitest run --config audit/vitest.config.mjs audit/live.audit.js --reporter=verbose
Remove-Item Env:EXPLAIN_ALOUD_AUDIT_LIVE
```

The live check sends only the synthetic code and table embedded in `live.audit.js` to the existing loopback Ollama service. It writes `docs/audit-live-result.json`, overwriting previous smoke evidence. It tests plan generation and timeout/fallback, not speech quality or browser playback. A pass means a nonempty plan was produced, including by fallback; inspect the recorded segments and reasons before making any quality claim.

Evidence and recommendations: [Audit report](../../docs/AUDIT_REPORT.md).
