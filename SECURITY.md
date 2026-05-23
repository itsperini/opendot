# Security Policy

OpenDot is an early-stage open source project that touches realtime audio, local network services, provider credentials, and device firmware. Security reports are taken seriously, especially issues that affect credential handling, local runtime access, device activation, firmware update behavior, or remote code execution.

## Supported Versions

OpenDot uses GitHub Releases tagged as `vX.Y.Z`. Security fixes target `main`
and ship in the next release. Long-lived maintenance branches are not supported
yet while the project is still in early alpha.

| Version                | Supported                           |
| ---------------------- | ----------------------------------- |
| latest GitHub Release  | Yes                                 |
| `main`                 | Yes                                 |
| `develop`              | Best effort before the next release |
| older commits or forks | No                                  |

## Reporting a Vulnerability

Please do not report vulnerabilities through public GitHub issues.

Use one of these private channels:

1. Open a private GitHub Security Advisory for the repository, if available.
2. Email `security@opendot.ai` with the subject `OpenDot security report`.

Include as much detail as possible:

- affected component: platform UI, voice runtime, docs, firmware, device activation, or build tooling
- impact and attack scenario
- reproduction steps or proof of concept
- logs, screenshots, packet captures, or serial output when useful
- suggested mitigation, if you already have one

## What to Expect

The maintainers will try to acknowledge valid reports within 72 hours. After triage, we will coordinate a fix and disclosure timeline based on severity and exploitability.

Please allow reasonable time for a fix before publishing details. We are happy to credit reporters in release notes or advisories unless you prefer to remain anonymous.

## Scope

Security-sensitive areas include:

- provider API key storage and runtime access
- microphone audio streaming and WebSocket session handling
- local runtime HTTP and WebSocket endpoints
- device provisioning, activation, and OTA/config endpoints
- firmware update and flashing flows
- dependency or build-chain issues that affect users running OpenDot

Out of scope:

- issues that require physical access to an unlocked developer machine without escalation
- denial-of-service reports without a practical security impact
- social engineering
- vulnerabilities in third-party services unless OpenDot configuration makes them exploitable in this project

## Handling Secrets

Never commit real provider keys, access tokens, Wi-Fi credentials, private certificates, or production configuration. Use the local root `.env` file and keep `.env.example` limited to safe examples.

If a secret is accidentally committed, rotate it immediately. Removing it from Git history is not enough.
