# Portable Agent Skills

These repo-local skills are committed under `.agents/skills/` so teammates can use the same agent workflows without depending on this machine's private local skill directory.

## Included

- `ethskills` — Ethereum/EVM development routing skill.
- `grill-me` — one-question-at-a-time design interrogation skill.
- `design-an-interface` — brainstorming skill for comparing multiple interface shapes.
- `truthmarket-agent` — TruthMarket agent workflow for Swarm verification, commit-reveal, local policy, heartbeat, and auto-reveal.

## Usage

Agents that read repo-local `.agents/skills/*/SKILL.md` can use these directly. If a local Codex setup requires user-level skills, copy the folders:

```sh
mkdir -p ~/.codex/skills
cp -R .agents/skills/ethskills ~/.codex/skills/
cp -R .agents/skills/grill-me ~/.codex/skills/
cp -R .agents/skills/design-an-interface ~/.codex/skills/
cp -R .agents/skills/truthmarket-agent ~/.codex/skills/
```

Repo docs remain the source of truth for TruthMarket product decisions.
