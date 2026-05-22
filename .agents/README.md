# Shared Agent Setup

This directory is the repo-owned source of truth for agent behavior in OpenDot.

Use `.agents/` for configuration and guidance that should apply across coding
tools. Do not put durable shared guidance only in `.claude/`, `.codex/`,
`.cursor/`, `.vscode/`, or another tool-specific directory.

## Layout

- `AGENTS.md`: canonical shared root instructions
- `ARCHITECTURE_PRINCIPLES.md`: product and architecture principles for OpenDot
- `config.json`: shared agent configuration and MCP server definitions
- `skills/`: shared skills for recurring agent workflows

## `config.json`

`.agents/config.json` keeps project-level defaults for tools that can consume a
shared configuration file.

Current shape:

```json
{
  "shared": {
    "devCommand": "cd platform && npm run dev",
    "runtimeCommand": "cd platform && npm run runtime",
    "docsCommand": "cd docs && mint dev",
    "devTerminalDescription": "OpenDot platform development server"
  },
  "mcpServers": {
    "playwright": {
      "transport": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@playwright/mcp@latest",
        "--isolated",
        "--save-session",
        "--output-dir",
        ".playwright-mcp",
        "--test-id-attribute",
        "data-testid"
      ]
    }
  },
  "claude": {
    "settings": {
      "permissions": {
        "allow": [
          "Bash(find:*)",
          "Bash(rg:*)",
          "Bash(grep:*)",
          "Bash(ls:*)",
          "Bash(cat:*)",
          "Bash(head:*)",
          "Bash(tail:*)"
        ],
        "deny": []
      },
      "enableAllProjectMcpServers": true
    }
  },
  "codex": {
    "environment": {
      "version": 1,
      "name": "opendot"
    }
  },
  "cursor": {
    "environment": {
      "agentCanUpdateSnapshot": false
    }
  }
}
```

## When To Edit `config.json`

Edit `.agents/config.json` when you need to:

- add, remove, or update a shared MCP server
- change the default platform, runtime, or docs command
- adjust generated Claude, Cursor, or Codex settings that are intentionally
  modeled in the shared config

Keep the file minimal. If a setting only helps one local machine or one task, do
not add it here.

## Shared Skills

Shared skills live under `.agents/skills/`.

Current shared skills:

- `brand-guidelines`: OpenDot visual style for UI and brand assets.
- `firmware-build`: ESP-IDF setup, build, flash, and serial checks for
  `dot-device/firmware/**` work.
- `skill-creator`: workflow for creating, refining, or reviewing shared skills.

For the skill authoring workflow, see [skills/README.md](skills/README.md).

## Workflow

When editing `.agents/**`:

1. Keep guidance tool-neutral unless the file is explicitly tool-specific.
2. Keep root guidance short and route detailed workflows into skills only when
   they are reusable.
3. Validate changed JSON with `python3 -m json.tool .agents/config.json`.
4. Run `git diff --check` before handing work back.
