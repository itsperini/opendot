#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  svg-to-png.sh <input.svg> <output.png> [--width px --height px] [--density dpi]
  svg-to-png.sh <input.svg> <output.png> [width height]

Examples:
  svg-to-png.sh assets/opendot-logo.svg assets/opendot-banner.png --width 1520 --height 440
  SHARP_DENSITY=288 svg-to-png.sh docs/images/opendot-banner.svg /tmp/opendot-banner.png

Defaults:
  --density defaults to SHARP_DENSITY, or 288 when unset.
  width/height are optional; when omitted, sharp renders from the SVG dimensions.
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

original_args=("$@")

if [[ $# -lt 2 ]]; then
  usage >&2
  exit 2
fi

input=$1
output=$2
shift 2

width=""
height=""
density="${SHARP_DENSITY:-288}"

if [[ $# -eq 2 && "${1:-}" =~ ^[0-9]+$ && "${2:-}" =~ ^[0-9]+$ ]]; then
  width=$1
  height=$2
  shift 2
fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --width)
      if [[ $# -lt 2 ]]; then
        echo "--width requires a pixel value." >&2
        exit 2
      fi
      width="${2:-}"
      shift 2
      ;;
    --height)
      if [[ $# -lt 2 ]]; then
        echo "--height requires a pixel value." >&2
        exit 2
      fi
      height="${2:-}"
      shift 2
      ;;
    --density)
      if [[ $# -lt 2 ]]; then
        echo "--density requires a DPI value." >&2
        exit 2
      fi
      density="${2:-}"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! -f "$input" ]]; then
  echo "Input SVG not found: $input" >&2
  exit 1
fi

if [[ "$input" != *.svg ]]; then
  echo "Input must be an .svg file: $input" >&2
  exit 1
fi

if [[ "$output" != *.png ]]; then
  echo "Output must be a .png file: $output" >&2
  exit 1
fi

if [[ -n "$width" || -n "$height" ]]; then
  if [[ -z "$width" || -z "$height" ]]; then
    echo "Provide both --width and --height, or omit both." >&2
    exit 2
  fi
  if [[ ! "$width" =~ ^[0-9]+$ || ! "$height" =~ ^[0-9]+$ ]]; then
    echo "Width and height must be positive pixel integers." >&2
    exit 2
  fi
  if (( width <= 0 || height <= 0 )); then
    echo "Width and height must be greater than zero." >&2
    exit 2
  fi
fi

if [[ ! "$density" =~ ^[0-9]+$ ]]; then
  echo "Density must be a positive integer." >&2
  exit 2
fi
if (( density <= 0 )); then
  echo "Density must be greater than zero." >&2
  exit 2
fi

if ! command -v npm >/dev/null 2>&1; then
  if [[ -z "${OPENDOT_SVG_TO_PNG_LOGIN_SHELL:-}" ]] && command -v zsh >/dev/null 2>&1; then
    export OPENDOT_SVG_TO_PNG_LOGIN_SHELL=1
    exec zsh -ilc 'exec "$@"' svg-to-png "$0" "${original_args[@]}"
  fi

  echo "npm was not found on PATH. Install Node.js/npm or run from a shell where npm is available." >&2
  exit 127
fi

mkdir -p "$(dirname "$output")"
tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/opendot-svg-to-png.XXXXXX")
trap 'rm -rf "$tmpdir"' EXIT

sharp_args=(-i "$input" -o "$tmpdir" --density "$density" -f png)
if [[ -n "$width" ]]; then
  sharp_args+=(resize "$width" "$height")
fi

npm exec --yes --package sharp-cli -- sharp "${sharp_args[@]}" >/dev/null

rendered=$(find "$tmpdir" -maxdepth 1 -type f -name '*.png' -print -quit)
if [[ -z "$rendered" ]]; then
  echo "sharp-cli did not produce a PNG output." >&2
  exit 1
fi

mv "$rendered" "$output"
echo "Rendered $input -> $output"
