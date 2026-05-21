# OpenDot Platform Architecture Recommendation

This document captures a recommended technical direction for the OpenDot platform webapp: the authenticated control plane for configuring voice agents, binding them to devices and rooms, operating live sessions, and managing the device/runtime layer behind the landing page promise.

## Updated First Milestone

The first platform milestone should be a traditional voice agent studio before the broader device-control plane.

Initial scope:

- Create a voice agent with a name and description.
- Configure a clear four-stage voice pipeline: VAD, STT, LLM, and TTS.
- Start with Deepgram for VAD/STT/TTS and OpenAI for the LLM.
- Represent Deepgram VAD as a product-level pipeline stage even though the runtime maps it to Deepgram live streaming options such as `endpointing`, `utterance_end_ms`, `vad_events`, `interim_results`, and `speech_final`.
- Keep device binding, MQTT, OTA, and Dot Device management as the next layer after the browser-based voice agent creation flow is solid.

## Product Shape

OpenDot should be built as three connected planes, not as one large monolithic webapp.

1. Control plane
   - Organizations, users, roles, projects, environments, rooms, devices, agents, pipelines, deployments, and audit logs.
   - Mostly request/response CRUD and transactional workflows.
   - Primary interface for builders and operators.

2. Realtime/session plane
   - Live voice sessions, partial transcripts, LLM tokens, tool calls, latency metrics, runtime logs, and deployment progress.
   - Event-driven and reconnect-friendly.
   - Drives the debugging/operator experience in the webapp.

3. Device plane
   - MQTT/device identity, telemetry, commands, desired/reported state, config updates, presence, firmware metadata, and hardware diagnostics.
   - Optimized for constrained devices and unreliable networks.
   - Devices should never be treated like normal browser clients.

## Recommended High-Level Stack

### Frontend

Recommended:

- React
- TypeScript
- Vite
- TanStack Router
- TanStack Query
- Tailwind CSS
- shadcn/ui + Radix primitives
- React Flow for the voice pipeline editor
- Zustand only for local UI/editor state that is not server state

Why:

- The platform is a logged-in operations console, not a public content site. A Vite SPA keeps the frontend simple, fast, and easy to host.
- TanStack Query is the right default for server state: agents, devices, rooms, sessions, deployments, and logs.
- TanStack Router gives type-safe routing and URL state for filters, selected environments, active tabs, and debugger views.
- React Flow is the right fit for a visual pipeline builder such as `VAD -> STT -> LLM -> Tools -> TTS`.
- shadcn/Radix keeps the product UI consistent without committing to a heavy design system too early.

When to choose Next.js instead:

- If the platform needs server-rendered pages inside the app.
- If docs, marketing, changelog, account pages, and platform routes should live in the same full-stack framework.
- If React Server Components become central to the app architecture.

For OpenDot's authenticated realtime console, I would start with Vite + React and keep the landing page separate.

### Backend Control API

Recommended:

- TypeScript
- Fastify
- PostgreSQL
- Drizzle or Prisma
- Zod for validation
- OpenAPI for HTTP API contracts
- Redis for ephemeral caches, leases, rate limits, and short-lived session coordination

Why:

- Fastify is lightweight, fast, and fits high-I/O API services well.
- TypeScript keeps shared API/event schemas close to the frontend.
- PostgreSQL fits relational product data and JSONB manifests well.
- Zod lets the same schema style validate API payloads, event payloads, device messages, and internal config.
- OpenAPI gives generated clients, docs, contract tests, and a clean integration surface.

Drizzle vs Prisma:

- Choose Drizzle if you want SQL-shaped control, lightweight runtime behavior, and explicit migrations.
- Choose Prisma if you want a faster product development loop, rich generated client types, and a stronger admin/data-inspection workflow early.
- Either is fine for the MVP. I would lean Drizzle if device manifests, event tables, and hand-tuned queries become central quickly. I would lean Prisma if the first milestone is mostly product CRUD and speed of iteration.

### Voice Runtime

Recommended:

