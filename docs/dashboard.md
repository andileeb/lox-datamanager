# Dashboard

The **Dashboard** answers "where does my energy go?" without an AI: it reads your
energy meters' statistics and shows totals, months and a typical week.

## Open it

Click **Dashboard** above the file list. Pick **3, 6 or 12 months**; the range ends
with the newest month that has statistics.

Months that aren't on your computer yet are downloaded first (this only reads the
Miniserver). Months you edited locally are used as you edited them. Sensor glitches
(spikes) are left out of the numbers.

## What you see

- **Energy by control**: kWh in the range for every meter and power series, largest
  first. Producers (e.g. PV) and sub-meters of the same circuit are listed too, so
  don't add the numbers up. Meters with two readings (consumption and production, or
  two tariffs) show the second one next to the first.
- Click a control to see the rest of the page for it:
  - **kWh per month**: one bar per month. Click a bar to open that month in the editor.
  - **Typical week**: average per weekday and hour as a heatmap; a stronger color
    means more. Hover a cell for its value. Times are the Miniserver's local time.
  - **Standby (base load)**: the lowest 10 % of hours, i.e. what is always on. For
    power units it also shows what that costs in a year (base load × 8760 h).
  - **Weekdays / Weekend**: average power on working days vs. the weekend.
  - **All months** opens the [all-months chart](all-months.md) of the control.

## Where the numbers come from

- Meter readings (kWh, cumulative): consumption = sum of the increases; a reset
  (meter replaced) is skipped.
- Power (kW, W): integrated over time; gaps in the recording don't count as usage.
- A control that has both (Loxone Meter `_1` power, `_2` reading) is shown once, from
  the meter reading.

The dashboard needs units (kWh, kW) from [Loxone Config](names-and-rooms.md). Without
a connection to the Miniserver, it only finds them if the structure file was read once
before, or a `LoxAPP3.json` is in the opened folder.

The same numbers are what the AI gets through the MCP tools (`energy_overview`,
`get_usage_profile`) — see [Ask AI about your data](insights.md).
