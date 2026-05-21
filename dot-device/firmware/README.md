# OpenDot ESP32-S3 Audio Board Firmware

This folder contains the OpenDot firmware for the Waveshare ESP32-S3-AUDIO-Board.
It is an ESP-IDF firmware project for an ESP32-S3 voice device with display, dual
microphone audio input, speaker output, Wi-Fi provisioning, wake word support, and
WebSocket-based connection to the local OpenDot runtime.

The notes in this folder were condensed into this README so the firmware can be
built, flashed, configured, and debugged without relying on the older upstream
branding.

## Target Hardware

The supported board for this local firmware is:

```text
Waveshare ESP32-S3-AUDIO-Board
```

Important hardware characteristics:

- ESP32-S3 target
- 16 MB flash
- 8 MB PSRAM
- ES8311 / ES7210 audio path
- LCD display with LVGL
- USB serial / JTAG flashing
- Optional camera support, but camera detection errors are harmless when no camera is attached

The active board definition is:

```text
main/boards/waveshare/esp32-s3-audio-board
```

The firmware project name is:

```text
opendot
```

## Current Local Runtime Setup

The ESP32 does not use the browser URL directly. The browser UI runs from the
Vite URL printed by `npm run dev`, usually:

```text
http://localhost:5173/agent-studio
```

The device must use the OpenDot runtime endpoint reachable from the local network.
The current firmware default is:

```text
http://192.168.1.77:8787/ota/
```

That endpoint is served by the OpenDot `platform` runtime and returns the
device WebSocket URL:

```text
ws://192.168.1.77:8787/ws
```

If the Mac LAN IP changes, update the OTA URL in:

```text
sdkconfig
main/Kconfig.projbuild
```

For local testing, keep both platform processes running:

```sh
# Terminal 1: frontend
cd /Users/marcoperini/Documents/opendot-project/opendot/platform
npm run dev

# Terminal 2: runtime
cd /Users/marcoperini/Documents/opendot-project/opendot/platform
npm run runtime
```

## Wi-Fi Provisioning

When NVS has no saved Wi-Fi credentials, the device starts a configuration
hotspot:

```text
opendot-<device suffix>
```

For the current board, serial logs showed:

```text
opendot-C48D
```

To provision Wi-Fi:

1. Connect a phone or computer to the OpenDot hotspot.
2. Open:

   ```text
   http://192.168.4.1
   ```

3. Select the local 2.4 GHz Wi-Fi network.
4. Enter the Wi-Fi password.
5. Wait for the device to exit config mode and activate.

Successful provisioning should look like this in serial logs:

```text
WifiBoard: Connected to WiFi: <ssid>
Application: Network connected
HttpClient: Established new connection to 192.168.1.77:8787
Application: Activation done
StateMachine: State: activating -> idle
```

## Build Environment

This project uses ESP-IDF, not Arduino.

The local paths used for this workspace are:

```text
Repo:     /Users/marcoperini/Documents/opendot-project/opendot
Firmware: /Users/marcoperini/Documents/opendot-project/opendot/dot-device/firmware
ESP-IDF:  /Users/marcoperini/Documents/Projects/opendot/.deps/esp-idf
Tools:    /Users/marcoperini/Documents/Projects/opendot/.deps/espressif-tools
Target:   esp32s3
```

Export these once per shell so the local ESP-IDF environment is active:

```sh
export OPENDOT_ROOT=/Users/marcoperini/Documents/opendot-project/opendot
export OPENDOT_IDF_PATH=/Users/marcoperini/Documents/Projects/opendot/.deps/esp-idf
export IDF_TOOLS_PATH=/Users/marcoperini/Documents/Projects/opendot/.deps/espressif-tools

bash -lc 'source "$OPENDOT_IDF_PATH/export.sh" >/dev/null && <command>'
```

Build from this folder:

```sh
cd "$OPENDOT_ROOT/dot-device/firmware"

bash -lc 'source "$OPENDOT_IDF_PATH/export.sh" >/dev/null && idf.py build'
```

Expected main artifact:

```text
build/opendot.bin
```

## Flashing

The device currently appears on this Mac as:

```text
/dev/cu.usbmodem2101
```

Flash the segmented ESP-IDF build:

```sh
bash -lc 'source "$OPENDOT_IDF_PATH/export.sh" >/dev/null && idf.py -p /dev/cu.usbmodem2101 flash'
```

If flashing a merged binary instead of the segmented ESP-IDF output, write it at
address `0x0`. Do not flash a merged binary at `0x1000`; that produces an
invalid boot image because the merged binary already includes the bootloader,
partition table, and app image.

Segmented flash layout:

```text
0x0       bootloader/bootloader.bin
0x8000    partition_table/partition-table.bin
0xd000    ota_data_initial.bin
0x20000   opendot.bin
0x800000  generated_assets.bin
```

Partition highlights:

```text
nvs       0x9000    16K
otadata   0xd000    8K
phy_init  0xf000    4K
ota_0     0x20000   4032K
ota_1     0x410000  4032K
assets    0x800000  8M
```

## Resetting Saved Wi-Fi And Runtime State

Erase NVS when you need to remove saved Wi-Fi credentials or stale runtime
configuration:

```sh
bash -lc 'source "$OPENDOT_IDF_PATH/export.sh" >/dev/null && python -m esptool --chip esp32s3 -p /dev/cu.usbmodem2101 erase_region 0x9000 0x4000'
```

After erasing NVS, the next boot should return to Wi-Fi provisioning mode.

## Serial Monitoring

Attach the monitor with:

```sh
bash -lc 'source "$OPENDOT_IDF_PATH/export.sh" >/dev/null && idf.py -p /dev/cu.usbmodem2101 monitor'
```

Useful boot evidence:

```text
Project name:     opendot
ESP-IDF:          v5.5.2
Found 8MB PSRAM device
SKU=esp32-s3-audio-board
AudioCodec: Audio codec started
WifiConfigurationAp: Access Point started with SSID opendot-...
```

## Wake Word

The local English wake phrase is:

```text
Hey DOT
```

It uses the custom wake-word path based on English MultiNet command recognition,
not a dedicated trained WakeNet model. The relevant configuration values are:

```text
CONFIG_USE_CUSTOM_WAKE_WORD=y
CONFIG_CUSTOM_WAKE_WORD="HEY DOT"
CONFIG_CUSTOM_WAKE_WORD_DISPLAY="Hey, DOT"
CONFIG_SR_MN_EN_MULTINET6_QUANT=y
```

If recognition is unreliable, tune:

```text
CONFIG_CUSTOM_WAKE_WORD_THRESHOLD
```

Lower values are more sensitive. Higher values are less sensitive.

## Known Non-blocking Warnings

These serial messages are expected on the current board when no camera is
attached:

```text
failed to detect DVP camera
Camera get sensor ID failed
open /dev/video2 failed, errno=2(No such file or directory)
```

This warning can appear during audio setup and is usually harmless if audio input
and output initialize afterward:

```text
i2s_channel_disable: the channel has not been enabled yet
```

Missing emoji messages are cosmetic display asset warnings:

```text
Emoji not found: ...
```

## Troubleshooting

If the device accepts Wi-Fi credentials but blinks red or stays in an error
state, check the OTA/bootstrap endpoint first. The expected successful log line
is:

```text
HttpClient: Established new connection to 192.168.1.77:8787
```

If it tries a different port, update the firmware OTA URL and reflash. If the
connection fails, confirm the runtime is listening:

```sh
curl http://192.168.1.77:8787/ota/
```

If audio is choppy, check Wi-Fi quality before changing firmware. ESP32-S3 uses
2.4 GHz Wi-Fi; prefer a strong direct router signal around `-50` to `-60 dBm`,
avoid weak extenders or poor mesh hops, and compare against a phone hotspot if
needed.

## Current Verified Status

The current flashed build has been verified to:

- Boot as `opendot`
- Start OpenDot Wi-Fi provisioning
- Save Wi-Fi credentials
- Connect to `CasaCamilla_3`
- Receive LAN IP `192.168.1.79`
- Reach `http://192.168.1.77:8787/ota/`
- Enter idle state after activation
- Appear in the platform runtime as available and ready

## Upstream Attribution

This firmware is an OpenDot fork of the
[78/xiaozhi-esp32](https://github.com/78/xiaozhi-esp32) ESP32 firmware project.
Portions derived from the upstream project remain covered by the original MIT
license, included here as [LICENSE.xiaozhi](LICENSE.xiaozhi).
