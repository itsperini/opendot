# Contributing to OpenDot

Thanks for taking the time to contribute. OpenDot is the open platform for voice
agents on real devices. The best contributions improve one part of the loop:

```text
build -> tune -> bind -> run -> review
```

The canonical contributor map lives in
[`docs/contribution-areas.mdx`](docs/contribution-areas.mdx). Use this root file
for setup, pull request expectations, and the checks maintainers expect.

## Project Principles

- **Real devices first:** agent configuration should connect cleanly to hardware,
  sessions, and deployment targets.
- **Pipeline transparency:** VAD, STT/ASR, LLM, and TTS should stay visible,
  tunable, and replaceable.
- **Agent context matters:** prompts, knowledge, models, tools, and runtime
  presets should be understandable and portable.
- **Flexible operation:** cloud, local-network, bare-metal, and on-device paths
  should share a coherent product model.
- **Small, reviewable changes:** prefer focused pull requests over broad
  rewrites.

## Contribution Tracks

| Track                                | Good contributions                                                                                                                    | Minimum checks                                                 |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Voice Pipeline & Providers           | VAD, STT/ASR, LLM, TTS, realtime APIs, provider adapters, modular stage contracts                                                     | Platform checks plus live Browser Test when possible           |
| Voice Agents & Harnesses             | Prompts, knowledge, tools, local model harnesses, evals, framework integration categories                                             | Platform checks and docs when behavior changes                 |
| Platform Control Plane               | Agent Studio, Configuration, Browser Test, Dot Device, Settings, runtime diagnostics UX                                               | `pnpm run lint && pnpm run test && pnpm run build`             |
| Platform Backend & Data              | Fastify API, auth, Drizzle/Postgres schema, runtime tokens, settings, deployments, API contracts                                      | Platform checks plus migration review when data changes        |
| Media Transport                      | WebSocket audio/data sessions, browser WebRTC Realtime sessions, device Realtime bridge, runtime protocols, future SFU/fleet adapters | Platform checks plus manual runtime testing                    |
| Device Communication & Fleet         | Device presence, desired/reported state, commands, telemetry, diagnostics, OTA metadata                                               | Platform/runtime checks and device notes when relevant         |
| Dot Hardware                         | CAD, enclosure, acoustics, PCB, BOM, fixtures, manufacturability, reference constraints                                               | Hardware/source review and docs checks                         |
| Dot Firmware & Edge                  | ESP-IDF drivers, provisioning, wake/audio/display, exploratory MicroPython and inference research                                     | `idf.py build` when ESP-IDF is available                       |
| Docs, Tooling & Developer Experience | Setup docs, diagrams, examples, CI, templates, contributor workflow                                                                   | `pnpm run format:check -- docs` and link checks when available |

MicroPython runtime work and on-device inference are exploratory later tracks,
not current firmware architecture. Keep proposals honest about memory, latency,
model size, and firmware impact.

## Development Setup

Clone the repository and install the platform dependencies:

```bash
git clone git@github.com:itsperini/opendot.git
cd opendot
cp .env.example .env
corepack enable
corepack prepare pnpm@11.1.3 --activate
pnpm install
```

Run the web console, API, and runtime as separate processes:

```bash
pnpm run api
pnpm run dev
pnpm run runtime
```

Add provider keys to the root `.env` when testing live audio:

```bash
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=...
```

`OPENAI_BASE_URL` affects the Sandwich LLM stage only. Speech-to-speech Browser
Test and Speech-to-speech Dot sessions use the runtime's `OPENAI_API_KEY` for
OpenAI Realtime.

For the fastest full-stack local run, Docker Compose is also available:

```bash
docker compose up --build
```

Open the console at `http://localhost:5173`.

## Before Opening a Pull Request

- Target `develop` for normal pull requests. `main` is the stable release
  branch and receives promotion PRs from `develop`.
- Use a Conventional Commit PR title. Squash merges use the PR title as the
  commit semantic-release reads.
- Choose one contribution track and one user-visible or operator-visible
  outcome.
- Update docs when setup, runtime behavior, configuration, device flow, or
  architecture changes.
- Include screenshots or short recordings for visible UI changes.
- Describe browser, runtime, firmware, or device testing when touching audio,
  WebSocket, WebRTC, activation, provisioning, firmware, or hardware behavior.
- Keep secrets out of commits. Use `.env` locally and keep `.env.example` safe.

Examples:

```text
feat(platform): add device pairing status
fix(runtime): close stale voice sessions
docs: clarify firmware setup
```

Run the checks that match your change:

```bash
pnpm run ci
```

For docs changes, also run Mintlify link validation from `docs/` when the CLI is
available:

```bash
cd docs
mint broken-links
```

For firmware changes, build with the ESP-IDF environment described in
`dot-device/firmware/README.md`.

## Release Flow

OpenDot uses one repository-wide product version. Git tags named `vX.Y.Z` and
GitHub Releases are the canonical release record for the platform UI, local
runtime, firmware source, docs, and repository tooling.

The release flow is:

1. Contributors open PRs against `develop`.
2. Maintainers squash-merge PRs into `develop` with a valid Conventional Commit
   title.
3. When a release is ready, maintainers open a promotion PR from `develop` to
   `main`.
4. The promotion PR is merged with a normal merge commit so semantic-release can
   analyze the individual squashed PR commits.
5. CI on `main` runs semantic-release, creates the next `vX.Y.Z` tag, and
   publishes GitHub Release notes.

The initial release package is source plus release notes only. Docker images,
npm packages, firmware binaries, and firmware OTA version syncing are deferred
until those distribution channels are intentionally added.

## Public Alpha Release Checklist

Before a public alpha release, maintainers should confirm:

- `v0.1.0` remains as published history; do not move pushed release tags.
- The release ships source and GitHub Release notes only.
- No Docker images, npm packages, firmware binaries, or OTA channel are implied.
- Local platform checks pass with Node 24: `pnpm run ci`.
- Dependency audit has no known moderate-or-higher vulnerabilities:
  `pnpm audit --audit-level moderate`.
- Docs links pass with `cd docs && mint broken-links`.
- `docker compose config --quiet` passes.
- GitHub issue template YAML and checked-in SVG diagrams parse.
- Firmware builds with ESP-IDF 5.5.2 from `dot-device/firmware`.
- Firmware logs do not print Wi-Fi passwords, provider keys, runtime secrets, or
  device credentials.
- Browser Test completes one full spoken turn with real provider keys before
  release notes claim the live voice loop works.

## Documentation Guidelines

- Write docs for someone setting up the project for the first time.
- Prefer concrete commands and expected outputs over vague descriptions.
- Keep prototype limitations visible instead of hiding them.
- Keep the docs canonical and link root files back to them when the detail grows.
- Update `README.md`, `docs/`, or firmware notes when a contribution changes
  setup or architecture.

## Reporting Bugs

When opening a bug report, include:

- the affected contribution track
- your operating system and relevant tool versions
- steps to reproduce
- expected behavior
- actual behavior
- logs, screenshots, or serial output when relevant

## Security Issues

Do not open public issues for vulnerabilities. Follow the process in
[SECURITY.md](SECURITY.md).
