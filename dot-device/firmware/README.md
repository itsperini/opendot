# OpenDot ESP32-S3 Audio Board Firmware

This folder contains the OpenDot firmware for the Waveshare ESP32-S3-AUDIO-Board.
It is an ESP-IDF firmware project for an ESP32-S3 voice device with display, dual
microphone audio input, speaker output, Wi-Fi provisioning, wake word support, and
WebSocket-based connection to the local OpenDot runtime.

The repository is:

```text
https://github.com/itsperini/opendot
```

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

## Runtime Endpoint

The ESP32 does not use the browser URL directly. The browser UI runs from the
Vite URL printed by `npm run dev`, usually:

```text
http://localhost:5173/agent-studio
```

The device must use the OpenDot runtime endpoint reachable from the local network.
Use the LAN IP of the computer running the runtime, not `localhost`:

```text
http://<runtime-lan-ip>:8787/ota/
```

That endpoint is served by the OpenDot `platform` runtime and returns the
device WebSocket URL:

```text
ws://<runtime-lan-ip>:8787/ws
```

The checked-in `CONFIG_OTA_URL` value is intentionally empty so forks do not
inherit a private LAN address. Before flashing a device, set:

```text
CONFIG_OTA_URL="http://<runtime-lan-ip>:8787/ota/"
```

You can set it with `idf.py menuconfig` under:

```text
OpenDot Firmware -> Default OTA URL
```

For local testing, keep both platform processes running from the repository
root:

```sh
# Terminal 1: frontend
cd platform
npm install
npm run dev

# Terminal 2: runtime
cd platform
npm run runtime
```

Common ways to find the runtime LAN IP:

```sh
# macOS, Wi-Fi
ipconfig getifaddr en0

# Linux
hostname -I | awk '{print $1}'
```

## Wi-Fi Provisioning

When NVS has no saved Wi-Fi credentials, the device starts a configuration
hotspot:

```text
opendot-<device suffix>
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
HttpClient: Established new connection to <runtime-lan-ip>:8787
Application: Activation done
StateMachine: State: activating -> idle
```

## Build Environment

This project uses ESP-IDF, not Arduino.

The firmware requires ESP-IDF `>=5.5.2`. Use `v5.5.2` for reproducible local
builds unless the project requirement changes in `main/idf_component.yml`.

From a fresh fork:

```sh
git clone https://github.com/itsperini/opendot.git
cd opendot
```

Install ESP-IDF into repo-local dependency folders:

```sh
mkdir -p .deps
git clone --branch v5.5.2 --recursive https://github.com/espressif/esp-idf.git .deps/esp-idf

export IDF_TOOLS_PATH="$PWD/.deps/espressif-tools"
.deps/esp-idf/install.sh esp32s3
```

Activate ESP-IDF in each shell before building or flashing:

```sh
export IDF_TOOLS_PATH="$PWD/.deps/espressif-tools"
. .deps/esp-idf/export.sh
```

Build from this folder:

```sh
cd dot-device/firmware
idf.py set-target esp32s3
idf.py build
```

Expected main artifact:

```text
build/opendot.bin
```

## Flashing

Find the serial port after connecting the board over USB:

```sh
# macOS
ls /dev/cu.usbmodem* /dev/cu.SLAB_USBtoUART* 2>/dev/null

# Linux
ls /dev/ttyACM* /dev/ttyUSB* 2>/dev/null
```

Flash the segmented ESP-IDF build:

```sh
idf.py -p <serial-port> flash
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
python3 -m esptool --chip esp32s3 -p <serial-port> erase_region 0x9000 0x4000
```

After erasing NVS, the next boot should return to Wi-Fi provisioning mode.

## Serial Monitoring

Attach the monitor with:

```sh
idf.py -p <serial-port> monitor
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

After flashing, keep the monitor open and confirm the device reaches the runtime:

```text
WifiBoard: Connected to WiFi: <ssid>
HttpClient: Established new connection to <runtime-lan-ip>:8787
Application: Activation done
StateMachine: State: activating -> idle
```

Exit the serial monitor with `Ctrl+]`.

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
HttpClient: Established new connection to <runtime-lan-ip>:8787
```

If it tries a different port, update the firmware OTA URL and reflash. If the
connection fails, confirm the runtime is listening:

```sh
curl http://<runtime-lan-ip>:8787/ota/
```

If audio is choppy, check Wi-Fi quality before changing firmware. ESP32-S3 uses
2.4 GHz Wi-Fi; prefer a strong direct router signal around `-50` to `-60 dBm`,
avoid weak extenders or poor mesh hops, and compare against a phone hotspot if
needed.

## Healthy Device Checklist

A working flashed build should:

- Boot as `opendot`
- Start OpenDot Wi-Fi provisioning
- Save Wi-Fi credentials
- Receive a LAN IP from the local 2.4 GHz Wi-Fi network
- Reach `http://<runtime-lan-ip>:8787/ota/`
- Enter idle state after activation
- Appear in the platform runtime as available and ready

## Upstream Attribution

This firmware is an OpenDot fork of the
[78/xiaozhi-esp32](https://github.com/78/xiaozhi-esp32) ESP32 firmware project.
Portions derived from the upstream project remain covered by the original MIT
license, included here as [LICENSE.xiaozhi](LICENSE.xiaozhi).
