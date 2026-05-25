import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import {
  AlertCircle,
  AudioLines,
  Ban,
  Cable,
  Mic,
  RotateCcw,
  Square,
  Unplug,
} from "lucide-react";
import { createRealtimeBrowserSession } from "../lib/platformApi";
import type { VoiceAgent } from "../types";

type RealtimeTestAgentPanelProps = {
  agent: VoiceAgent | null;
};

type RealtimeStatus =
  | "disconnected"
  | "connecting"
  | "ready"
  | "listening"
  | "thinking"
  | "speaking"
  | "error";

type RealtimeLogEvent = {
  id: string;
  type: string;
  text: string;
};

function appendRealtimeLog(
  setLog: Dispatch<SetStateAction<RealtimeLogEvent[]>>,
  type: string,
  text: string,
) {
  setLog((current) =>
    [
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type,
        text: `[${new Date().toLocaleTimeString()}] ${text}`,
      },
      ...current,
    ].slice(0, 80),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && !Array.isArray(value) && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function clientSecretFromPayload(payload: unknown) {
  const body = asRecord(payload);
  const directValue = stringValue(body.value);
  const clientSecret = asRecord(body.client_secret);
  const camelClientSecret = asRecord(body.clientSecret);

  return (
    directValue ||
    stringValue(clientSecret.value) ||
    stringValue(camelClientSecret.value) ||
    stringValue(body.client_secret) ||
    stringValue(body.clientSecret)
  );
}

function errorMessageFromPayload(payload: unknown, fallback: string) {
  const body = asRecord(payload);
  const error = asRecord(body.error);
  return stringValue(error.message) || stringValue(body.error) || fallback;
}

function eventText(event: Record<string, unknown>) {
  return (
    stringValue(event.delta) ||
    stringValue(event.transcript) ||
    stringValue(event.text) ||
    stringValue(asRecord(event.item).transcript) ||
    ""
  );
}

function contentText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .map((entry) => {
        const item = asRecord(entry);
        return (
          stringValue(item.text) ||
          stringValue(item.transcript) ||
          stringValue(item.audio_transcript)
        );
      })
      .filter(Boolean)
      .join(" ");
  }

  const item = asRecord(value);
  return (
    stringValue(item.text) ||
    stringValue(item.transcript) ||
    stringValue(item.audio_transcript)
  );
}

function itemTranscript(event: Record<string, unknown>) {
  const item = asRecord(event.item);
  return contentText(item.content) || eventText(event);
}

function responseTranscript(event: Record<string, unknown>) {
  const response = asRecord(event.response);
  const output = response.output;
  if (!Array.isArray(output)) {
    return "";
  }

  return output
    .map((item) => contentText(asRecord(item).content))
    .filter(Boolean)
    .join(" ");
}

function sendClientEvent(
  channel: RTCDataChannel | null,
  payload: Record<string, unknown>,
) {
  if (!channel || channel.readyState !== "open") {
    return false;
  }

  channel.send(JSON.stringify(payload));
  return true;
}

