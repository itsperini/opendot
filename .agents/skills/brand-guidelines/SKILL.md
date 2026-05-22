---
name: brand-guidelines
description: OpenDot brand and visual system guidance for creating, editing, or reviewing UI, documentation visuals, marketing pages, product mockups, diagrams, logos, screenshots, README assets, and other OpenDot-branded assets, including high-quality SVG-to-PNG exports with the bundled sharp-cli helper. Use when work involves visual design, styling, frontend UI, brand consistency, imagery, icons, typography, colors, spacing, asset generation, or raster export for OpenDot.
---

# Brand Guidelines

Use this skill to keep OpenDot UI and assets visually consistent with the
canonical OpenDot visual direction captured here.

## Source Priority

1. Treat this skill and `references/visual-system.md` as the source of truth.
2. Use existing checked-in assets and product UI only as implementation context.
3. Preserve local patterns when editing a scoped surface, then move it closer to
   this visual system without creating a visual fork.

For detailed tokens, component rules, asset guidance, and review checks, read
`references/visual-system.md`.

## Brand Direction

OpenDot should feel like a serious, open platform for voice agents on real
devices: technical, calm, precise, and physical-world aware. The design language
is product-first, not decorative SaaS gloss.

Favor:

- deep violet foundations with light violet tints and neutral zinc/slate text
- crisp white or near-white surfaces with thin violet borders
- 6-8px radii, compact spacing, and clear hierarchy
- Manrope for all UI and brand text
- lucide icons for interface actions and product concepts
- concrete voice-agent motifs: pipeline stages, devices, rooms, sessions,
  network lines, stack layers, runtime status, and hardware binding

Avoid:

- generic blue SaaS palettes, rainbow gradients, beige themes, and heavy glass
  effects
- oversized marketing cards in operational product UI
- thick rounded pills as the default shape for buttons or cards
- stock imagery that hides the actual product, device, or workflow
- decorative SVG blobs/orbs, abstract bokeh, or unrelated AI imagery

## Quick UI Rules

- Use `#14091f` / violet-950 for dark hero or runtime surfaces.
- Use `#fbf9ff`, `#f7f5fb`, and white for light page and panel surfaces.
- Use violet accents sparingly: primary actions, focus rings, selected states,
  icons, labels, and pipeline highlights.
- Use semantic status colors only for state: emerald live/ready, amber
  connecting/warning, rose error/offline, neutral zinc idle.
- Keep cards as individual items or framed tools. Do not nest cards inside
  cards.
- Use icons inside buttons when an icon exists, especially for tool actions.
- For product tools, prioritize dense but readable dashboards over marketing
  spectacle.

## Asset Rules

- Use the existing OpenDot mark; do not redraw or reinterpret it.
- Render the mark with `currentColor` where possible: violet-950 on light,
  white on dark, and violet gradients only for deliberate brand banners.
- Diagrams should look like product architecture: thin network lines, stage
  nodes, device bindings, rooms, runtime paths, and subtle violet transparency.
- Prefer SVG for scalable diagrams/logos and high-resolution PNG exports for
  README/social assets.
- For SVG-to-PNG exports, use
  `scripts/svg-to-png.sh <input.svg> <output.png> [--width px --height px]`.

## Export Helpers

Use the bundled Sharp wrapper when a brand SVG needs a crisp PNG:

```bash
.agents/skills/brand-guidelines/scripts/svg-to-png.sh \
  assets/opendot-logo.svg \
  assets/opendot-banner.png \
  --width 1520 \
  --height 440
```

The script runs `sharp-cli` through `npm exec`, so it does not require adding
`sharp-cli` to the repository dependencies. Set `--density` or
`SHARP_DENSITY=288` when a different rasterization density is needed.

## Review Checklist

Before handing back UI or assets, check:

- Does it look like OpenDot rather than a generic template?
- Are Manrope, violet/near-white surfaces, 6-8px radii, and thin borders used
  consistently?
- Are labels, buttons, and cards compact enough for a real product surface?
- Are device, voice pipeline, and runtime concepts represented concretely?
- Does the work avoid unrelated decorative effects and one-note purple wash?
