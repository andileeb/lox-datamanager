# Ask AI about your data

Beyond fixing statistics, the built-in [MCP server](../README.md#mcp-server) lets an AI
assistant **understand** them: where and when electricity is used, what the standby load
is, which automations would pay off, whether a PV system or battery is worth it.

The AI gets compact summaries instead of thousands of raw entries, so answers are fast
and cover months at once. Everything it uses for this is read-only.

## Set it up

1. **Settings** → **MCP server** → enable it.
2. Pick your AI app under **Connect** and copy the snippet: Claude Code (terminal command),
   Claude Desktop, Cursor or VS Code (config file — where to put it is shown above the
   snippet). Other apps that support MCP over HTTP work with the same URL and token.
3. Connect to your Miniserver in the app (or open downloaded stats offline).

## Ask

Ready-made prompts — in Claude Code type `/mcp__lox-datamanager__energy-report`, in
Claude Desktop pick them from the **+** menu, other clients show them under `/` or a
prompt picker:

| Prompt | What you get |
|---|---|
| **energy-report** | Total consumption, top consumers, daily/weekly pattern, standby load, unusual changes, the three biggest savings levers |
| **automation-ideas** | Automations derived from the measured patterns — observation, which Loxone function blocks, benefit, trade-off |
| **what-to-buy** | PV / battery / heat pump sizing from your hourly profile, and which meters or sensors would answer open questions |

Or just ask, e.g. _"how much did the heat pump use per week this summer compared to last
summer?"_ or _"what runs at night?"_.

## What the AI can look up

| Tool | Answers |
|---|---|
| `find_controls` | What is measured — one entry per control with room, category and unit |
| `energy_overview` | Energy per control and month, largest first (meter readings → consumption, kW → kWh) |
| `get_usage_profile` | A typical week: average per weekday and hour, weekday vs weekend, standby (base) load, highest hours |
| `get_aggregates` | Per hour / day / week / month for a range of months, min / max / average / total |

Good to know:

- **Times** are the Miniserver's local time, exactly as stored.
- **Meter readings** are recognized automatically; their "total" is the consumption in the
  period (a meter reset doesn't count as negative usage). For power (kW) the total is the
  energy (kWh).
- **Spikes** (sensor glitches, see the [README](../README.md#features)) are left out.
- **Units** come from [Loxone Config](names-and-rooms.md). Without them (e.g. offline
  without a structure file) `energy_overview` can't tell energy series apart — the other
  tools still work.
- Missing months are downloaded (read-only). Local copies are never replaced; when the
  Miniserver has newer data for a month, the AI is told so.
- `energy_overview` also lists producers (PV) and sub-meters — the AI is told not to add
  them up blindly.

## Together with Loxone's own MCP servers

Since Loxone Config 17.1 Loxone ships MCP servers of its own: one on the **Miniserver**
(live states, controlling functions) and one in **Loxone Config** (reading the open
project, placing and wiring function blocks, simulation). Add them to the same AI app
next to Lox DataManager and the AI can combine both:

- **History** (this app): what happened over months — usage patterns, base load, peaks.
- **Live state & programming** (Loxone): what is installed, how it's programmed, what
  it shows right now.

Example: _"My base load is high at night — check in my Loxone Config project which
outputs stay on, and suggest a change."_ The prompts here tell the AI to **ask before
changing anything** in Loxone Config or triggering functions — still review every change
in Config and test it in the simulation before saving it to the Miniserver. See
[Loxone's MCP documentation](https://www.loxone.com/enen/kb/mcp-server/) for setting
those up.

## Privacy

The data you ask about goes to the AI provider of your app (e.g. Anthropic, OpenAI) —
the app itself sends nothing anywhere. With a local model (e.g. via LM Studio or Ollama
based clients) nothing leaves your computer.
