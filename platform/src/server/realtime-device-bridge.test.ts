import { describe, expect, it, vi } from "vitest";
import {
  createPcmToOpusFrameEncoder,
  createDeviceRealtimeBridge,
  deviceRuntimeCredentialStatus,
  realtimeSessionUpdatePayload,
  realtimeWebSocketUrl,
  resamplePcm16Mono,
} from "./realtime-device-bridge.js";

class FakeRealtimeWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  static instances: FakeRealtimeWebSocket[] = [];

  url: string;
  options: { headers: Record<string, string> };
  readyState: number;
  handlers: Map<string, Array<(...args: any[]) => void>>;
  sent: Array<Record<string, any>>;
  closeCode: number | null = null;
  closeReason: string | null = null;

  constructor(url: string, options: { headers: Record<string, string> }) {
    this.url = url;
    this.options = options;
    this.readyState = FakeRealtimeWebSocket.CONNECTING;
    this.handlers = new Map();
    this.sent = [];
    FakeRealtimeWebSocket.instances.push(this);
  }

  on(event: string, handler: (...args: any[]) => void) {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }

  emit(event: string, ...args: any[]) {
    for (const handler of this.handlers.get(event) || []) {
      handler(...args);
    }
  }

  open() {
    this.readyState = FakeRealtimeWebSocket.OPEN;
    this.emit("open");
  }

  send(payload: string) {
    this.sent.push(JSON.parse(payload));
  }

  close(code: number, reason: string) {
    this.readyState = FakeRealtimeWebSocket.CLOSED;
    this.closeCode = code;
    this.closeReason = reason;
    this.emit("close", code, reason);
  }

  serverEvent(event: Record<string, any>) {
    this.emit("message", Buffer.from(JSON.stringify(event)));
  }
}

class FakeOpusScript {
  static Application = { AUDIO: "audio", VOIP: "voip" };
  static decodedFrameSizes: number[] = [];
  static deleted = 0;

  sampleRate: number;

  constructor(sampleRate: number) {
    this.sampleRate = sampleRate;
  }

  decode(frame: Buffer, frameSize: number) {
    FakeOpusScript.decodedFrameSizes.push(frameSize);
    return frame;
  }

  encode(frame: Buffer) {
    return Buffer.from(`opus-${this.sampleRate}-${frame.length}`);
  }

  delete() {
    FakeOpusScript.deleted += 1;
  }
}

function runtimeConfig(overrides: Record<string, any> = {}) {
  return {
    agentName: "Realtime Dot",
    description: "A hardware voice agent.",
    architecture: "speech_to_speech",
    realtime: {
      model: "gpt-realtime-2",
      voice: "cedar",
      instructions: "Answer from the device speaker.",
      reasoningEffort: "low",
      turnDetection: {
        type: "semantic_vad",
        eagerness: "auto",
        threshold: 0.5,
        prefixPaddingMs: 300,
        silenceDurationMs: 500,
        createResponse: true,
        interruptResponse: true,
      },
    },
    ...overrides,
  };
}

function createHarness(
  options: {
    runtimeConfig?: Record<string, any>;
    fallbackCommitDelayMs?: number;
  } = {},
) {
  FakeRealtimeWebSocket.instances = [];
  FakeOpusScript.decodedFrameSizes = [];
  FakeOpusScript.deleted = 0;
  const deviceJson: Array<Record<string, any>> = [];
  const binaryFrames: Buffer[] = [];
  const states: Array<{ state: string; text: string | null }> = [];
  const marks: string[] = [];
  const closeDeviceAfterTurn = vi.fn();
  const session: Record<string, any> = {
    id: "session-1",
    deviceId: "device-1",
    runtimeConfig: runtimeConfig(options.runtimeConfig),
    realtimeBridge: null,
    processing: false,
    listening: false,
    turnAudioFrames: 0,
    turnAudioBytes: 0,
    turnTimings: {
      startedAt: Date.now(),
      marks: new Map(),
    },
    transport: {
      isOpen: () => true,
      sendBinary: (frame: Buffer) => {
        binaryFrames.push(frame);
      },
    },
  };
  const bridge = createDeviceRealtimeBridge({
    session,
    apiKey: "sk-test",
    safetyIdentifier: "safety-id",
    WebSocketImpl: FakeRealtimeWebSocket,
    OpusScriptImpl: FakeOpusScript,
    sendDeviceJson: (_session: unknown, payload: Record<string, any>) => {
      deviceJson.push(payload);
    },
    setDeviceState: (_session: unknown, state: string, text: string | null) => {
      states.push({ state, text });
    },
    markTurnTiming: (
      _session: unknown,
      timings: { marks: Map<string, number> },
      name: string,
    ) => {
      timings.marks.set(name, Date.now());
      marks.push(name);
    },
    logTurnTimingSummary: vi.fn(),
    closeDeviceAfterTurn,
    sleep: () => Promise.resolve(),
    fallbackCommitDelayMs: options.fallbackCommitDelayMs ?? 0,
    outputFrameDelayMs: 0,
  });
  session.realtimeBridge = bridge;
  return {
    binaryFrames,
    bridge,
    closeDeviceAfterTurn,
    deviceJson,
    marks,
    session,
    states,
  };
}

