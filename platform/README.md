# OpenDot Platform

OpenDot is the open platform for voice agents on real devices.

This app is the current platform workbench for building and tuning voice agents, configuring their runtime behavior, testing sessions, and binding selected configs to hardware.

The current implementation focuses on the first creation flow:

- Create a draft voice agent with a name and description.
- Attach a default voice pipeline with four explicit stages: VAD, STT, LLM, and TTS.
- Edit first-pass pipeline, model, and runtime settings in the browser.
- Test live sessions against the local voice runtime.
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

1. Open the frontend URL, usually `http://localhost:5173`.
2. Create or select a draft agent.
3. Adjust the VAD, STT, LLM, and TTS parameters.
4. In **Browser Test**, click **Connect**.
5. Click **Start mic** and speak.
6. Stop speaking and wait for Deepgram endpointing / utterance end to commit the turn.
7. The assistant text streams back and the generated TTS audio chunks play in the browser.

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

The LLM stage exposes `System prompt and chunk rules`, which is prefilled with the voice assistant system prompt and the editable `<chunk>` formatting instructions. The runtime still adds the selected TTS chunk style as a final length hint.

If endpointing is too eager or too slow, tune:

- VAD `endpointing`
- VAD `utterance_end_ms`
- STT `language`
- STT `sample_rate`

For less sensitive device turns, the local defaults are:

```bash
DEEPGRAM_ENDPOINTING_MS=900
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

## Notes

The old API folders are intentionally left untouched:

- `old-api/`
- `old-api-2/`

They were used only as references for provider flow and event sequencing. The new prototype does not copy their implementation.
