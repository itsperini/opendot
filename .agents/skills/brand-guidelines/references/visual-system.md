# OpenDot Visual System

Use these guidelines when creating or reviewing OpenDot UI, docs visuals,
marketing pages, product mockups, README banners, diagrams, or generated assets.

## Stable Repo Context

This reference is the canonical style snapshot. It should remain useful even
when temporary design reference folders are removed.

Stable repo files to inspect when needed:

- `platform/src/styles.css`: dense product UI patterns and current app tokens.
- `platform/src/components/OpenDotLogo.tsx`: canonical logo mark as
  `currentColor` in React.
- `assets/opendot-logo.svg`: current README/banner SVG asset.
- `docs/logo/light.svg` and `docs/logo/dark.svg`: documentation navbar logo
  variants.
- `docs/images/opendot-banner.svg`: documentation banner asset.

## Brand Personality

OpenDot is the open platform for voice agents on real devices. The interface
should feel:

- technical but approachable
- product-first and operational
- precise, quiet, and physically grounded
- open-source credible, not enterprise-generic
- built for agents that leave the browser and bind to real hardware

Use concrete nouns from the product loop: build, tune, bind, run, operate,
voice pipeline, agent configuration, device, room, session, runtime, firmware,
knowledge, model, VAD, STT, LLM, TTS.

## Palette

Prefer the tokens below first. The CSS-only platform variables are useful
equivalents when Tailwind/shadcn variables are not available.

### Core Colors

| Role | Token/value | Use |
| --- | --- | --- |
| Deep violet | `#14091f` / `violet-950` | dark hero, runtime panes, code/env rows, primary dark CTAs |
| Logo violet | `#2e1065` | OpenDot mark on light surfaces |
| Primary violet | `#5b21b6` / `violet-800` | active nav, links, selected state text |
| Accent violet | `#6d28d9` / `violet-700` | focus, icons, labels, active controls |
| Soft violet | `#ede9fe` / `violet-100` | icon backgrounds, selected nav, subtle badges |
| Page tint | `#fbf9ff` | light brand page sections |
| Soft surface | `#f7f5fb` | product mockup interiors and subtle panels |
| White | `#ffffff` | cards, controls, content panels |
| Ink | `#171321` or zinc-950 | primary text |
| Muted | `#625c6f` or zinc-600 | body copy and secondary UI text |
| Subtle | `#91889f` or zinc-400/500 | helper text, timestamps, quiet metadata |
| Border | `#e8ddf8` / `violet-100` | standard panel/card borders |
| Strong border | `#d8c3f7` / `violet-200` | selected/hover/focusable borders |

Canonical shadcn/Tailwind OKLCH variables:

```css
--background: oklch(0.985 0.003 247);
--foreground: oklch(0.17 0.018 250);
--primary: oklch(0.45 0.22 295);
--accent: oklch(0.72 0.18 305);
--border: oklch(0.88 0.01 247);
--ring: oklch(0.58 0.2 295);
```

### Semantic Colors

Use semantic colors only to communicate state:

- Emerald: live, ready, available, success.
- Amber: connecting, warning, pending.
- Rose: error, offline, destructive.
- Zinc/slate: idle, neutral, disabled, historical data.

Do not introduce new brand accent families unless the feature truly needs a new
semantic channel.

## Typography

- Font family: `"Manrope", system-ui, sans-serif`.
- Use Manrope for headings, body, navigation, labels, and brand text.
- Use `SFMono-Regular`, Consolas, or Liberation Mono for code, env vars, logs,
  keys, and runtime traces.
- Marketing display headings use large semibold type. Product UI should use
  normal letter spacing unless preserving an existing brand component.
- Eyebrows are small, uppercase, bold, widely tracked labels in violet.
- Body copy is compact and readable: 14-18px, 1.55-1.75 line height depending on
  density.
- Product UI labels are bold and compact; avoid weak low-contrast labels.

## Logo And Brand Mark

Use the existing circular OpenDot mark from stable repo assets:

- `platform/src/components/OpenDotLogo.tsx`
- `assets/opendot-logo.svg`
- `docs/logo/light.svg`
- `docs/logo/dark.svg`

Rules:

- Use `currentColor` for React/SVG usage.
- On light surfaces, use logo violet `#2e1065` or `violet-950`.
- On dark surfaces, use white.
- For banners, a violet gradient mark is allowed when paired with a clean white
  rounded rectangle or brand surface.
- Keep the wordmark in Manrope, usually 600 weight. Avoid heavy display fonts,
  scripts, or custom lettering.
- Do not distort, outline heavily, rotate, or redraw the mark.

## Shape, Spacing, And Surfaces

- Standard radius: 6-8px (`rounded-md`, `rounded-lg`, or `border-radius: 8px`).
- Use pill radii only for tiny status chips, toggles, counters, and dots.
- Cards and panels use white backgrounds, violet-100 borders, and soft violet
  shadows such as `0 18px 60px rgba(76,29,149,0.08)`.
