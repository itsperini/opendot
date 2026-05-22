# OpenDot Roadmap

OpenDot is moving toward an open source, local-first platform for building, tuning, deploying, and operating voice agents on your own infrastructure.

This roadmap is intentionally directional. Priorities may change as the platform, runtime, and device stack mature.

## North Star

OpenDot should make it practical to run a full voice agent pipeline locally and deploy it on bare metal:

```text
audio input -> VAD -> STT -> LLM -> TTS -> audio output
```

The platform should expose each stage clearly, make it easy to test and compare configurations, and keep the path open for hosted, self-hosted, and fully local components.

## Current Milestone: Local Prototype

The current milestone is a complete local loop:

- Create draft agents in the platform UI.
- Configure VAD, STT, LLM, and TTS stages.
- Persist local draft agents and device state.
- Run browser microphone tests through the local voice runtime.
- Stream assistant text and TTS chunks back to the browser.
- Pair Dot devices and bind selected voice configurations.
- Connect ESP32-S3 firmware to the local runtime over WebSocket.

## Near Term

### Platform

- Improve agent creation, editing, duplication, and deletion flows.
- Add stronger validation for pipeline settings.
- Add configuration import/export for agents and runtime presets.
- Improve Browser Test transcript, timing, and audio replay tooling.
- Add clearer empty, loading, disconnected, and error states.

### Runtime

- Stabilize the local WebSocket protocol for browser and device clients.
- Split provider integrations behind explicit adapter boundaries.
- Improve turn detection, interruption handling, and end-of-turn behavior.
- Add structured runtime events for debugging and replay.
- Make runtime configuration easier to inspect and override.

### Device

- Harden Wi-Fi provisioning and activation flows.
- Improve device logs and diagnostics in the platform UI.
- Add clearer runtime availability and binding status.
- Improve OTA/config endpoint behavior for local network changes.

### Documentation

- Expand quickstart and troubleshooting material.
- Add architecture diagrams for platform, runtime, and device flows.
- Document provider keys, environment variables, and local network setup.
- Add firmware setup notes for supported boards.

## Mid Term

### Provider and Model Flexibility

- Add more STT, LLM, and TTS providers.
- Add local model adapters where practical.
- Support OpenAI-compatible local inference servers.
- Support provider presets and per-agent provider selection.
- Add benchmark and evaluation tools for latency, quality, and cost.

### Observability

- Add per-turn traces across VAD, STT, LLM, TTS, and playback.
- Record timing, token usage, audio chunk metadata, and error events.
- Add replay tools for debugging failed or low-quality turns.
- Add exportable session artifacts for reproducible bug reports.

### Configuration and State

- Move beyond browser local storage for serious project state.
- Add workspace-level agent, device, and environment management.
- Add versioned pipeline configurations.
- Add safer secrets handling for local and deployed runtimes.

### Deployment

- Package the runtime for server and bare-metal deployments.
- Add Docker and systemd deployment examples.
- Document reverse proxy, TLS, and local network patterns.
- Add health checks and process supervision guidance.

## Long Term

- Fully local voice pipelines using self-hosted VAD, STT, LLM, and TTS.
- Bare-metal runtime deployments with predictable latency.
- Multi-device and fleet management.
- Policy, permissions, and audit logs for teams.
- Production-grade OTA and device lifecycle management.
- Evaluation harnesses for regression testing agent behavior.
- Plugin architecture for providers, device classes, and custom tools.

## Not Yet Goals

These are important, but not the immediate focus:

- hosted multi-tenant SaaS infrastructure
- marketplace workflows
- enterprise SSO and billing
- broad hardware support before the core runtime and device path stabilize

## Contributing to the Roadmap

Roadmap discussions are welcome. The most useful proposals include:

- the user or operator problem being solved
- the affected layer: platform, runtime, firmware, docs, or deployment
- how it fits the local-first and bare-metal direction
- a small first milestone that can be reviewed and tested
