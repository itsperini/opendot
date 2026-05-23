<p align="center">
  <img src="assets/opendot-logo.svg" alt="OpenDot" width="72%" />
</p>

<p align="center">
  <strong>The open platform for voice agents on real devices.</strong>
</p>

<p align="center">
  Build and tune the voice pipeline, configure agents with knowledge and models, bind them to hardware, and operate sessions in the cloud, local network, or on-device.
</p>

<div align="center">
  <a href="https://docs.opendot.ai">
    <img src="https://img.shields.io/badge/Docs-5B21B6.svg?logo=readthedocs&logoColor=white" alt="Docs">
  </a>
  <a href="#project-status">
    <img src="https://img.shields.io/badge/status-early%20prototype-purple.svg" alt="Project status">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/License-AGPL%20v3-blue.svg" alt="License: AGPL v3">
  </a>
</div>

<div>
  <p align="center">
    <a href="https://x.com/itsperini">
      <img src="https://img.shields.io/badge/Follow%20@itsperini-000000?style=for-the-badge&logo=x&logoColor=white" alt="Follow @itsperini on X" />
    </a>
    <a href="https://discord.gg/M2Y8VC2H">
      <img src="https://img.shields.io/badge/Join%20Discord-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join Discord" />
    </a>
  </p>
</div>

## Why OpenDot

Most voice agent stacks are split across hosted dashboards, hidden runtime behavior, provider-specific configuration, and disconnected device firmware. OpenDot is designed as a coherent operating layer for agents that need to run beyond a browser demo:

- **Voice pipeline control**: build and tune VAD, STT, LLM, and TTS stages as explicit, replaceable components.
- **Agent configuration**: connect agents to prompts, knowledge, model choices, and runtime presets.
- **Real hardware binding**: bind voice configs to Dot devices and inspect runtime availability.
- **Flexible operation**: run sessions in the cloud, local network, or on-device as the stack matures.
- **Open path to bare metal**: start with hosted starter providers today, then move toward local models, self-hosted inference, and real-device deployments without changing the agent management model.

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

Run the full local platform with Docker Compose:

```bash
cp .env.example .env
docker compose up --build
```

Add provider keys to the root `.env` before testing live voice sessions.

Open:

```text
http://localhost:5173
```

The Compose stack starts PostgreSQL, applies migrations, serves the web console,
and exposes the voice runtime on `http://localhost:8787`. The web console now
opens on the auth page; create a local email/password account to enter the
workspace.

The platform database is Supabase-compatible without requiring Supabase locally:
OpenDot keeps product identity and core data in `app_users`,
`local_auth_credentials`, `user_preferences`, SDK API keys, versioned agents and
pipelines, devices, device activation requests, device credentials, runtime
session tokens, device state, and deployments. When Supabase Auth is
configured, `auth.users.id` maps to `app_users.id`; otherwise Compose uses
OpenDot's local password auth. The local schema stays focused on the product
surfaces that are active today.

Inspect the local database with Drizzle Studio:

```bash
pnpm --filter ./platform run db:studio
```

Then open `https://local.drizzle.studio`. For the Compose database, make sure
`postgres` is running first with `docker compose up -d postgres migrate`.

For fast frontend/runtime development against a local or hosted Postgres:

```bash
corepack enable
corepack prepare pnpm@11.1.3 --activate
pnpm install
pnpm --filter ./platform run db:migrate
```

For Supabase Postgres, set `POSTGRES_URI` to the Supabase connection string and
`POSTGRES_SSL=true`. Set `SUPABASE_URL` so the API can verify Supabase Bearer
tokens through JWKS; add `SUPABASE_JWT_SECRET` only for legacy HS256 projects.
Leave `OPENDOT_LOCAL_AUTH_DISABLED=false` for local email/password auth.

Then start the API and web console in separate terminals:

```bash
# Terminal 1
pnpm run api

# Terminal 2
pnpm run dev
```

Open the Vite URL printed in the terminal. It is usually:

```text
http://localhost:5173
```

Start the realtime voice runtime in another terminal:

```bash
pnpm run runtime
```

Add provider keys to the root `.env` before testing live voice sessions:

```bash
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=...
```

Then open the platform, create an agent, review the pipeline settings, connect from **Browser Test**, and speak into the microphone.

## Render Deployment

The repository includes a root `render.yaml` Blueprint for a Render deployment
backed by Supabase Postgres:

- `opendot-web`: static Vite build.
- `opendot-api`: Docker web service with pre-deploy migrations.
- `opendot-runtime`: Docker web service for realtime voice sessions.

Create a Render Blueprint from the repository root and fill the `sync: false`
values in the Render dashboard. Use the Supabase connection string for
`POSTGRES_URI`, set `POSTGRES_SSL=true`, and set the public frontend build
values to the deployed service URLs:

```text
POSTGRES_URI=<supabase postgres connection string>
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_JWT_SECRET=
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<supabase anon key>
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=...
VITE_PLATFORM_API_URL=https://<opendot-api>.onrender.com/api
VITE_RUNTIME_HTTP_URL=https://<opendot-runtime>.onrender.com
VITE_RUNTIME_WS_URL=wss://<opendot-runtime>.onrender.com/voice
OPENDOT_RUNTIME_INTERNAL_SECRET=<shared api/runtime secret>
OPENDOT_RUNTIME_PUBLIC_HTTP_URL=https://<opendot-runtime>.onrender.com
OPENDOT_RUNTIME_PUBLIC_WS_URL=wss://<opendot-runtime>.onrender.com/voice
PLATFORM_API_INTERNAL_URL=https://<opendot-api>.onrender.com/api
```

The Render Blueprint is auth-gated: `PLATFORM_AUTH_REQUIRED=true` and
`OPENDOT_LOCAL_AUTH_DISABLED=true`. For password signup without email
verification, disable email confirmations in the Supabase Auth settings for the
preview project.

The runtime now verifies browser voice-session tokens and device credentials
with the platform API before accepting `/voice` or `/ws` connections. Keep
`OPENDOT_RUNTIME_INTERNAL_SECRET` identical on the API and runtime services.

## Platform Commands

From the repository root:

| Command                                   | Purpose                                      |
| ----------------------------------------- | -------------------------------------------- |
| `pnpm install`                            | Install workspace dependencies.              |
| `pnpm run api`                            | Start the Postgres-backed platform API.      |
| `pnpm --filter ./platform run db:migrate` | Apply local database migrations.             |
| `pnpm --filter ./platform run db:studio`  | Browse the Drizzle/Postgres schema and data. |
| `pnpm run dev`                            | Start the Vite web console.                  |
| `pnpm run runtime`                        | Start the local realtime voice runtime.      |
| `pnpm run lint`                           | Run platform lint checks.                    |
| `pnpm run test`                           | Run platform unit tests.                     |
| `pnpm run build`                          | Type-check and build the web app.            |
| `pnpm --filter ./platform run preview`    | Preview the built web app.                   |

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

OpenDot is moving toward an open, provider-pluggable platform for voice agents on real devices. Major roadmap themes include:

- stable agent and pipeline configuration
- knowledge and model configuration for agents
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
