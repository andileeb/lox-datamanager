# Ask AI about your data

Beyond fixing statistics, the built-in [MCP server](../README.md#mcp-server) lets an AI
assistant **understand** them: where and when electricity is used, what the standby load
is, which automations would pay off, whether a PV system or battery is worth it.

The AI gets compact summaries instead of thousands of raw entries, so answers are fast
and cover months at once. Everything it uses for this is read-only.

## Set it up

When Lox DataManager finds Claude Code or Claude Desktop on your computer, it offers this
once at the bottom of the window: click **Add** and you're done. Otherwise:

1. Open **Settings → AI** (or **Ask Claude** on the dashboard).
2. Click **Add** next to Claude Code or Claude Desktop. The app switches _AI access_ on.
   - **Claude Code**: the entry goes into Claude Code's settings — start a new session.
   - **Claude Desktop**: Claude Desktop opens its install dialog for the _Lox DataManager_
     extension — click **Install**. Nothing else is needed (no Node.js). You find it later under
     Claude Desktop → Settings → Extensions, where you can switch it off or remove it.

   When the token, the port or a connection code changes later, both keep working by themselves —
   if another program already uses the port, the app moves to a free one and updates Claude.
   Other AI apps (Cursor, VS Code, …): open **Other AI apps & advanced** and copy the snippet —
   where to put it is shown above it. Apps that support MCP over HTTP work with the same URL
   and token.
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
| **improve-config** | Finds something to improve in your data and changes your Loxone Config project — only after you approve (see below) |

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

Loxone has two MCP servers of its own (as of November 2026):

- **Miniserver MCP** — a plugin that runs on the Miniserver (Gen 2), released with Loxone
  Config 17.1 and added under *Network Periphery*. Live states, controlling functions,
  weather forecast, system messages. Clients sign in with a Loxone user; the address can
  be the Remote Connect one.
- **Loxone Config MCP** — runs inside Loxone Config on your PC and works on the **open
  project**: reading it, placing and wiring function blocks, adding devices, changing
  settings, driving the simulation. Enabled from its entry in Config's title bar; Claude
  Code, Codex and Claude Desktop connect with one click. Every change goes through Config
  and can be undone step by step. Currently only in the **Config 17.3 public beta**.

Add them to the same AI app next to Lox DataManager and the AI can combine both:

- **History** (this app): what happened over months — usage patterns, base load, peaks.
- **Live state & programming** (Loxone): what is installed, how it's programmed, what
  it shows right now.

Example: _"My base load is high at night — check in my Loxone Config project which
outputs stay on, and suggest a change."_ The prompts here tell the AI to **ask before
changing anything** in Loxone Config or triggering functions. Still review every change
in Config and test it in the simulation before saving to the Miniserver. Setup steps are
in Loxone Config's MCP Server dialog and the
[Config changelog](https://www.loxone.com/enen/support/changelog-config/) /
[public beta changelog](https://www.loxone.com/enen/support/loxone-config-public-beta/).
Config on another PC than your AI app: see [Loxone Config from another computer](loxone-config-mcp.md).

## Privacy

The data you ask about goes to the AI provider of your app (e.g. Anthropic, OpenAI) —
the app itself sends nothing anywhere. With a local model (e.g. via LM Studio or Ollama
based clients) nothing leaves your computer.

## Change Loxone Config from your data

With [Loxone Config connected](loxone-config-mcp.md) as well, the prompt **improve-config**
goes all the way from the measured data to the project. Give it a goal, or leave it empty
for standby load — in Claude Code: `/mcp__lox-datamanager__improve-config "PV self-consumption"`.

1. It looks up the controls that matter in your statistics, with numbers.
2. It reads your open Config project to see how they are programmed.
3. It suggests up to three changes — what it saw, what to change, expected effect, trade-off —
   and **stops to ask** which one to make.
4. Only after your OK it makes that one change in Config and tells you what to check there.

It never saves the project and never sends anything to the Miniserver: you check the change
in Config (and its simulation), undo it or save it yourself.
