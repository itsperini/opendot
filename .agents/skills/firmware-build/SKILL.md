---
name: firmware-build
description: OpenDot ESP-IDF firmware setup, build, test, flash, and serial-monitor workflow for dot-device/firmware. Use this skill only when the user explicitly asks for firmware setup/build/test/flash/monitor work, or when the current task changes or verifies files under dot-device/firmware/**; do not use it for unrelated platform, docs, or agent-only changes.
---

# Firmware Build

Use this skill for OpenDot firmware work under `dot-device/firmware`.

## Scope Gate

Use the skill only when one of these is true:

- The user explicitly asked for firmware setup, dependencies, build, test,
  flash, serial logs, ESP-IDF, or hardware debugging.
- The task changes or verifies files under `dot-device/firmware/**`.

If the skill was triggered only because of local changes, confirm the scope with:

```sh
git diff --name-only -- dot-device/firmware
```

If no firmware files are involved and the user did not ask for firmware work,
do not apply this workflow.

## Required Context

Before acting, read the smallest relevant set of:

- `dot-device/firmware/README.md`
- `dot-device/firmware/main/idf_component.yml` for the required ESP-IDF version
- `dot-device/firmware/sdkconfig` or `main/Kconfig.projbuild` when changing
  board, partition, OTA, wake word, or language settings

Current target board: Waveshare ESP32-S3-AUDIO-Board, target `esp32s3`.

## Local Artifact Hygiene

Common ignored firmware-local artifacts:

```text
dot-device/firmware/.deps/
dot-device/firmware/build/
dot-device/firmware/managed_components/
dot-device/firmware/dependencies.lock
dot-device/firmware/sdkconfig
dot-device/firmware/sdkconfig.old
dot-device/firmware/releases/
dot-device/firmware/.cache/
dot-device/firmware/main/assets/lang_config.h
```

Do not clean these after every successful build. `build/`, `managed_components/`,
`dependencies.lock`, and `.cache/` are useful local state for faster rebuilds and
stable dependency resolution.

Clean only when the user explicitly asks for artifact cleanup, when preparing a
fresh reproducibility check, or when stale generated state is suspected. In that
case, remove generated build state such as `build/`, `managed_components/`,
`sdkconfig.old`, `releases/`, `.cache/`, and generated headers. Remove
`dependencies.lock` only when intentionally forcing ESP-IDF component
resolution. Do not remove `.deps/` unless the user asks to uninstall ESP-IDF.
Do not remove `sdkconfig` unless the user asks to reset local board/runtime
configuration.

## Fresh Setup

The firmware uses ESP-IDF, not Arduino. The project currently requires
ESP-IDF `>=5.5.2`; prefer `v5.5.2` for reproducible local builds unless
`main/idf_component.yml` says otherwise.

Install the project-local toolchain inside `dot-device/firmware/.deps/`, not
at the repository root:

```sh
git clone https://github.com/itsperini/opendot.git
cd opendot/dot-device/firmware
mkdir -p .deps
git clone --branch v5.5.2 --recursive https://github.com/espressif/esp-idf.git .deps/esp-idf
export IDF_TOOLS_PATH="$PWD/.deps/espressif-tools"
.deps/esp-idf/install.sh esp32s3
```

Activate ESP-IDF in each shell:

```sh
export IDF_TOOLS_PATH="$PWD/.deps/espressif-tools"
. .deps/esp-idf/export.sh
```

On macOS, if ESP-IDF install or component downloads fail with certificate
verification errors, retry with Python `certifi` certificates:

```sh
CERTIFI_CA="$(python3 -c 'import certifi; print(certifi.where())')"
SSL_CERT_FILE="$CERTIFI_CA" REQUESTS_CA_BUNDLE="$CERTIFI_CA" \
  IDF_TOOLS_PATH="$PWD/.deps/espressif-tools" \
  .deps/esp-idf/install.sh esp32s3
```

If required system tools are missing, install them with the host package manager
first. On macOS this is usually:

```sh
brew install cmake ninja dfu-util ccache
```

## Runtime And OTA URL

The ESP32 must reach the OpenDot runtime over the LAN. Before flashing, make
sure the local ignored `sdkconfig` points at the runtime computer, not
`localhost`, and do not commit private LAN values:

```text
CONFIG_OTA_URL="http://<runtime-lan-ip>:8787/ota/"
```

Set it with `idf.py menuconfig` or a targeted local `sdkconfig` edit:

```sh
cd dot-device/firmware
idf.py menuconfig
```

Menu path: `OpenDot Firmware -> Default OTA URL`.

Find the runtime LAN IP and verify the endpoint before flashing:

```sh
# macOS
IFACE="$(route -n get default | awk '/interface:/{print $2}')"
RUNTIME_LAN_IP="$(ipconfig getifaddr "$IFACE")"

curl -sS -i "http://$RUNTIME_LAN_IP:8787/ota/" | sed -n '1,20p'
```

For local runtime testing, the platform processes are:

```sh
# Terminal 1: frontend
pnpm install
pnpm run dev

# Terminal 2: runtime
pnpm run runtime
```

Use separate terminals for the frontend and runtime. If `pnpm run runtime` fails
with `EADDRINUSE` on port `8787`, do not switch ports unless you also update
`CONFIG_OTA_URL`; inspect the existing listener and curl `/ota/`:

```sh
lsof -nP -iTCP:8787 -sTCP:LISTEN
curl -sS -i "http://127.0.0.1:8787/ota/" | sed -n '1,20p'
curl -sS -i "http://<runtime-lan-ip>:8787/ota/" | sed -n '1,20p'
```

The device endpoint is `http://<runtime-lan-ip>:8787/ota/`; when reached via
the LAN IP, it should return a WebSocket URL like
`ws://<runtime-lan-ip>:8787/ws`.

## Build And Test

Minimum firmware verification after changing `dot-device/firmware/**`:

```sh
cd dot-device/firmware
export IDF_TOOLS_PATH="$PWD/.deps/espressif-tools"
. .deps/esp-idf/export.sh
idf.py build
```

Run `idf.py set-target esp32s3` only when `sdkconfig` is missing or has the
wrong `CONFIG_IDF_TARGET`; it can rewrite local configuration and create
`sdkconfig.old`.

There is no separate firmware unit-test suite in the repo right now, so a clean
ESP-IDF build is the default test. If you touch Python asset or release scripts,
also run the most relevant script-level check available for that file.

Expected main artifact:

```text
dot-device/firmware/build/opendot.bin
```

If ESP-IDF is unavailable, report that clearly and include the setup command
that would unblock verification.

## Flash

Flash only when hardware is connected and the user requested flashing.

Find the serial port:

```sh
# macOS
find /dev -maxdepth 1 \( -name 'cu.usbmodem*' -o -name 'cu.SLAB_USBtoUART*' -o -name 'cu.usbserial*' \) -print 2>/dev/null

# Linux
find /dev -maxdepth 1 \( -name 'ttyACM*' -o -name 'ttyUSB*' \) -print 2>/dev/null
```

Flash:

```sh
cd dot-device/firmware
idf.py -p <serial-port> flash
```

To clear saved Wi-Fi or stale runtime state:

```sh
python3 -m esptool --chip esp32s3 -p <serial-port> erase_region 0x9000 0x4000
```

## Serial Check After Flash

After flashing, always check serial logs before declaring success:

```sh
idf.py -p <serial-port> monitor
```

Collect evidence that the firmware booted and reached the runtime:

```text
Project name:     opendot
ESP-IDF:          v5.5.2
AudioCodec: Audio codec started
WifiConfigurationAp: Access Point started with SSID opendot-...
WifiBoard: Connected to WiFi: <ssid>
WifiStation: Got IP: <device-lan-ip>
HttpClient: Established new connection to <runtime-lan-ip>:8787
Application: Activation done
StateMachine: State: activating -> idle
CustomWakeWord: Command: HEY DOT
```

Exit the monitor with `Ctrl+]`. Do not leave monitor sessions running.

Expected non-blocking warnings on the Waveshare board without a camera:

```text
failed to detect DVP camera
Camera get sensor ID failed
open /dev/video2 failed, errno=2(No such file or directory)
```

## Handoff

In the final response, include:

- firmware files changed
- ESP-IDF version used or whether it was unavailable
- build/test command results
- flash command and serial port, if flashing was requested
- serial evidence after flashing, including any remaining runtime or Wi-Fi issue
