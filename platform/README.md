# OpenDot Platform Prototype

First prototype for a traditional voice agent platform.

The prototype focuses on the first creation flow:

- Create a draft voice agent with a name and description.
- Attach a default voice pipeline with four explicit stages: VAD, STT, LLM, and TTS.
- Edit first-pass stage settings in the browser.
- Persist draft agents in local storage.

## Pipeline Defaults

The initial pipeline is:

```text
Deepgram VAD -> Deepgram STT -> OpenAI LLM -> Deepgram TTS
```

Deepgram VAD is represented as its own stage, but it maps to Deepgram live streaming options:

- `endpointing`
- `utterance_end_ms`
- `vad_events`
- `interim_results`
- `speech_final`

This keeps the product model clear while still matching how Deepgram exposes end-of-speech behavior in the live listen API.

## Run Locally

```bash
npm install
npm run dev
```

Then open the Vite URL printed in the terminal.

## Test An Agent In The Browser

The browser test uses two local processes:

```bash
# Terminal 1: frontend
npm run dev

# Terminal 2: voice runtime
cp .env.example .env
npm run runtime
```

Add real keys to `.env` before starting the runtime:

```bash
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=...
```

Then:

1. Open the frontend URL, usually `http://localhost:5174`.
2. Create or select a draft agent.
3. Adjust the VAD, STT, LLM, and TTS parameters.
4. In **Browser Test**, click **Connect**.
5. Click **Start mic** and speak.
6. Stop speaking and wait for Deepgram endpointing / utterance end to commit the turn.
7. The assistant text streams back and the generated TTS audio plays in the browser.

If endpointing is too eager or too slow, tune:

- VAD `endpointing`
- VAD `utterance_end_ms`
- STT `language`
- STT `sample_rate`

The default runtime WebSocket is:

```text
ws://localhost:8787/voice
```

Override it for the frontend with:

```bash
VITE_RUNTIME_WS_URL=ws://localhost:8787/voice
```

## Notes

The old API folders are intentionally left untouched:

- `old-api/`
- `old-api-2/`

They were used only as references for provider flow and event sequencing. The new prototype does not copy their implementation.
