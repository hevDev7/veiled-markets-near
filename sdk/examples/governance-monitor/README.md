# Governance Monitor Example

CLI tool that polls the Veiled Governance contract for new disputes and
escalated markets, prints them to the terminal, and optionally posts
alerts to a Discord webhook. Demonstrates:

- `VeiledGovernanceClient` for dispute/committee queries
- `IndexerClient` for market metadata enrichment
- Periodic polling pattern suitable for a cron job or systemd timer
- Discord webhook alert formatting

## Setup

```bash
cd sdk/examples/governance-monitor
pnpm install
export SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_ANON_KEY=sb_publishable_...
# Optional: Discord alerts
export DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/.../...
```

## Usage

```bash
# One-shot (print current disputes and exit)
tsx monitor.ts --once

# Daemon mode (poll every 60s, post alerts on new disputes)
tsx monitor.ts

# Dry-run Discord alerts (print to stdout instead of POST)
DRY_RUN=1 tsx monitor.ts
```

## What it monitors

- **New disputes** — markets where `dispute_resolution` has been called
  and a dispute bond is posted. These enter the challenge window.

- **Escalated markets** — disputes that move to `committee` or
  `community` tier (governance takes over resolution authority).

- **Committee decisions** — when a 5-member committee votes on a dispute
  outcome and the result is finalized.

For each event, the monitor resolves the market question via
`IndexerClient.getMarket()` so the alert shows human-readable text
instead of raw field IDs.
