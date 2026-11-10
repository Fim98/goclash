## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role triage vocabulary (label strings equal role names). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Frontend design

`design.md` at the repo root is the frontend style authority (StyleKit Playful Neo-Brutalist). Apply it to any UI work: components, screens, colors, typography, motion. The shadcn/ui base lives in `frontend/` (light/dark theme via CSS vars); theme tokens come from the StyleKit registry: `npx shadcn add https://www.stylekit.top/r/neo-brutalist-playful.json`.
