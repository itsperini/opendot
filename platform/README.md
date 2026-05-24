# OpenDot Platform

OpenDot is the open platform for voice agents on real devices.

This app is the current platform workbench for building and tuning voice agents,
configuring their runtime behavior, testing sessions, and binding active
identity configs to hardware.

The current implementation focuses on the first creation flow:

- Create an agent identity with a name and description.
- Attach a default voice pipeline with four explicit stages: VAD, STT, LLM, and TTS.
- Switch an agent to OpenAI Realtime speech-to-speech when direct audio-in/audio-out testing is needed.
- Edit first-pass pipeline, model, realtime, and runtime settings in the browser.
- Test live sessions against the local voice runtime.
- Persist identities, settings, devices, and SDK key metadata in PostgreSQL.

## Pipeline Defaults

The initial pipeline is:

```text
Deepgram VAD -> Deepgram STT -> OpenAI-compatible LLM -> Deepgram TTS
```

Deepgram VAD is represented as its own stage, but it maps to Deepgram live streaming options:

- `endpointing`
- `utterance_end_ms`
- `vad_events`
- `interim_results`
- `speech_final`

This keeps the product model clear while still matching how Deepgram exposes end-of-speech behavior in the live listen API.

Speech-to-speech agents keep the same identity and saved versioning model, but
Browser Test connects with native WebRTC through an OpenAI Realtime client
secret minted by the runtime.

## Run Locally

Create the root environment file from the repository root:

```bash
cp .env.example .env
```

Then install dependencies and apply migrations from `platform/`:

```bash
corepack enable
corepack prepare pnpm@11.1.3 --activate
pnpm install
pnpm --filter ./platform run db:migrate
```

Start the API and web console in separate terminals:

```bash
# Terminal 1
pnpm run api

# Terminal 2
pnpm run dev
```

Then open the Vite URL printed in the terminal.

## Run With Docker Compose

From the repository root:

```bash
cp .env.example .env
docker compose up --build
```

Add provider keys to the root `.env` before testing live voice sessions.

The Compose stack runs PostgreSQL, the migration job, the platform API, the
voice runtime, and an Nginx-served production build of the web console. The web
console is available at `http://localhost:5173`, and the runtime remains exposed
at `http://localhost:8787` for browser WebSocket sessions and local devices.
Create a local email/password account on the auth page to enter the workspace.

The database schema is portable PostgreSQL with a Supabase Auth bridge. Supabase
owns authentication when configured, while the OSS core owns `app_users`, local
auth credentials, user preferences, SDK API keys, versioned agents and
pipelines, devices, device activation requests, device credentials, runtime
session tokens, device state, and deployments. The schema stays focused on the
product surfaces that are active today.

## Inspect The Database

The platform schema is defined with Drizzle in `src/server/db/schema.ts`, and
migrations live in `drizzle/`.

Start the local Compose database and apply migrations:

```bash
docker compose up -d postgres migrate
```

Then launch Drizzle Studio:

```bash
pnpm --filter ./platform run db:studio
```

Open `https://local.drizzle.studio` to inspect tables, columns, and stored data.
The local connector listens on `127.0.0.1` while the Studio UI opens in the
browser. For Supabase, set `POSTGRES_URI` and `POSTGRES_SSL=true` in the root
`.env` before launching Studio. If the API should verify Supabase
access tokens, also set `SUPABASE_URL`; add `SUPABASE_JWT_SECRET` only for
legacy HS256 projects. Local Compose uses `PLATFORM_AUTH_REQUIRED=true` with
OpenDot local email/password auth unless `VITE_SUPABASE_URL` and
`VITE_SUPABASE_ANON_KEY` are configured for Supabase Auth.

## Test An Agent In The Browser

The browser test uses the platform API, frontend, and voice runtime:

```bash
# Terminal 1: platform API
pnpm run api

# Terminal 2: frontend
pnpm run dev

# Terminal 3: voice runtime
pnpm run runtime
```

Add real keys to the root `.env` before starting the runtime:

```bash
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=...
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-5-mini
OPENAI_MAX_OUTPUT_TOKENS=512
OPENAI_REASONING_EFFORT=low
OPENAI_VERBOSITY=low
```

For the Sandwich architecture:

1. Open the frontend URL, usually `http://localhost:5173`.
2. Create or select an agent identity.
3. Adjust the VAD, STT, LLM, and TTS parameters.
4. In **Browser Test**, click **Connect**.
5. Click **Start mic** and speak.
6. Stop speaking and wait for Deepgram endpointing / utterance end to commit the turn.
7. The assistant text streams back and the generated TTS audio chunks play in the browser.

For Speech-to-speech:

