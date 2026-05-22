# Agent Guidelines for OpenDot

This is the canonical agent guide for the OpenDot repository. Keep the root
`AGENTS.md` as a lightweight discovery pointer or symlink to this file so
tooling can find the shared instructions while `.agents/` remains the source of
truth.

OpenDot is the open platform for voice agents on real devices. Build and tune
the voice pipeline, configure agents with knowledge and models, bind them to
hardware, and operate sessions in the cloud, local network, or on-device.

## Maintenance Contract

- Keep this file concise and repo-wide.
- Put narrow, reusable workflows in `.agents/skills/**`.
- Update this file when repository structure, required verification, licensing
  guidance, or durable agent conventions materially change.
- Do not codify one-off preferences or task-local decisions here.
- Preserve user changes in the working tree. Do not revert unrelated edits.

## Start Here By Task

- Product and architecture principles:
  `.agents/ARCHITECTURE_PRINCIPLES.md`
- UI styling, brand assets, diagrams, screenshots, or visual design:
  `.agents/skills/brand-guidelines/SKILL.md`
- Shared agent setup and MCP configuration:
  `.agents/README.md`
- Creating or refining shared skills:
  `.agents/skills/skill-creator/SKILL.md`
- Documentation content and navigation:
  `docs/`
- Platform UI, local storage, voice pipeline screens, and local runtime:
  `platform/`
- Device firmware and hardware integration:
  `dot-device/firmware/`
- Firmware setup, build, test, flash, and serial verification:
  `.agents/skills/firmware-build/SKILL.md` only when requested or when changing
  or verifying `dot-device/firmware/**`

Read the smallest set of files needed for the task. More-specific guidance in a
subdirectory takes precedence over this root guide for that scoped area.

## Project Structure

```text
opendot/
├─ platform/                # Vite React console and local voice runtime
├─ docs/                    # Mintlify documentation
├─ dot-device/firmware/     # ESP-IDF firmware and hardware integration
├─ assets/                  # Brand and README assets
├─ .agents/                 # Shared agent instructions and skills
├─ README.md                # Project overview
├─ CONTRIBUTING.md          # Contribution workflow
├─ SECURITY.md              # Security reporting policy
└─ ROADMAP.md               # Product direction
```

## Core Commands

Platform:

- Install dependencies: `cd platform && npm install`
- Run the web console: `cd platform && npm run dev`
- Run the local voice runtime: `cd platform && npm run runtime`
- Build check: `cd platform && npm run build`
- Preview production build: `cd platform && npm run preview`

Docs:

- Preview docs: `cd docs && mint dev`

Firmware:

- Build firmware from `dot-device/firmware/` with the local ESP-IDF toolchain,
  usually `idf.py build`.
- Flash firmware only when hardware is connected and the user requested it.

## Verification Defaults

| Change scope | Minimum verification |
| --- | --- |
| `platform/**` | `cd platform && npm run build` |
| `docs/**` | Preview with `cd docs && mint dev` when layout/navigation changed |
| `dot-device/firmware/**` | `idf.py build` when ESP-IDF is available |
| `.agents/**` | validate JSON/config syntax and run the affected skill validator when relevant |
| Root docs (`README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `ROADMAP.md`) | spelling/link review plus `git diff --check` |

Prefer targeted verification that matches the touched surface. If a command
cannot run because a local toolchain is missing, say so clearly in the final
answer.

## Repo Rules

- Keep changes scoped and aligned with existing project structure.
- Preserve the main project framing:
  "OpenDot. The open platform for voice agents on real devices."
- Keep docs practical and product-facing. Explain how to build, tune, bind, and
  operate voice agents rather than adding marketing scaffolding.
- Keep the voice pipeline explicit: VAD, STT, LLM, and TTS are separate product
  concepts even when an implementation provider combines details internally.
- Treat hardware as a first-class target. Device binding, local runtime behavior,
  and firmware constraints should stay visible in design decisions.
- Do not hand-edit generated or installed artifacts unless the task is
  specifically about those artifacts:
  - `platform/node_modules/**`
  - `platform/dist/**`
  - `dot-device/firmware/build/**`
  - `.playwright-mcp/**`
- Never commit secrets, API keys, private tokens, or local credentials.
- Keep `.env*.example` files in sync when adding required environment variables.

## Licensing Notes

- The repository root uses AGPL-3.0.
- The device firmware includes upstream Xiaozhi-derived material with its own
  MIT license notice at `dot-device/firmware/LICENSE.xiaozhi`.
- Preserve license notices when moving, copying, or substantially modifying
  firmware code.

## Shared Agent Setup

- `.agents/AGENTS.md` is the canonical root guide.
- `.agents/README.md` documents the shared agent configuration.
- `.agents/skills/` contains shared reusable skills such as
  `brand-guidelines`, `firmware-build`, and `skill-creator`.
- When creating or editing shared skills, follow
  `.agents/skills/skill-creator/SKILL.md` and keep skills concise with
  progressive disclosure.

## Git and Tooling Notes

- Use `rg` or `rg --files` for searching when available.
- Avoid destructive git commands such as `reset --hard` unless the user
  explicitly requested them.
- Do not revert unrelated working-tree changes.
- Keep commits focused and describe verification performed in PR notes.