- Separate runtime service from the control API.
- Python + FastAPI/asyncio for AI/audio-heavy orchestration, or TypeScript workers if the team strongly prefers one language.
- Runtime workers communicate through NATS JetStream and persist important session state back to PostgreSQL/object storage.

Why split it:

- Voice sessions have different failure modes than CRUD APIs.
- The runtime will talk to STT, LLM, tools, memory, TTS, VAD, WebRTC, local device adapters, and possibly offline models.
- You will want to scale runtime workers independently from the dashboard API.

Runtime responsibilities:

- Create and manage voice sessions.
- Receive audio from browser/device paths.
- Run VAD/STT/LLM/tool/TTS orchestration.
- Emit partial and final transcript events.
- Emit timing, token, cost, error, and quality metrics.
- Store session artifacts.
- Apply agent config and pipeline version snapshots.

### Realtime Gateway

Recommended:

- Dedicated WebSocket gateway service.
- Browser connects to this service for live session and device events.
- Gateway subscribes to NATS subjects and forwards authorized event subsets to the browser.

Why:

- Keeps WebSocket connection management separate from normal HTTP APIs.
- Makes horizontal scaling easier.
- Prevents the browser from directly subscribing to internal NATS or MQTT topics.
- Provides one place for reconnect, replay cursors, event filtering, auth, and backpressure policy.

Use WebSockets for:

- Session timelines.
- Partial transcripts.
- LLM token streams.
- Tool call status.
- Device online/offline state.
- Deployment progress.
- Runtime logs and metrics.

Do not use raw WebSockets as the primary long-term media transport for production voice audio unless you intentionally want to own jitter, buffering, codec, and reconnection behavior.

### Browser Audio and Live Testing

Recommended:

- Use WebRTC for browser-based live audio testing.
- Use WebSocket only for signaling, session events, and debug metadata.

Why:

- WebRTC is designed for low-latency audio/video/data in browsers.
- It handles media transport concerns that raw WebSocket audio would force the platform to solve manually.

Suggested browser flow:

1. User clicks "Test agent".
2. Frontend calls `POST /sessions` to create a test session.
3. Frontend opens WebSocket subscription for session events.
4. Frontend starts WebRTC negotiation through the runtime/signaling endpoint.
5. Runtime emits events through NATS.
6. Realtime gateway forwards authorized events to the browser.

### Device Messaging

Recommended:

- MQTT for device connectivity.
- EMQX for production broker.
- Mosquitto for local development and small pilots.
- MQTT bridge service between broker topics and the internal event bus/control plane.

Why:

- MQTT is purpose-built for lightweight publish/subscribe device messaging.
- It supports constrained devices, unreliable networks, persistent sessions, retained messages, and QoS levels.
- EMQX gives a production path for clustering, high availability, MQTT over WebSocket, auth integration, and broker observability.

Use MQTT for:

- Device telemetry.
- Device presence.
- Desired/reported state.
- Config updates.
- Commands.
- OTA/firmware metadata.
- Heartbeats.
- Diagnostics.

Do not let the platform webapp publish directly to privileged MQTT topics. The browser should call the control API or realtime gateway; backend services enforce org/RBAC/device permissions and then publish the command.

### Internal Event Bus

Recommended:

- NATS JetStream.

Why:

- Good fit for evented services without Kafka-level operational weight.
- Supports streams, consumers, replay, at-least-once delivery, and decoupled flow control.
- Useful for session event logs, deployment events, runtime events, and bridge events.

Use NATS JetStream for:

- `session.created`
- `session.audio.started`
- `session.transcript.partial`
- `session.transcript.final`
- `session.llm.delta`
- `session.tool.started`
- `session.tool.finished`
- `session.tts.started`
- `session.ended`
- `device.connected`
- `device.disconnected`
- `device.telemetry.received`
- `deployment.started`
- `deployment.applied`
- `deployment.failed`

Use Redis for:

- Short-lived connection state.
- Rate limits.
- Temporary locks.
- Presence acceleration.
- WebSocket fanout helper state if needed.