function nextEventId(type: string) {
  return `${type}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function waitForIceGatheringComplete(peerConnection: RTCPeerConnection) {
  if (peerConnection.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      peerConnection.removeEventListener("icegatheringstatechange", handleChange);
      resolve();
    }, 1500);

    function handleChange() {
      if (peerConnection.iceGatheringState === "complete") {
        window.clearTimeout(timeout);
        peerConnection.removeEventListener("icegatheringstatechange", handleChange);
        resolve();
      }
    }

    peerConnection.addEventListener("icegatheringstatechange", handleChange);
  });
}

export function RealtimeTestAgentPanel({ agent }: RealtimeTestAgentPanelProps) {
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<RealtimeStatus>("disconnected");
  const [micActive, setMicActive] = useState(false);
  const [channelReady, setChannelReady] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [assistantTranscript, setAssistantTranscript] = useState("");
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | null>(null);
  const [log, setLog] = useState<RealtimeLogEvent[]>([]);

  function stopLocalMedia() {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setMicActive(false);
    setMediaReady(false);
  }

  function closeConnection(nextStatus: RealtimeStatus = "disconnected") {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    setChannelReady(false);
    stopLocalMedia();

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    setStatus(nextStatus);
  }

  function clearSessionState() {
    setInterimTranscript("");
    setFinalTranscript("");
    setAssistantTranscript("");
    setSessionExpiresAt(null);
    setLog([]);
  }

  useEffect(() => {
    const remoteAudioElement = remoteAudioRef.current;

    return () => {
      dataChannelRef.current?.close();
      peerConnectionRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (remoteAudioElement) {
        remoteAudioElement.srcObject = null;
      }
    };
  }, []);

  function handleRealtimeEvent(payload: unknown) {
    const event = asRecord(payload);
    const type = stringValue(event.type) || "event";
    const message = errorMessageFromPayload(event, eventText(event) || "Received");

    appendRealtimeLog(setLog, type, message);

    if (type === "session.created" || type === "session.updated") {
      setStatus("ready");
      return;
    }

    if (type === "input_audio_buffer.speech_started") {
      setStatus("listening");
      setInterimTranscript("Listening...");
      return;
    }

    if (
      type === "input_audio_buffer.speech_stopped" ||
      type === "input_audio_buffer.committed"
    ) {
      setStatus("thinking");
      return;
    }

    if (type === "conversation.item.input_audio_transcription.delta") {
      const delta = eventText(event);
      setInterimTranscript((current) => `${current}${delta}`);
      return;
    }

    if (
      type === "conversation.item.input_audio_transcription.completed" ||
      type === "conversation.item.created"
    ) {
      const transcript = itemTranscript(event);
      if (transcript) {
        setFinalTranscript(transcript);
        setInterimTranscript("");
      }
      return;
    }

    if (type === "response.created") {
      setStatus("thinking");
      setAssistantTranscript("");
      return;
    }

    if (
      type === "response.output_audio_transcript.delta" ||
      type === "response.audio_transcript.delta" ||
      type === "response.output_text.delta" ||
      type === "response.text.delta"
    ) {
      const delta = eventText(event);
      setStatus("speaking");
      setAssistantTranscript((current) => `${current}${delta}`);
      return;
    }

    if (
      type === "response.output_audio_transcript.done" ||
      type === "response.audio_transcript.done"
    ) {
      const transcript = eventText(event);
      if (transcript) {
        setAssistantTranscript(transcript);
      }
      return;
    }

    if (type === "response.output_audio.delta") {
      setStatus("speaking");
      return;
    }

    if (type === "response.done") {
      const transcript = responseTranscript(event);
      if (transcript) {
        setAssistantTranscript(transcript);
      }
      setStatus("ready");
      return;
    }

    if (type === "error") {
      setStatus("error");
    }
  }

  async function createClientSecret(agentId: string) {
    const session = await createRealtimeBrowserSession(agentId);
    setSessionExpiresAt(session.expiresAt);
    appendRealtimeLog(setLog, "platform.session", "Runtime token minted");

    const response = await fetch(session.clientSecretUrl, {
      body: JSON.stringify({ token: session.token }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      throw new Error(
        errorMessageFromPayload(
          body,
          `Runtime client secret request failed with ${response.status}.`,
        ),
      );
    }

    const clientSecret = clientSecretFromPayload(body);
    if (!clientSecret) {
      throw new Error("Runtime did not return an OpenAI Realtime client secret.");
    }

    appendRealtimeLog(setLog, "runtime.secret", "OpenAI client secret received");
    return clientSecret;
  }

  async function connectRealtime() {
    if (!agent) {
      return;
    }

    closeConnection("connecting");
    setInterimTranscript("");
    setFinalTranscript("");
    setAssistantTranscript("");

    try {
      const clientSecret = await createClientSecret(agent.id);
      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      peerConnection.onconnectionstatechange = () => {
        const nextState = peerConnection.connectionState;
        appendRealtimeLog(setLog, "webrtc.connection", nextState);

        if (nextState === "failed" || nextState === "closed") {
          setStatus(nextState === "failed" ? "error" : "disconnected");
        }
      };

      peerConnection.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream && remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = remoteStream;
          void remoteAudioRef.current.play().catch((error) => {
            appendRealtimeLog(setLog, "audio.playback", error.message);
          });
        }
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = mediaStream;
      setMediaReady(true);
      mediaStream.getAudioTracks().forEach((track) => {
        track.enabled = false;
        peerConnection.addTrack(track, mediaStream);
      });

      const dataChannel = peerConnection.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;
      dataChannel.onopen = () => {
        setChannelReady(true);
        setStatus("ready");
        appendRealtimeLog(setLog, "datachannel.open", "oai-events connected");
      };
      dataChannel.onclose = () => {
        setChannelReady(false);
        appendRealtimeLog(setLog, "datachannel.close", "oai-events closed");
      };
      dataChannel.onerror = () => {
        setChannelReady(false);
        setStatus("error");
        appendRealtimeLog(setLog, "datachannel.error", "oai-events error");
      };
      dataChannel.onmessage = (event) => {
        try {
          handleRealtimeEvent(JSON.parse(event.data));
        } catch (error) {
          appendRealtimeLog(
            setLog,
            "datachannel.message",
            error instanceof Error ? error.message : String(error),
          );
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      await waitForIceGatheringComplete(peerConnection);

      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        body: peerConnection.localDescription?.sdp || offer.sdp || "",
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          "Content-Type": "application/sdp",
        },
        method: "POST",
      });
      const answer = await sdpResponse.text();

      if (!sdpResponse.ok) {
        throw new Error(
          answer || `OpenAI Realtime call failed with ${sdpResponse.status}.`,
        );
      }

      await peerConnection.setRemoteDescription({
        sdp: answer,
        type: "answer",
      });
      appendRealtimeLog(setLog, "webrtc.answer", "Remote SDP accepted");
    } catch (error) {
      closeConnection("error");
      appendRealtimeLog(
        setLog,
        "connection.error",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function toggleMic(enabled: boolean) {
    mediaStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = enabled;
    });
    setMicActive(enabled);
    setStatus(enabled ? "listening" : "ready");
    appendRealtimeLog(
      setLog,
      "mic",
      enabled ? "Microphone started" : "Microphone stopped",
    );
  }

  function interruptResponse() {
    const channel = dataChannelRef.current;
    const cancelled = sendClientEvent(channel, {
      event_id: nextEventId("response.cancel"),
      type: "response.cancel",
    });
    sendClientEvent(channel, {
      event_id: nextEventId("output_audio_buffer.clear"),
      type: "output_audio_buffer.clear",
    });
    appendRealtimeLog(
      setLog,
      "client.interrupt",
      cancelled ? "Response cancelled" : "Data channel is not ready",
    );
    setStatus("ready");
  }

  function resetSession() {
    closeConnection("disconnected");
    clearSessionState();
  }

  const connected = status !== "disconnected" && status !== "error";
  const canUseMic = connected && channelReady && mediaReady;

  return (
    <section className="panel test-panel" aria-labelledby="realtime-test-agent-title">
      <div className="panel-heading compact">
        <div>
          <p className="eyebrow">OpenAI Realtime</p>
          <h2 id="realtime-test-agent-title">Session controls</h2>
        </div>
        <span className={`runtime-status ${status}`}>{status}</span>
      </div>

      <div className="test-actions">
        <button
          disabled={!agent || status === "connecting"}
          type="button"
          onClick={connectRealtime}
        >
          <Cable size={16} />
          Connect
        </button>
        <button disabled={!canUseMic} type="button" onClick={() => toggleMic(!micActive)}>
          {micActive ? <Square size={16} /> : <Mic size={16} />}
          {micActive ? "Stop mic" : "Start mic"}
        </button>
        <button disabled={!channelReady} type="button" onClick={interruptResponse}>
          <Ban size={16} />
          Interrupt
        </button>
        <button disabled={!connected} type="button" onClick={resetSession}>
          <RotateCcw size={16} />
          Reset
        </button>
        <button
          disabled={!connected}
          type="button"
          onClick={() => closeConnection("disconnected")}
        >
          <Unplug size={16} />
          Disconnect
        </button>
      </div>

      {!agent ? (
        <div className="test-warning">
          <AlertCircle size={17} />
          Create or select an agent before opening the runtime.
        </div>
      ) : null}

      {agent && agent.architecture !== "speech_to_speech" ? (
        <div className="test-warning">
          <AlertCircle size={17} />
          Switch this agent to Speech-to-speech in Configuration.
        </div>
      ) : null}

      <div className="realtime-session-meta" aria-label="Realtime session settings">
        <span>{agent?.realtime.model ?? "gpt-realtime-2"}</span>
        <span>{agent?.realtime.voice ?? "marin"}</span>
        <span>{agent?.realtime.turnDetection.type ?? "semantic_vad"}</span>
        <span>
          {sessionExpiresAt
            ? `Token ${new Date(sessionExpiresAt).toLocaleTimeString()}`
            : "No token"}
        </span>
      </div>

      <div className="test-grid">
        <div className="test-card transcript-card">
          <span>Live transcript</span>
          <p className="interim-text">
            {interimTranscript || "Interim speech appears here."}
          </p>
          <p className="final-text">
            {finalTranscript || "Final user turn appears here."}
          </p>
        </div>

        <div className="test-card assistant-card">
          <div className="assistant-output-header">
            <span>Assistant</span>
          </div>
          <p className="assistant-response-text">
            {assistantTranscript || "The agent response streams here."}
          </p>
          <audio autoPlay className="remote-audio" controls ref={remoteAudioRef} />
          <div className="audio-placeholder">
            <AudioLines size={17} />
            {status === "speaking" ? "Playing realtime audio" : "Waiting for model audio"}
          </div>
        </div>
      </div>

      <div className="runtime-log">
        <div>
          <AudioLines size={15} />
          Realtime events
        </div>
        <ol>
          {log.length > 0 ? (
            log.map((event) => (
              <li key={event.id}>
                <span className="realtime-event-type">{event.type}</span>
                {event.text}
              </li>
            ))
          ) : (
            <li>Realtime events will appear here.</li>
          )}
        </ol>
      </div>
    </section>
  );
}