1. Open **Configuration** for the active agent.
2. Switch to **Speech-to-speech Architecture** and adjust the OpenAI Realtime settings.
3. Open **Browser Test** and click **Connect**.
4. Click **Start mic** and speak.
5. Use **Interrupt**, **Reset**, and **Disconnect** to test turn-taking behavior.

The browser never receives `OPENAI_API_KEY`. The platform API creates a
short-lived runtime token at `POST /api/runtime/realtime-browser-sessions`, the
runtime exchanges it at `/realtime/client-secret` for an OpenAI Realtime client
secret with its own `OPENAI_API_KEY`, and the browser uses that short-lived
client secret for the WebRTC call.

The runtime instructs the voice agent to emit XML-like TTS chunks:

```xml
<chunk>First spoken phrase.</chunk><chunk>Next spoken phrase.</chunk>
```

Each closed chunk is synthesized immediately while the rest of the answer is still streaming, then queued for playback. The browser test keeps the generated chunks in the UI so each one can be replayed separately, and the assistant panel can toggle between clean spoken text and the raw `<chunk>` XML stream. The ESP32 device path also closes the audio websocket shortly after each completed turn so the firmware returns to idle/wake-word mode instead of staying in continuous listening.

For browser TTS experiments, the TTS stage exposes:

- TTS `encoding`
- TTS `sample_rate`
- TTS `Browser delivery`
- TTS `Chunk style`

Use `Linear16 PCM` plus `Direct PCM stream` to hear raw PCM as it arrives. Other encodings, including Opus, are retained as chunked audio files for browser playback.

The LLM stage exposes `System prompt and chunk rules`, which is prefilled with
the voice assistant system prompt and the editable `<chunk>` formatting
instructions. It also supports OpenAI-compatible base URLs, custom model IDs,
and either Responses or Chat Completions provider APIs. The runtime still adds
the selected TTS chunk style as a final length hint.

If endpointing is too eager or too slow, tune:

- VAD `endpointing`
- VAD `utterance_end_ms`
- STT `language`
- STT `sample_rate`

For balanced lower-latency device turns, the local defaults are:

```bash
DEEPGRAM_ENDPOINTING_MS=300
DEEPGRAM_UTTERANCE_END_MS=1000
MIN_TRANSCRIPT_CHARS=2
CLOSE_DEVICE_AFTER_TURN=true
CLOSE_DEVICE_AFTER_TURN_DELAY_MS=300
```

The TTS runtime default sample rate is:

```bash
DEEPGRAM_TTS_SAMPLE_RATE=24000
```

The default runtime WebSocket is:

```text
ws://localhost:8787/voice
```

Override it for the frontend with:

```bash
VITE_RUNTIME_WS_URL=ws://localhost:8787/voice
```

## Deploy On Render

The root `render.yaml` defines `opendot-web`, `opendot-api`, and
`opendot-runtime`. The API runs migrations as a Render pre-deploy command.

For the first Render preview, provide these `sync: false` values in Render:

```text
POSTGRES_URI=<supabase postgres connection string>
POSTGRES_SSL=true
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_JWT_SECRET=
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<supabase anon key>
VITE_PLATFORM_API_URL=https://<opendot-api>.onrender.com/api
VITE_RUNTIME_HTTP_URL=https://<opendot-runtime>.onrender.com
VITE_RUNTIME_WS_URL=wss://<opendot-runtime>.onrender.com/voice
OPENDOT_RUNTIME_INTERNAL_SECRET=<shared api/runtime secret>
OPENDOT_RUNTIME_PUBLIC_HTTP_URL=https://<opendot-runtime>.onrender.com
OPENDOT_RUNTIME_PUBLIC_WS_URL=wss://<opendot-runtime>.onrender.com/voice
PLATFORM_API_INTERNAL_URL=https://<opendot-api>.onrender.com/api
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=...
OPENAI_BASE_URL=
OPENAI_MODEL=gpt-5-mini
OPENAI_MAX_OUTPUT_TOKENS=512
OPENAI_REASONING_EFFORT=low
OPENAI_VERBOSITY=low
```

`PLATFORM_AUTH_REQUIRED` is `true` in the Blueprint, and local password auth is
disabled there so Supabase owns Render authentication. Disable email
confirmations in Supabase Auth for this preview if signup should create an
active session immediately.

The runtime verifies browser voice-session tokens, realtime browser-session
tokens, and device credentials with the platform API. Sandwich Browser Test uses
`/voice`, Dot devices use `/ws`, and Speech-to-speech Browser Test uses
`/realtime/client-secret` before the browser connects to OpenAI Realtime with an
ephemeral client secret. Keep `OPENDOT_RUNTIME_INTERNAL_SECRET` identical on the
API and runtime services.
