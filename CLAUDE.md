# CLAUDE.md

**Read `AGENTS.md` first** — it is the canonical instruction set for this repo
(project goal, hard rules, conventions, commands). Everything there applies to you.

Claude-specific notes:

- Prime directive: **feature parity with vdb.im** — `docs/feature-parity.md` is the
  definition of done. Verify ✎-marked items against https://vdb.im (browser tools)
  or https://github.com/smeea/vdb before implementing.
- Before touching deck/card logic, read `docs/domain-vtes.md` (VTES rules primer) —
  the group rule, discipline levels, and multi-type cards are the classic traps.
- Big design decisions are recorded in `docs/adr/`. If you need to deviate, write a
  new ADR in the same PR instead of silently diverging.
- When adding a server capability, implement it once in `server/src/service/` and
  expose it via **both** MCP and REST — a missing MCP tool is a review blocker.
- Keep `AGENTS.md`'s command section truthful — update it whenever build/dev commands
  change.