async function flushPromises(count = 6) {
  for (let index = 0; index < count; index += 1) {
    await Promise.resolve();
  }
}

describe("Realtime device bridge", () => {
  it("builds the OpenAI Realtime websocket URL and session update", () => {
    expect(realtimeWebSocketUrl("gpt-realtime-mini")).toBe(
      "wss://api.openai.com/v1/realtime?model=gpt-realtime-mini",
    );

    expect(realtimeSessionUpdatePayload(runtimeConfig())).toMatchObject({
      type: "session.update",
      session: {
        instructions: expect.stringContaining("Agent name: Realtime Dot."),
        output_modalities: ["audio"],
        audio: {
          input: {
            format: {
              type: "audio/pcm",
              rate: 24000,
            },
            turn_detection: {
              type: "semantic_vad",
              eagerness: "auto",
              create_response: true,
              interrupt_response: true,
            },
          },
          output: {
            format: {
              type: "audio/pcm",
              rate: 24000,
            },
            voice: "cedar",
          },
        },
        reasoning: { effort: "low" },
      },
    });
    expect(realtimeSessionUpdatePayload(runtimeConfig()).session.model).toBeUndefined();
  });

  it("requires OpenAI for speech-to-speech device sessions and Deepgram for sandwich", () => {
    expect(
      deviceRuntimeCredentialStatus(runtimeConfig(), {
        openaiApiKey: "sk-test",
        deepgramApiKey: "",
        llmConfigured: false,
      }).ok,
    ).toBe(true);
    expect(
      deviceRuntimeCredentialStatus(runtimeConfig(), {
        openaiApiKey: "",
        deepgramApiKey: "dg-test",
        llmConfigured: true,
      }).message,
    ).toContain("OPENAI_API_KEY");
    expect(
      deviceRuntimeCredentialStatus(
        { architecture: "sandwich" },
        {
          openaiApiKey: "sk-test",
          deepgramApiKey: "",
          llmConfigured: true,
        },
      ).message,
    ).toContain("DEEPGRAM_API_KEY");
  });

  it("resamples device PCM16 audio from 16 kHz to the realtime input rate", () => {
    const pcm16 = Buffer.alloc(320);
    const pcm24 = resamplePcm16Mono(pcm16, 16000, 24000);

    expect(pcm24).toHaveLength(480);
  });

  it("buffers realtime PCM output into exact Opus frames and flushes the tail", () => {
    const framer = createPcmToOpusFrameEncoder(24000, 60, FakeOpusScript);

    expect(framer.push(Buffer.alloc(960))).toHaveLength(0);
    expect(framer.push(Buffer.alloc(1920))).toHaveLength(1);
    expect(framer.flush()).toHaveLength(0);

    expect(framer.push(Buffer.alloc(960))).toHaveLength(0);
    expect(framer.flush()).toHaveLength(1);
    framer.close();

    expect(FakeOpusScript.deleted).toBe(1);
  });

  it("opens Realtime with runtime auth and sends the saved session config", () => {
    const { bridge } = createHarness();

    bridge.startListening();
    const socket = FakeRealtimeWebSocket.instances[0];
    socket.open();

    expect(socket.url).toBe("wss://api.openai.com/v1/realtime?model=gpt-realtime-2");
    expect(socket.options.headers.Authorization).toBe("Bearer sk-test");
    expect(socket.options.headers["OpenAI-Safety-Identifier"]).toBe("safety-id");
    expect(socket.sent[0]).toMatchObject({
      type: "session.update",
      session: {
        audio: { output: { voice: "cedar" } },
      },
    });
  });

  it("queues decoded device audio until Realtime is open and then appends base64 PCM", () => {
    const { bridge, session } = createHarness();
    const devicePcm16 = Buffer.alloc(320);

    bridge.startListening();
    bridge.handleAudio(devicePcm16);
    const socket = FakeRealtimeWebSocket.instances[0];
    expect(socket.sent).toHaveLength(0);

    socket.open();
    const append = socket.sent.find(
      (event) => event.type === "input_audio_buffer.append",
    );

    expect(append).toBeTruthy();
    expect(Buffer.from(append?.audio, "base64")).toHaveLength(480);
    expect(FakeOpusScript.decodedFrameSizes).toEqual([960]);
    expect(session.turnAudioFrames).toBe(1);
    expect(session.turnAudioBytes).toBe(480);
  });

  it("preconnects Realtime without forwarding wake-word audio before listen start", () => {
    const { bridge } = createHarness();
    const devicePcm16 = Buffer.alloc(320);

    bridge.preconnect();
    bridge.handleAudio(devicePcm16);
    const socket = FakeRealtimeWebSocket.instances[0];
    socket.open();

    expect(socket.sent.map((event) => event.type)).not.toContain(
      "input_audio_buffer.append",
    );

    bridge.startListening();
    bridge.handleAudio(devicePcm16);

    expect(socket.sent.map((event) => event.type)).toContain(
      "input_audio_buffer.append",
    );
  });

  it("drops empty device Opus frames before decode", () => {
    const { bridge } = createHarness();

    bridge.startListening();
    bridge.handleAudio(Buffer.alloc(0));
    const socket = FakeRealtimeWebSocket.instances[0];
    socket.open();

    expect(FakeOpusScript.decodedFrameSizes).toEqual([]);
    expect(socket.sent.map((event) => event.type)).not.toContain(
      "input_audio_buffer.append",
    );
  });

  it("uses device listen stop as commit and response fallback", async () => {
    vi.useFakeTimers();
    const { bridge } = createHarness({ fallbackCommitDelayMs: 25 });

    bridge.startListening();
    const socket = FakeRealtimeWebSocket.instances[0];
    socket.open();
    bridge.stopListening();
    vi.advanceTimersByTime(25);
    vi.useRealTimers();

    await flushPromises(12);

    expect(socket.sent.map((event) => event.type)).toContain("input_audio_buffer.commit");
    expect(socket.sent.map((event) => event.type)).toContain("response.create");
  });

  it("streams Realtime output audio back as device tts JSON and Opus frames", async () => {
    const { binaryFrames, bridge, closeDeviceAfterTurn, deviceJson } = createHarness();
    const outputPcm = Buffer.alloc(2880);

    bridge.startListening();
    const socket = FakeRealtimeWebSocket.instances[0];
    socket.open();
    socket.serverEvent({ type: "response.created" });
    socket.serverEvent({
      type: "response.output_audio.delta",
      delta: outputPcm.toString("base64"),
    });
    socket.serverEvent({ type: "response.done" });
    await flushPromises(12);

    expect(
      deviceJson.some((item) => item.type === "tts" && item.state === "start"),
    ).toBe(true);
    expect(
      deviceJson.some((item) => item.type === "tts" && item.state === "stop"),
    ).toBe(true);
    expect(binaryFrames).toHaveLength(1);
    expect(FakeOpusScript.deleted).toBeGreaterThan(0);
    expect(closeDeviceAfterTurn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session-1" }),
      "turn_complete",
    );
  });

  it("waits to flush partial Realtime output audio until response done", async () => {
    const { binaryFrames, bridge } = createHarness();
    const partialOutputPcm = Buffer.alloc(960);

    bridge.startListening();
    const socket = FakeRealtimeWebSocket.instances[0];
    socket.open();
    socket.serverEvent({ type: "response.created" });
    socket.serverEvent({
      type: "response.output_audio.delta",
      delta: partialOutputPcm.toString("base64"),
    });
    await flushPromises();

    expect(binaryFrames).toHaveLength(0);

    socket.serverEvent({ type: "response.done" });
    await flushPromises();

    expect(binaryFrames).toHaveLength(1);
  });

  it("cancels active Realtime responses on device abort", async () => {
    const { bridge, closeDeviceAfterTurn, deviceJson } = createHarness();
    const outputPcm = Buffer.alloc(2880);

    bridge.startListening();
    const socket = FakeRealtimeWebSocket.instances[0];
    socket.open();
    socket.serverEvent({ type: "response.created" });
    socket.serverEvent({
      type: "response.output_audio.delta",
      delta: outputPcm.toString("base64"),
    });
    await flushPromises(2);
    bridge.abort("button");
    await flushPromises();

    expect(socket.sent.map((event) => event.type)).toContain("response.cancel");
    expect(
      deviceJson.some((item) => item.type === "tts" && item.state === "stop"),
    ).toBe(true);
    expect(closeDeviceAfterTurn).toHaveBeenCalledWith(
      expect.objectContaining({ id: "session-1" }),
      "abort",
    );
  });
});