- Product tools should be denser than marketing sections: sidebars, panels, lists,
  grids, controls, and metadata should scan quickly.
- Avoid cards inside cards. Use full-width sections, panels, tables, lists, or
  grouped controls instead.
- Keep layout constraints stable with fixed icon/button sizes, grid tracks, and
  responsive min/max widths.

## Components

### Buttons

- Primary light-background CTA: deep violet background, white text.
- Primary dark-hero CTA: violet-300 background, deep violet text.
- Secondary dark CTA: transparent or `white/10` with `white/24` border.
- Secondary light action: white background, violet border, dark text, violet
  hover state.
- Include lucide icons where they clarify the action.
- Use 38-48px control heights depending on density.

### Navigation

- Marketing navbar starts transparent over the dark hero, then becomes
  `bg-white/88` with a violet-100 border and backdrop blur after scroll.
- Product sidebars use white translucent surfaces, violet borders, icon + label
  rows, and active states with soft violet fill plus subtle shadow.
- Keep nav labels short and product-specific.

### Cards And Panels

- Marketing cards: spacious white cards with violet-100 borders, rounded-lg, soft
  violet shadow, icon tile, heading, concise body.
- Product cards: compact white panels with 8px radius, thin violet border,
  small bold labels, and stable row/card dimensions.
- Dark system panels: deep violet/near-black backgrounds, white or violet-50
  text, thin translucent violet borders, and restrained glows.

### Inputs And Focus

- Inputs are white with violet-200/strong borders.
- Focus uses violet border plus a soft violet ring:
  `0 0 0 4px rgba(124, 58, 237, 0.13)` or Tailwind `focus:ring-violet-100`.
- Labels are bold, compact, and close to the control.

### Status And Runtime UI

- Use small chips for live/standby/error/connect states.
- Runtime logs and code-like panels use deep violet backgrounds with light
  violet monospace text.
- Timeline and metrics UI may use slate neutrals, but selected/primary traces
  should use the violet family.

## Page And Asset Composition

### Marketing Pages

- First screen may be immersive: dark violet hero, real product/device scene or
  interactive 3D, text over the scene, not text in a card.
- Use large, concise product claims, then concrete support copy.
- Alternate white and `#fbf9ff` sections.
- Use product mockups, stack diagrams, and device scenes instead of generic AI
  imagery.

### Product UI

- Prioritize operational density: left nav, clear panels, lists, selected
  states, forms, pipeline cards, status chips, and runtime logs.
- Use this palette, but avoid hero-sized type and decorative layout in
  dashboards.
- Make the pipeline stages visible and explicit: VAD, STT, LLM, TTS.
- Represent hardware binding concretely: device, room, environment, runtime,
  session, status, and update paths.

### Diagrams / README / Docs Assets

- Use white or near-white rounded rectangles with thin violet borders.
- Use transparent network lines, stage nodes, device dots, and pipeline arrows.
- Use violet gradients sparingly for the logo mark or small focal nodes.
- Export SVG when the asset is intended to scale; export PNG at 2x or higher for
  README/social contexts.
- Convert SVG to high-quality PNG with the bundled Sharp wrapper:

  ```bash
  .agents/skills/brand-guidelines/scripts/svg-to-png.sh \
    assets/opendot-logo.svg \
    assets/opendot-banner.png \
    --width 1520 \
    --height 440
  ```

- The wrapper runs `sharp-cli` through `npm exec`. Use `--density 288` or
  `SHARP_DENSITY=288` to control SVG rasterization without adding dependencies
  to the repo.
- Keep backgrounds simple enough to read on GitHub and docs pages in light and
  dark contexts.

## Motion

- Prefer subtle motion: fade-up, small translate, short hover transitions,
  pulsing status dots, or low-key 3D scene motion.
- Marketing pages may use `duration-700 ease-out` fade-up and a 2.5s dot pulse.
- Product UI transitions should stay around 120-180ms.
- Do not add motion that distracts from operating a voice session or reviewing
  runtime status.

## Anti-Patterns

- Generic AI sparkle, neural brain stock art, random robots, or abstract blobs.
- Heavy glassmorphism, blur-heavy backgrounds, or big floating cards everywhere.
- Overly rounded cards/buttons that make the product feel toy-like.
- One-note purple pages with no neutral hierarchy.
- Blue-first SaaS defaults unless a semantic state requires blue/cyan.
- Large explanatory in-app text that describes how to use obvious controls.
- Decorative assets that do not reveal product, device, runtime, or pipeline
  behavior.

## Practical Review

Ask these questions before finalizing visual work:

1. Would this sit naturally inside the OpenDot brand system?
2. Is the OpenDot mark used correctly and cleanly?
3. Is violet an accent/foundation rather than an uncontrolled wash?
4. Is the UI dense enough for repeated operational use when it is a product
   surface?
5. Are voice pipeline and hardware concepts represented concretely?
6. Are controls accessible, stable, non-overlapping, and responsive?
7. Are generated assets crisp as SVG or high-resolution PNG?
