# OpenDot Platform Stack Direction

This document captures the current stack direction for the OpenDot platform:
the authenticated console, control API, local voice runtime, and device-facing
paths for real voice agents.

## Decision Summary

- Keep Fastify for the Node control API. OpenDot is container and on-prem
  oriented today, not edge-first.
- Use TanStack Query for frontend server state. Agents, devices, settings,
  sessions, deployments, and API keys are all server-owned data.
- Keep one `platform` app for now, but enforce internal boundaries that map to
  future services.
- Keep WebSocket audio for current browser and device sessions.
- Delay WebRTC, MQTT, UDP, NATS, Redis, and service extraction until the product
  has a concrete need for those capabilities.
- Keep the runtime in TypeScript while the codebase and team are TypeScript-led.

## Current Recommended Stack

Frontend:

- React + TypeScript + Vite.
- TanStack Query for server state.
- TanStack Router when URL state, nested routes, and typed route params become
  worth the migration.
- React Flow when the pipeline editor grows beyond the current four-stage
  configuration UI.
- Radix/shadcn-style primitives later, when the component surface is large
  enough to justify the design-system work.

Backend/control API:

- Fastify + TypeScript.
- PostgreSQL + Drizzle.
- Zod for request, event, and device payload validation.
- OpenAPI for public/control API contracts.

Runtime:

- TypeScript runtime for now.
- WebSocket audio for current browser and Dot device sessions.
- Runtime concepts should stay explicit: `Session`, `Transport`,
  `PipelineRunner`, `DeviceConnection`, and `RuntimeEvent`.
- WebRTC, MQTT, and UDP should be adapters later, not rewrites of the product
  model.

Device layer:

- WebSocket stays the short-term session path for the physical device.
- MQTT should be introduced when devices need production-grade presence,
  desired/reported state, commands, telemetry, diagnostics, and OTA metadata.
- Mosquitto is the right local-first broker. EMQX is a strong later choice when
  clustering, broker observability, MQTT over WebSocket, and enterprise IoT
  features matter.

Eventing:

- Do not add an event backbone by default.
- Add NATS JetStream when session, device, deployment, or runtime events need
  durable replay, fanout, service decoupling, or independent consumers.
- Add Redis only for concrete ephemeral needs: locks, leases, rate limits,
  short-lived connection state, or multi-instance coordination.

## Hono Decision

Do not migrate to Hono now.

Hono is strongest when runtime portability is a primary goal: Workers, Deno,
Bun, Node, Lambda, and edge-style Web Standards APIs. That is useful, but it is
not OpenDot's main bottleneck today. OpenDot needs reliable Node/container
services, on-prem deployability, WebSocket/device handling, Postgres-backed
control workflows, and provider integrations. Fastify already fits that shape
well.

Reconsider Hono only if OpenDot intentionally moves part of the control surface
to edge runtimes or needs one framework across Workers and Node services.

## TanStack Query Decision

TanStack Query is worth adopting now because the platform console is dominated
by server state:

- Agents and pipeline configuration.
- Devices and binding state.
- User/workspace settings.
- API keys.
- Deployments.
- Sessions, timelines, and runtime/debug status.

The frontend should not hand-roll fetch lifecycles, loading flags, cache
invalidation, optimistic updates, and refetch behavior for each surface. The
first step is to make `platform-state` a TanStack Query cache and migrate
individual mutations around that cache. Future routes can split this into
dedicated query keys such as `agents`, `devices`, `settings`, `api-keys`, and
`sessions`.

## Modular Monolith Boundaries

Keep one `platform` app for now. Organize the code as if these services will
exist later:

- `control-api`: agents, devices, auth, settings, deployments, API keys.
- `runtime`: live voice sessions and pipeline orchestration.
- `realtime-gateway`: browser event streams and session timelines.
- `device-gateway`: MQTT/device protocol bridge.
- `worker`: async jobs, cleanup, deployment packaging, and artifact handling.

The first extraction should be `runtime`, not the API. Voice sessions have
different scaling, failure, latency, and provider-dependency behavior than CRUD
workflows.

The second extraction should be `device-gateway` once devices need reliable
presence, desired/reported state, and command delivery.

Only add NATS, Redis, or object storage when the product needs replay, fanout,
queues, locks, artifacts, or multi-instance coordination.

## Runtime Transport Direction

The runtime should treat WebSocket as the first transport adapter, not the whole
architecture.

Current transport:

- Browser WebSocket sessions for local live testing.
- Dot device WebSocket sessions for audio ingress, JSON control messages, and
  synthesized audio egress.

Future transport adapters:

- WebRTC for realtime browser/device media once raw WebSocket audio becomes
  limiting.
- MQTT for device presence, state, commands, telemetry, diagnostics, and OTA
  metadata.
- UDP only for tightly scoped local-network media or discovery cases where the
  reliability tradeoff is intentional.

WebRTC is still the right long-term media direction because it is built for
realtime audio/video/data and handles media concerns that raw WebSockets force
the platform to own. LiveKit remains a strong future candidate because it
provides an open-source WebRTC SFU and agent/media infrastructure, but OpenDot
should not adopt it before the current WebSocket path becomes limiting.

## Product Plan Fit

Short-term priorities:

- Keep the TypeScript codebase understandable.
- Build the agent studio and device binding surfaces.
- Keep local, Docker Compose, Render, and container deployments simple.
- Make the runtime vocabulary explicit before adding more protocols.

Medium-term priorities:

- Split query keys by resource as the console grows.
- Add OpenAPI contracts for the control API.
- Add Zod schemas for API payloads, runtime events, and device messages.
- Add React Flow when users need a visual pipeline builder.
- Introduce MQTT when device state and commands outgrow a live session socket.

Long-term priorities:

- Extract runtime when voice-session scaling requires it.
- Add WebRTC when media quality, NAT traversal, jitter handling, or multi-party
  media becomes a bottleneck.
- Add NATS JetStream when events need durable replay and independent consumers.
- Add object storage when audio/session artifacts need durable references.

## Current Commands

```bash
pnpm install
pnpm run dev
pnpm run api
pnpm run runtime
pnpm run lint
pnpm run test
pnpm run build
pnpm --filter ./platform run db:studio
```

The key principle is modular monolith first. Keep the deployable system boring
while the product learns what its real runtime, device, and eventing constraints
are.
