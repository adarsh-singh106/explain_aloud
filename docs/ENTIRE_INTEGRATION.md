# Entire CLI Integration

## How Entire is Used
The Entire CLI has been enabled in this repository (`npx -y entire-cli enable --agent gemini`). It runs invisibly alongside git to checkpoint AI coding sessions, ensuring context is preserved without polluting the main branch history.

## Which Agent Sessions it Captures
Entire intercepts Antigravity's lifecycle events (via local hooks installed in `.gemini/settings.json`). It captures all subsequent AI-assisted development, review work, prompts, and tool calls made using the Antigravity agent (gemini).

## How to Retrieve/Share the Session for the DEV Article
1. Use `npx -y entire-cli explain` to review the tracked session context and commit details.
2. Since Entire uses shadow branches to store session history natively in git, ensure your Entire shadow branches or checkpoint references are pushed to your GitHub repository.
3. For the DEV article's "Best Use of Entire" category, link directly to your repository or the specific Entire checkpoints/shadow branches that demonstrate the AI-assisted review work.
4. If you also want to use DEV's native Agent Session Liquid tags (`{% agent_session %}`), you can export the Antigravity session transcript using DevRelay (`devrelay sessions submit`) and embed the ID.

## Evidence/Screenshots to Capture
To strengthen your submission, take screenshots of:
- The output of `npx -y entire-cli status` showing the active gemini agent and tracking status.
- The output of `npx -y entire-cli explain` displaying the context of a tracked session.
- The Git history or shadow branches reflecting the checkpoints created by Entire.

## Final CI Review Evidence

- GitHub Actions CI completed successfully.
- 191 tests passed across 14 test files.
- TypeScript compilation passed.
- Production Chrome extension build passed.
- Codex independently reviewed the CI workflow.
- The review found no shipping blockers.
- The only non-blocking recommendation was:

  ```yaml
  permissions:
    contents: read
  ```

- That least-privilege hardening was subsequently applied.
