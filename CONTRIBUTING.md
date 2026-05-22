# Contributing to OpenDot

Thanks for taking the time to contribute. OpenDot is an open source, full-stack platform for local-first voice agents, and good contributions can come from many directions: product thinking, platform UI, realtime runtime work, firmware, documentation, tests, examples, and issue triage.

## Project Principles

- **Local-first by default**: the core development loop should work on a laptop with clear runtime boundaries.
- **Pipeline transparency**: VAD, STT, LLM, and TTS should be visible, tunable, and replaceable.
- **Device-aware design**: agent configuration should connect cleanly to real hardware and deployment targets.
- **Production direction**: prototypes should leave a path toward reliable, observable, bare-metal operation.
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
cd opendot/platform
npm install
```

Start the web console:

```bash
npm run dev
```

Start the local voice runtime in a second terminal:

```bash
cp .env.example .env
npm run runtime
```

Add provider keys to `platform/.env` when testing live audio:

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
cd platform
npm run build
```

For docs changes:

```bash
cd docs
mint broken-links
```

For firmware changes, build with the ESP-IDF environment described in `dot-device/firmware/README.md`.

## Pull Request Guidelines

- Keep the pull request focused on one problem or feature.
- Include a concise description of the change and why it matters.
- Add screenshots or short recordings for visible UI changes.
- Describe runtime or device testing when audio, WebSocket, firmware, or provisioning behavior changes.
- Update docs when behavior, setup, configuration, or user workflows change.
- Avoid unrelated formatting churn and broad refactors in feature PRs.

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
