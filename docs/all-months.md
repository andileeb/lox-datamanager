# All months of a control

Every statistics file holds one month. **All months** shows every month of one
control in a single chart — e.g. a meter's whole year — with a summary per month.

## Open it

- In the file list, click the calendar icon on any month of the control.
- In the editor, click **All months**.

Months that aren't on your computer yet are downloaded first (this only reads
the Miniserver). Months you edited locally are shown as you edited them — they
are never replaced by the Miniserver's copy.

## What you see

- **Chart** over all months, zoomable like the editor chart (drag to zoom,
  double-click to reset).
- **Per month**: number of entries, and per value min – max and average, with
  the unit from [Loxone Config](names-and-rooms.md). Broken entries (e.g. NaN)
  are left out of the numbers and counted under **Problems**.
- **Click** a month, or a point in the chart, to open that month in the editor
  at that entry. **Back** in the editor returns to the all-months view.

The view is read-only; edits happen per month in the editor, as before.

## Details

- Meter files with a suffix (`_1` power, `_2` meter reading, `_3` storage) are
  separate controls here — power and meter readings aren't mixed in one chart.
- A month that stores a different number of values than the newest month (e.g.
  after a change in Loxone Config) is listed, marked **not in chart**, and left
  out of the chart.
- Works [offline](offline.md) with the months already downloaded; missing months
  are named in a note.