Do not use Redis as the durable event log for sessions.

## Recommended Repository Shape

For the platform, use a monorepo:

```text
opendot-platform/
  apps/
    web/
      React + Vite platform console
    api/
      Fastify control API
    realtime-gateway/
      Browser WebSocket gateway

  services/
    runtime/
      Voice session orchestration
    mqtt-bridge/
      MQTT broker integration and validation
    workers/
      Async jobs, deployment packaging, cleanup

  packages/
    schemas/
      Zod schemas, OpenAPI helpers, AsyncAPI payload schemas
    ui/
      Shared OpenDot platform UI components
    config/
      Shared TypeScript config, eslint, prettier
    sdk/
      Generated or hand-authored API client

  infra/
    docker-compose.yml
    migrations/
    nats/
    emqx/
    observability/

  docs/
    architecture/
    api/
    device-protocol/
```

Use `pnpm` workspaces or Turborepo if the repo becomes large. Keep service boundaries clear even if deployment starts simple.

## Core Data Model

Initial tables/entities:

- `organizations`
- `users`
- `memberships`
- `roles`
- `projects`
- `environments`
- `sites`
- `rooms`
- `devices`
- `device_credentials`
- `device_state`
- `agents`
- `agent_versions`
- `knowledge_sources`
- `tools`
- `pipelines`
- `pipeline_versions`
- `deployments`
- `sessions`
- `session_events`
- `session_artifacts`
- `audit_logs`

Important principle:

- Agents and pipelines should be versioned.
- A session should reference immutable snapshots: `agent_version_id`, `pipeline_version_id`, `device_id`, `environment_id`.
- Do not let a session point only to mutable "current agent config", or debugging historical sessions becomes painful.

## HTTP API Shape

Use REST/OpenAPI for product workflows.

Example routes:

```text
GET    /v1/me
GET    /v1/orgs/:orgId
GET    /v1/orgs/:orgId/environments

GET    /v1/orgs/:orgId/rooms
POST   /v1/orgs/:orgId/rooms
PATCH  /v1/orgs/:orgId/rooms/:roomId

GET    /v1/orgs/:orgId/devices
POST   /v1/orgs/:orgId/devices
GET    /v1/orgs/:orgId/devices/:deviceId
POST   /v1/orgs/:orgId/devices/:deviceId/commands

GET    /v1/orgs/:orgId/agents
POST   /v1/orgs/:orgId/agents
GET    /v1/orgs/:orgId/agents/:agentId
POST   /v1/orgs/:orgId/agents/:agentId/versions

GET    /v1/orgs/:orgId/pipelines
POST   /v1/orgs/:orgId/pipelines
POST   /v1/orgs/:orgId/pipelines/:pipelineId/versions

POST   /v1/orgs/:orgId/deployments
GET    /v1/orgs/:orgId/deployments/:deploymentId

POST   /v1/orgs/:orgId/sessions
GET    /v1/orgs/:orgId/sessions
GET    /v1/orgs/:orgId/sessions/:sessionId
GET    /v1/orgs/:orgId/sessions/:sessionId/events
```

Use OpenAPI for:

- API documentation.
- Generated frontend client.
- Contract testing.
- External integrations.

## Realtime WebSocket Shape

Browser endpoint:

```text
wss://api.opendot.ai/v1/realtime
```

Client subscribes after auth:

```json
{
  "type": "subscribe",
  "requestId": "req_123",
  "scope": "session",
  "sessionId": "ses_123",
  "cursor": "optional-last-event-id"
}
```

Server event:

```json
{
  "type": "session.transcript.partial",
  "eventId": "evt_123",
  "sessionId": "ses_123",
  "createdAt": "2026-05-19T12:00:00.000Z",
  "payload": {
    "channel": "user",
    "text": "Can you tell me where meeting room A is",
    "stability": 0.82
  }
}
```

Recommended event rules:

- Every event has `type`, `eventId`, `createdAt`, and an authorization scope.
- Every session event is append-only.
- Browser can reconnect with a cursor.
- Large logs/artifacts should be referenced by URL or artifact ID, not pushed inline forever.
- Backpressure policy should drop or coalesce noisy telemetry before it harms the browser.

## MQTT Topic Design

Topic pattern:

```text
org/{orgId}/device/{deviceId}/telemetry
org/{orgId}/device/{deviceId}/state/reported
org/{orgId}/device/{deviceId}/state/desired
org/{orgId}/device/{deviceId}/commands/{commandId}
org/{orgId}/device/{deviceId}/commands/{commandId}/ack
org/{orgId}/device/{deviceId}/sessions/{sessionId}/events
org/{orgId}/device/{deviceId}/diagnostics
org/{orgId}/device/{deviceId}/ota
```

Suggested QoS:

- QoS 0: frequent telemetry, audio level meters, non-critical diagnostics.
- QoS 1: commands, command acknowledgements, reported state, session lifecycle.
- QoS 1 retained: desired state/config pointer.
- LWT: device offline/presence signal.

Retained messages:

- Use retained messages for desired state and latest config pointer.
- Avoid retained messages for noisy telemetry or session events.

Payload conventions:

```json
{
  "schemaVersion": "2026-05-19",
  "messageId": "msg_123",
  "deviceId": "dev_123",
  "sentAt": "2026-05-19T12:00:00.000Z",
  "payload": {}
}
```

The MQTT bridge should:

- Validate topic and payload.
- Attach trusted identity from broker auth, not from untrusted payload fields.
- Translate MQTT messages into internal NATS events.
- Publish backend-approved commands to MQTT.
- Enforce org/device authorization boundaries.

## AsyncAPI

Use AsyncAPI to document:

- WebSocket events.
- MQTT topics.
- NATS subjects.
- Payload schemas.
- QoS expectations.
- Retained message behavior.
- Reconnect/cursor semantics.

OpenAPI covers HTTP. AsyncAPI covers messaging and event-driven behavior. OpenDot needs both.

## Authentication And Authorization

Recommended:

- OIDC/OAuth-ready auth model.
- Start with Clerk, Auth0, WorkOS, or a simple self-hosted auth module depending on launch constraints.
- Keep internal authorization in your own database regardless of auth provider.

Core authorization model:

- Organization membership.
- Role-based access control.
- Environment-level permissions.
- Device-level command permissions.
- Audit logging for privileged operations.

Device identity:

- Each device gets a unique credential.
- Use mTLS or broker-issued credentials for production devices.
- Never trust `orgId` or `deviceId` only because it appears in a payload.
- Broker auth and the MQTT bridge should derive the real device identity.

Important permissions:

- View devices.
- Register devices.
- Issue commands.
- Deploy agent config.
- View sessions.
- View transcripts/audio.
- Manage API keys.
- Manage org members.

## Voice Pipeline Model

Pipeline graph should support:

- VAD provider/config.
- STT provider/config.
- LLM provider/model/config.
- Tool routing.
- Memory/knowledge settings.
- TTS provider/voice/config.
- Runtime target: cloud, edge, offline, hybrid.
- Latency budget per stage.

Example pipeline shape:

```json
{
  "nodes": [
    { "id": "vad", "type": "vad", "provider": "silero" },
    { "id": "stt", "type": "stt", "provider": "whisper" },
    { "id": "llm", "type": "llm", "provider": "openai", "model": "gpt-4o" },
    { "id": "tts", "type": "tts", "provider": "piper" }
  ],
  "edges": [
    { "from": "vad", "to": "stt" },
    { "from": "stt", "to": "llm" },
    { "from": "llm", "to": "tts" }
  ]
}
```

The UI should separate:

- Draft pipeline editing.
- Test runs.
- Published versions.
- Deployments to environments/devices.

Do not deploy mutable drafts to devices. Deploy immutable pipeline and agent versions.

## Observability

Use OpenTelemetry from the beginning.

Track:

- API latency.
- Runtime session latency.
- Stage latency: VAD, STT, LLM, tools, TTS.
- Time to first transcript.
- Time to first agent token.
- Time to first audio response.
- MQTT connect/disconnect counts.
- Device command success/failure.
- Deployment success/failure.
- Per-session error taxonomy.

Recommended tools:

- OpenTelemetry SDKs.
- Prometheus/Grafana or a managed equivalent.
- Structured JSON logs.
- Sentry for frontend/backend exceptions.
- PostHog for product analytics if acceptable under privacy goals.

## Deployment Path

MVP/local:

- Docker Compose.
- Postgres.
- Redis.
- NATS.
- Mosquitto or EMQX.
- `apps/web`.
- `apps/api`.
- `apps/realtime-gateway`.
- `services/mqtt-bridge`.
- Simulated Dot device.

Pilot/production:

- Kubernetes or a simpler container platform first, depending on team size.
- Managed Postgres.
- Managed Redis.
- NATS cluster or managed NATS.
- EMQX cluster or managed EMQX.
- Separate runtime worker pool.
- Object storage for artifacts.
- CDN/static hosting for frontend.

Keep deployment boring at the start. The hard part is the protocol/runtime product, not orchestration complexity.

## MVP Build Order

1. Platform foundation
   - Auth, orgs, projects, environments.
   - Postgres schema and migrations.
   - Fastify API with OpenAPI.
   - React app shell with routing, layouts, and auth.

2. Device registry
   - Rooms/sites/devices.
   - Device credentials.
   - Device status model.
   - Simulated device.

3. MQTT path
   - Local MQTT broker.
   - MQTT bridge.
   - Presence, telemetry, desired/reported state.
   - Basic commands and acknowledgements.

4. Pipeline and agent studio
   - Agent CRUD.
   - Pipeline editor with React Flow.
   - Versioning.
   - Test configuration snapshots.

5. Realtime gateway
   - WebSocket auth.
   - Subscribe/unsubscribe.
   - NATS session events.
   - Reconnect with cursor.

6. Voice runtime MVP
   - Browser test session.
   - WebRTC audio ingress.
   - STT -> LLM -> TTS loop.
   - Session event timeline.
   - Runtime metrics.

7. Deployment workflow
   - Bind agent/pipeline version to device/environment.
   - Push desired state through MQTT.
   - Device ack.
   - Audit log.

8. Operator polish
   - Session debugger.
   - Device diagnostics.
   - Latency breakdowns.
   - Error recovery and retry UX.

## Strong Recommendations

- Keep the landing page separate from the authenticated platform app.
- Do not put voice runtime orchestration inside the normal CRUD API.
- Do not expose MQTT directly to the browser for privileged operations.
- Use immutable versions for agents and pipelines.
- Treat sessions as append-only event streams.
- Use WebRTC for browser audio, WebSocket for events.
- Use MQTT for device state and commands.
- Use NATS JetStream as the internal event backbone.
- Use OpenAPI for HTTP contracts and AsyncAPI for realtime/device contracts.
- Build a simulated Dot device early. It will make platform development much faster.

## Initial Technology Decision

If starting today, I would choose:

```text
Frontend:
  React + TypeScript + Vite
  TanStack Router
  TanStack Query
  Tailwind + shadcn/ui + Radix
  React Flow

Control API:
  TypeScript + Fastify
  PostgreSQL
  Drizzle or Prisma
  Zod
  OpenAPI

Realtime:
  Dedicated WebSocket gateway
  NATS JetStream internally

Runtime:
  Python FastAPI/asyncio for audio/AI orchestration
  WebRTC for browser audio testing

Device:
  MQTT broker: Mosquitto locally, EMQX for production
  MQTT bridge service
  AsyncAPI documented topics/events

Infrastructure:
  Postgres
  Redis
  NATS JetStream
  EMQX/Mosquitto
  Object storage
  OpenTelemetry
```

This stack gives OpenDot a clean path from MVP to real deployments: a fast product console, a reliable event backbone, a proper device protocol layer, and a runtime that can evolve independently as the voice pipeline becomes more sophisticated.
