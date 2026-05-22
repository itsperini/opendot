# Shared Skills

Shared repo skills for coding agents working in OpenDot.

Use skills for durable, reusable workflows that are too detailed for
`.agents/AGENTS.md`. Keep them tool-neutral, concise, and focused on one domain
or workflow.

For the shared agent config, start with [`../README.md`](../README.md).

## Available Skills

### brand-guidelines

Use for:

- creating, editing, or reviewing OpenDot UI and frontend styling
- creating brand assets, README banners, docs visuals, diagrams, screenshots,
  or product mockups
- keeping colors, typography, logo treatment, radii, shadows, cards, buttons,
  and product motifs aligned with the OpenDot visual system
- exporting brand SVGs to crisp PNGs with the bundled `sharp-cli` helper

Open: [brand-guidelines/SKILL.md](brand-guidelines/SKILL.md)

### firmware-build

Use only when:

- a task explicitly asks for firmware setup, ESP-IDF, build, test, flash,
  serial monitoring, or hardware debugging
- the task changes or verifies files under `dot-device/firmware/**`

Open: [firmware-build/SKILL.md](firmware-build/SKILL.md)

### grill-me

Use for:

- stress-testing a plan, design, architecture, product idea, or implementation
  approach
- interviewing the user until decision branches, dependencies, tradeoffs, and
  risks are resolved
- requests that mention "grill me" or ask to be challenged on a plan

Open: [grill-me/SKILL.md](grill-me/SKILL.md)

### skill-creator

Use for:

- creating new shared skills under `.agents/skills/`
- editing or refining existing shared skills
- choosing when to use `SKILL.md`, `references/`, `scripts/`, `assets/`, and
  `agents/openai.yaml`
- validating skills with `scripts/quick_validate.py`

Open: [skill-creator/SKILL.md](skill-creator/SKILL.md)

## Adding A New Shared Skill

1. Start with [skill-creator/SKILL.md](skill-creator/SKILL.md).
2. Create a concise `.agents/skills/<skill-name>/SKILL.md`.
3. Prefer `references/` for deeper docs and `scripts/` for deterministic
   helpers.
4. Keep bundled assets only when the skill needs them to produce outputs.
5. Avoid adding extra skill-local README, installation guide, changelog, or
   quick-reference files.
6. Link the skill from `.agents/AGENTS.md` only when it should be discoverable
   from the repo-wide routing guide.
7. Run the relevant validator, usually:
   `python3 .agents/skills/skill-creator/scripts/quick_validate.py .agents/skills/<skill-name>`.

## Skill Design Rules

- Use `SKILL.md` as the short entrypoint, not the full knowledge dump.
- Put detailed reference material in `references/` and load it only when needed.
- Put deterministic, repetitive helpers in `scripts/`.
- Keep trigger guidance in the `description` frontmatter field.
- Keep skills focused enough that another agent can tell when to use them.
