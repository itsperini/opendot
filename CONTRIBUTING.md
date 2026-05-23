# Contributing to OpenDot

Thanks for taking the time to contribute. OpenDot is the open platform for voice agents on real devices, and good contributions can come from many directions: product thinking, platform UI, realtime runtime work, firmware, documentation, tests, examples, and issue triage.

## Project Principles

- **Real devices first**: agent configuration should connect cleanly to hardware, sessions, and deployment targets.
- **Pipeline transparency**: VAD, STT, LLM, and TTS should be visible, tunable, and replaceable.
- **Agent context matters**: prompts, knowledge, models, and runtime presets should be understandable and portable.
- **Flexible operation**: cloud, local-network, and on-device sessions should share a coherent product model.
- **Small, reviewable changes**: prefer focused pull requests over broad rewrites.

## Ways to Contribute

- Fix bugs in the platform UI or local runtime.
- Improve provider adapters, audio handling, streaming behavior, or runtime configuration.
- Improve ESP-IDF firmware setup, provisioning, device activation, or diagnostics.
- Add documentation, diagrams, examples, and troubleshooting notes.
- Improve type safety, validation, testing, and release hygiene.
- Open issues that clearly describe expected behavior, actual behavior, and reproduction steps.

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

Start the web console:

```bash
pnpm run dev
```

Start the local voice runtime in a second terminal:

```bash
pnpm run runtime
```

Add provider keys to the root `.env` when testing live audio:

```bash
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=...
```

## Project Structure

```text
docs/                  Mintlify documentation
dot-device/firmware/   ESP-IDF firmware for the Dot device prototype
platform/              React platform UI and local voice runtime
```

## Before Opening a Pull Request

Run the checks that match your change:

```bash
pnpm run ci
```

For docs changes:

```bash
cd docs
mint broken-links
```

For firmware changes, build with the ESP-IDF environment described in `dot-device/firmware/README.md`.

Target the `develop` branch for normal pull requests. `main` is the stable
release branch; maintainers promote `develop` to `main` when the next release is
ready.

Use a Conventional Commit pull request title because squash merges use the PR
title as the commit that semantic-release reads:

```text
feat(platform): add device pairing status
fix(runtime): close stale voice sessions
docs: clarify firmware setup
```

Release-impacting types are `feat`, `fix`, and `perf`. `docs`, `chore`, `ci`,
`test`, `style`, `refactor`, and `build` do not create a release unless the
commit is intentionally marked as breaking with `!` or a `BREAKING CHANGE:`
footer.

## Pull Request Guidelines

- Keep the pull request focused on one problem or feature.
- Include a concise description of the change and why it matters.
- Add screenshots or short recordings for visible UI changes.
- Describe runtime or device testing when audio, WebSocket, firmware, or provisioning behavior changes.
- Update docs when behavior, setup, configuration, or user workflows change.
- Avoid unrelated formatting churn and broad refactors in feature PRs.

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
until those distribution channels are intentionally added. Firmware source
changes can still affect the OpenDot version when they add, fix, or break user
behavior.

## Coding Guidelines

- Follow the style already present in the touched files.
- Prefer explicit, readable control flow over clever abstractions.
- Keep runtime configuration names clear and documented.
- Keep provider-specific behavior behind replaceable boundaries where possible.
- Treat firmware and runtime logs as user-facing diagnostics: make them useful.

## Documentation Guidelines

- Write docs for someone setting up the project for the first time.
- Prefer concrete commands and expected outputs over vague descriptions.
- Keep prototype limitations visible instead of hiding them.
- Update `README.md`, `docs/`, or firmware notes when the contribution changes setup or architecture.

## Reporting Bugs

When opening a bug report, include:

- the affected area: platform, runtime, docs, or firmware
- your operating system and relevant tool versions
- steps to reproduce
- expected behavior
- actual behavior
- logs, screenshots, or serial output when relevant

## Security Issues

Do not open public issues for vulnerabilities. Follow the process in [SECURITY.md](SECURITY.md).
