<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working together: Claude Code and Codex

Two coding agents work on this repo. This file is read by both (`CLAUDE.md` imports it).

| | Claude Code | Codex |
|---|---|---|
| Role | Primary developer | Reviewer and secondary developer |
| Branches | `claude/<topic>` | `codex/<topic>` |
| Gets work from | The owner | The owner, Claude, or any GitHub issue labelled `codex` |

## Rules for both agents

- **One branch, one author.** Only the agent that created a branch pushes to it. The other agent reports findings on the PR and does not push there. If the owner asks for a handover, it is stated in a PR comment first.
- **Work in your own worktree**, branched from a fresh `origin/main`. Never edit in a checkout another session is using.
- **Check before starting.** Look for an existing branch or PR on the topic (`git ls-remote origin 'refs/heads/*<topic>*'`, `gh pr list --state all --search <topic>`) and build on it rather than starting a second one.
- **Everything goes through a PR.** Nothing is pushed to `main`. Run `npm run typecheck`, `npm run lint` and `npm test` before opening one; CI skips the database-backed suites and Playwright, so say in the PR what you ran against a scratch database and show the counts.
- **No review ping-pong.** A review comment is acted on by the PR's author, once. Do not reply to a bot review with another review request, and do not re-trigger a review to get a different answer.

## Handing work to Codex

Anyone (the owner, Claude, or a person filing an issue) can assign work by labelling a GitHub issue `codex`. Good Codex issues are self-contained: the problem, the files involved, and how to tell it is done. Codex picks up `gh issue list --label codex`, comments on the issue that it has started, and opens a PR from `codex/<issue-number>-<slug>` that says `Closes #N`. Claude hands off work the same way, by opening or labelling an issue. Work that touches database migrations, authentication or the iOS app stays with Claude unless the owner says otherwise.

## Review

- **Claude reviews everything Codex writes or changes.** `claude-code-review.yml` runs on every PR. When it finishes on a `codex/*` PR it adds the `claude-reviewed` label; any new push removes the label, so the label means "Claude has seen this exact code". The owner does not merge a `codex/*` PR without it. The label is advisory, not a branch-protection rule.
- **Codex reviews Claude's PRs** through its GitHub app, and may also be asked to review locally.
- **Findings are triaged, not obeyed.** The author fixes what is real, replies with a reason to skip what is not, and says which in the PR. Reviewers must not edit the author's branch to apply their own findings.
- Both agents may leave review comments on a PR written by the other. Neither agent merges. The owner merges.
