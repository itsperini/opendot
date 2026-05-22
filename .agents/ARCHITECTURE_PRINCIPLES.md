# Architecture Principles

OpenDot should make it practical to build, tune, deploy, and operate full voice
agent pipelines on real devices. The architecture should keep the path open from
hosted starter providers to local-network, bare-metal, and on-device operation.

## Principles

- Treat the voice pipeline as the core product model. VAD, STT, LLM, and TTS
  should remain explicit, inspectable stages.
- Keep provider choices replaceable. Hosted APIs, self-hosted services, and
  local models should plug into the same pipeline contract where possible.
- Make agent configuration portable. Prompts, knowledge, model settings, runtime
  presets, and hardware bindings should be represented as durable configuration
  rather than hidden UI state.
- Design for real devices from the beginning. Latency, interruption behavior,
  network loss, credentials, firmware capabilities, and update paths matter as
  much as dashboard ergonomics.
- Prefer local-first workflows when they reduce friction or improve privacy.
  Cloud operation should be available without becoming the only viable path.
- Keep runtime boundaries understandable. The platform UI, local runtime, and
  firmware should communicate through clear contracts instead of implicit
  coupling.
- Make debugging observable at the level users operate: agent, pipeline stage,
  device, session, provider, and environment.
- Preserve a clean migration path from prototype state to team/workspace state.
  Local drafts are useful today; the data model should still support durable
  shared configuration later.
- Avoid locking project identity to a single provider, model family, cloud, or
  board.
- Keep security and licensing visible. Device credentials, API keys, local
  network exposure, and firmware license notices are architectural concerns.

## Practical Defaults For Agents

- Before adding a feature, identify which part of the loop it serves: build,
  tune, bind, run, or observe.
- Before hiding a configuration detail, ask whether users will need it when
  debugging a real voice session.
- Before coupling to a provider, define the provider-neutral shape first.
- Before changing firmware-facing behavior, check whether the platform and docs
  describe the same device contract.
- Before adding docs, prefer concrete setup and operation guidance over broad
  claims.
- Before introducing generated assets or build outputs, confirm they belong in
  source control.
