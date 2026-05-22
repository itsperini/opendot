<p align="center">
  <img src="assets/opendot-logo.svg" alt="OpenDot" width="50%" />
</p>

OpenDot is an open source, full-stack platform for building, tuning, and managing voice agents.

It brings the control plane, voice runtime, and device layer into one local-first workflow, so teams can develop the full voice loop without treating the pipeline as a black box. The long-term goal is simple: make production-grade voice agents that can run on your own hardware, from a developer laptop to bare-metal deployments.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-early%20prototype-purple.svg)](#project-status)

## Why OpenDot

Most voice agent stacks are split across hosted dashboards, hidden runtime behavior, provider-specific configuration, and disconnected device firmware. OpenDot is designed as a coherent system instead:

- **Full-stack voice agents**: create agents, tune pipeline stages, test live turns, and bind configs to devices.
- **Local-first runtime**: run the web console and realtime voice runtime on your machine during development.
- **Pipeline control**: expose VAD, STT, LLM, and TTS as explicit, replaceable stages.
- **Device-aware workflow**: pair Dot devices, check runtime availability, and bind voice configs to hardware.
- **Open path to bare metal**: start with hosted starter providers today, then move toward local models, self-hosted inference, and on-premise deployments without changing the agent management model.

## Project Status

OpenDot is in an early prototype phase. The current implementation focuses on the first complete local loop:

1. Create a draft voice agent in the platform UI.
2. Configure a traditional voice pipeline: VAD, STT, LLM, and TTS.
3. Test microphone turns in the browser against a local runtime.
4. Pair a Dot device and bind the selected voice configuration.

The starter pipeline currently uses Deepgram and OpenAI-compatible services:

```text
Deepgram VAD -> Deepgram STT -> OpenAI LLM -> Deepgram TTS
```

The runtime is structured around replaceable stages so future work can move more of the stack to local and self-hosted models.

## Repository Layout

```text
.
|-- docs/                  # Mintlify documentation site
|-- dot-device/firmware/   # ESP-IDF firmware for the Dot device prototype
|-- platform/              # React platform UI and local voice runtime
|-- CONTRIBUTING.md        # Contributor guide
|-- NOTICE                 # Third-party and firmware license notices
|-- ROADMAP.md             # Product and engineering roadmap
|-- SECURITY.md            # Vulnerability reporting policy
`-- LICENSE                # AGPLv3 license
```

## Quickstart

Run the platform UI:

```bash
cd platform
npm install
npm run dev
```

Open the Vite URL printed in the terminal. It is usually:

```text
http://localhost:5173
```

Start the realtime voice runtime in a second terminal:

```bash
cd platform
cp .env.example .env
npm run runtime
```

Add provider keys to `platform/.env` before testing live voice sessions:

```bash
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=...
```

Then open the platform, create an agent, review the pipeline settings, connect from **Browser Test**, and speak into the microphone.

## Platform Commands

From `platform/`:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite web console. |
| `npm run runtime` | Start the local realtime voice runtime. |
| `npm run build` | Type-check and build the web app. |
| `npm run preview` | Preview the built web app. |

## Documentation

The docs site lives in `docs/` and is built with Mintlify.

Run the local docs preview from the docs folder:

```bash
cd docs
mint dev
```

## Device Firmware

The Dot device firmware lives in `dot-device/firmware/`. It targets the Waveshare ESP32-S3-AUDIO-Board and uses ESP-IDF.

Current firmware capabilities include:

- Wi-Fi provisioning
- Wake-word flow
- Display support through LVGL
- Dual microphone input and speaker output
- WebSocket connection to the local OpenDot runtime
- Runtime activation through the local OTA/config endpoint

See `dot-device/firmware/README.md` for board setup, flashing, provisioning, and debugging notes.

## Roadmap

OpenDot is moving toward a local-first, provider-pluggable voice agent platform. Major roadmap themes include:

- stable agent and pipeline configuration
- local and self-hosted model support
- stronger device fleet management
- production-ready runtime packaging
- observability, replay, and evaluation tooling

See [ROADMAP.md](ROADMAP.md) for the current roadmap.

## Contributing

OpenDot is being built as a serious open source infrastructure project. Contributions are welcome across the platform UI, voice runtime, firmware, docs, testing, and design.

Start with [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Security

Please do not report security vulnerabilities through public issues. See [SECURITY.md](SECURITY.md) for the responsible disclosure process.

## License

OpenDot is licensed under the [GNU Affero General Public License v3.0](LICENSE).

The firmware under `dot-device/firmware` includes MIT-licensed upstream work from the xiaozhi firmware project. See [NOTICE](NOTICE) and [dot-device/firmware/LICENSE.xiaozhi](dot-device/firmware/LICENSE.xiaozhi).
