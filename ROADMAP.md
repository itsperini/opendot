# OpenDot Roadmap

OpenDot is the open platform for voice agents on real devices.

The roadmap is organized around one product loop:

```text
build -> tune -> bind -> run -> review
```

The canonical detailed roadmap lives in [`docs/roadmap.mdx`](docs/roadmap.mdx).
This root file is the concise entry point for contributors and maintainers.

## North Star

OpenDot should make it practical to run a full voice agent pipeline wherever the
agent needs to live:

```text
audio input -> VAD -> STT/ASR -> LLM -> TTS -> audio output
```

The platform should expose each stage clearly, make it easy to test and compare
configurations, attach knowledge and model choices to agents, bind those agents
to hardware, and keep the path open for cloud, local-network, bare-metal, and
on-device runtimes.

## Current

Current work should make the local prototype reliable:

- Create and select draft agents in the platform console.
- Configure Sandwich VAD, STT/ASR, LLM, and TTS stages.
- Test Sandwich microphone turns in Browser Test through runtime `/voice`.
- Switch Browser Test agents to Speech-to-speech for native browser WebRTC with
  OpenAI Realtime.
- Bind Speech-to-speech agents to Dot devices through the runtime `/ws`
  Realtime bridge.
- Pair Dot devices, claim activation codes, and bind selected agent configs.
- Keep Fastify, Drizzle, PostgreSQL, and runtime token boundaries clear.
- Run ESP-IDF firmware on the Waveshare ESP32-S3-AUDIO-Board reference target.
- Keep setup docs, diagrams, and verification commands accurate.

## Next

Next work should make OpenDot easier to extend:

- Split voice provider integrations behind clearer adapter boundaries.
- Improve stage validation, turn handling, interruptions, and runtime events.
- Add stronger agent configuration, knowledge/model surfaces, harnesses, and
  eval fixtures.
- Improve Agent Studio, Browser Test timing/replay, device status, and runtime
  diagnostics UX.
- Harden backend validation, API contracts, runtime tokens, device credentials,
  settings, deployments, and migrations.
- Improve device diagnostics, activation, OTA metadata, reconnect behavior, and
  firmware logs.
- Convert reference-board learnings into open hardware requirements.
- Expand troubleshooting, diagrams, examples, CI checks, and contributor
  onboarding.

## Later

Later work should open deeper deployment and hardware paths:

- Fully local or self-hosted VAD, STT/ASR, LLM, and TTS options.
- Expand realtime media beyond the current browser WebRTC and device bridge
  paths: SFU-style fleet paths and lower-level WebSocket bridges where needed.
- MQTT-style device presence, desired/reported state, commands, telemetry,
  diagnostics, OTA metadata, and multi-device coordination.
- Purpose-built open Dot hardware with CAD, PCB, BOM, fixtures, acoustic notes,
  and repeatable firmware flashing.
- Exploratory MicroPython runtime and on-device inference research with honest
  memory, latency, model-size, and firmware-impact constraints.
- Session history, replay artifacts, eval harnesses, and reproducible bug
  reports across pipeline stages and devices.
- Production deployment guidance for cloud, local-network, and bare-metal
  runtime targets.

## Not Yet Goals

These are important, but not the immediate focus:

- hosted multi-tenant SaaS infrastructure
- marketplace workflows
- enterprise SSO, billing, and procurement
- broad hardware support before the runtime, firmware, and reference-device path
  stabilize
- a named integration matrix before provider, framework, and transport
  categories are stable enough to maintain

## Contributing to the Roadmap

Roadmap discussions are welcome. The most useful proposals include:

- the user, operator, or contributor problem being solved
- the affected contribution area from
  [`docs/contribution-areas.mdx`](docs/contribution-areas.mdx)
- how it fits the real-device, cloud, local-network, bare-metal, or on-device
  direction
- a small first milestone that can be reviewed and tested
