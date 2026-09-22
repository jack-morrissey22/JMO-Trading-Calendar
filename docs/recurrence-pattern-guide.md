# JMO Calendar — recurrence pattern mapping guide

**Reflects the app's pattern set as of 2026-09-22 (rev 3).**
If the app gains a new pattern type, this file is updated in the dev chat and re-stamped.

---

## How to use this

1. Open a **fresh Claude chat** (a plain claude.ai chat is fine — no codebase needed).
2. Paste this **entire file** as the first message.
3. Then, one event at a time, paste the event's name and its **past release dates** (as many as you have, `YYYY-MM-DD` or any clear format).
4. Claude returns one of: a clean **FIT**, an **APPROXIMATE FIT** (the best formula + its miss profile), a **MANUAL** recommendation (only for genuinely irregular schedules), or a **MISFIT** report.
5. You apply FIT / APPROXIMATE-FIT / MANUAL results in the app (see "Applying a rule" at the bottom), adjusting an approximate formula's known misses as they approach. You collect any **MISFIT** reports and bring them to the **dev chat** to design new pattern types.

**The single most important instruction to the assistant using this guide:** your job is to find the *true* pattern, not to make it fit. If none of the rules below reproduces the past dates, you MUST say so and characterise the real pattern — never present an approximate rule as a match. Getting a square peg into a round hole here is the failure mode we are explicitly avoiding.

---

## Your task (assistant)

Given a list of past dates for one recurring event:

1. **Extract structure.** For each date note: weekday, day-of-month, business-day index counting from the 1st (weekdays only), business-day index counting back from month-end, and which week of the month it is (1st/2nd/… occurrence of that weekday). Also note which months of the year appear, and the gaps between dates.
2. **Form a hypothesis** about the invariant that holds across all dates (e.g. "always the 2nd Thursday", "always the 3rd business day", "every 6 weeks").
3. **Test it as one of the rules below** by computing what that rule would produce for each historical month and comparing to the actual dates.
4. A rule is a **clean FIT** only if it reproduces every past date — with one allowance: the three *business-day* rules and *day-of-month with a weekend roll* legitimately shift around weekends and **market holidays**, so a date that moved only for a holiday/weekend still counts (say so). (You won't know the user's exact holiday calendar; reason from well-known market holidays.)
5. **If no rule is a clean fit, do NOT jump to manual or misfit.** Find the *best-fitting* formula and report it as an **APPROXIMATE FIT**: state its accuracy over the sample and characterise exactly which months/conditions it misses and what to do about them (adjust that occurrence when confirming it; attach a holiday calendar so holiday shifts get flagged). A formula that's roughly **≥80%** right is usually the right answer — the app is built for "mostly right + adjust the known exceptions as they approach," so a good approximation beats a hand-maintained date list across many events.
6. Pick exactly one output:
   - **FIT** — a formula reproduces every date.
   - **APPROXIMATE FIT** — the best formula is imperfect but reasonably close (~≥80%); recommend it with its miss profile.
   - **MANUAL** — no formula gets reasonably close *and* the schedule is just an irregular list of known dates.
   - **MISFIT** — the dates follow a real, describable *formula* that none of the current rules express. This is the only case to escalate for a new rule.

**Formula-first.** Default to the closest formula. Manual dates are for genuinely irregular schedules — *not* for "the dates happen to be published." If an authoritative published schedule exists, you may *mention* it as context, but it is **not by itself a reason** to choose MANUAL; prefer the formula unless it's genuinely poor. Reserve MISFIT for a genuine new *formula shape* — and first check the **Candidate new rules** list below; if the dates match a known candidate, label the misfit as that candidate's instance.

Never guess silently. If two rules both fit, recommend the simpler/more-robust one.

---

## The rule catalogue

Every pattern the app supports today. UI path is: open any occurrence of the series → **Repeats** is on → set **Frequency**, then (for Monthly-based) **Months** and **On**.

### Frequency: "Monthly-based"
First pick **Months**: `Every month` · `Quarterly (Mar/Jun/Sep/Dec)` · `Once a year` (+ month) · `Specific months…` (+ month chips). Then pick **On** (the day-rule):

1. **Nth weekday** — the *Nth* [Mon–Sun] of the month. N ∈ {1st, 2nd, 3rd, 4th, last}.
   - *Semantics:* if a month has no 5th of that weekday, that month is skipped (N=last always exists).
   - *Example:* "2nd Thursday" → Feb 2026 = 12th, Mar 2026 = 12th, Apr 2026 = 9th.

2. **Day of month** — a fixed calendar day [1–31], with a weekend **roll**: `→ next weekday`, `→ prev weekday`, `→ nearest weekday (stay in month)`, or `keep as-is`.
   - *Semantics:* if the day exceeds the month length and roll ≠ nearest, that month is skipped; `nearest` clamps to the month's last weekday.
   - *Example:* "the 15th, roll → next" → if the 15th is a Saturday, lands on Monday the 17th.

3. **Nth business day** — the *Nth* business day counting **from the 1st** (1 = the first weekday of the month). N ∈ [1..23].
   - *Semantics:* business day = a weekday that is **not** a respected holiday (holiday-aware). Skips weekends and the series' holidays.
   - *Example:* "3rd business day" of a month starting on a Sunday → Wed the 4th (Mon 2nd = 1st biz day, Tue 3rd = 2nd, Wed 4th = 3rd), unless one of those is a holiday.

4. **Nth-last business day** — the *Nth* business day counting **back from month-end** (1 = the last weekday, 2 = second-to-last…). N ∈ [1..23]. Holiday-aware.
   - *Example:* "last business day" → the final weekday of the month that isn't a holiday.

5. **Business days before a date** — *N* business days **before the Dth** calendar day. Inputs: N ∈ [0..20], D ∈ [1..31]. Holiday-aware.
   - *Semantics:* start at the Dth (clamped to month-end if the month is short), then step back N business days. Classic for expiries ("trading ceases 2 business days before the 15th").
   - *Example:* "2 business days before the 15th" → if the 15th is a Wednesday, → Monday the 13th.

6. **Offset from a date** — *±N* calendar days from the Dth, then **snap to the nearest weekday**. Inputs: offset (can be negative), D ∈ [1..31].
   - *Semantics:* NOT month-bounded and NOT holiday-aware — a plain calendar offset with a weekend snap (Sat→Fri, Sun→Mon). Use only when the others don't express it.
   - *Example:* "7 days before the 25th (nearest weekday)".

7. **First weekday on/after a date** — the first [weekday] on or after the Dth, then rolled off weekends and respected holidays to the next business day. Inputs: weekday, D ∈ [1..31]. **Holiday-aware** (attach a holiday calendar so the roll works).
   - *Semantics:* this is the true form of many mid-month stat releases that *look* like "Nth weekday" but actually anchor to a date — they coincide most months and diverge when the month starts on a day that puts the 2nd occurrence of the weekday on/after D. Prefer this over "Nth weekday" when the release tracks a day-of-month.
   - *Example:* Canada CPI = "first Monday on/after the 14th" + Canada (TSX): Sep 2026 → 14th; Feb → Tue 17th (Family Day rolled); Dec 2026 → 14th.

### Frequency: "Weekly"
Pick one or more weekdays. Fires every week on those days. No monthly logic.
- *Example:* jobless claims every Thursday → Weekly, Thu.

### Frequency: "Every N weeks"
Every N weeks (N ∈ [1..104]) counting from **this event's date** (the anchor). Good for cadence events with no calendar-month logic (e.g. ~6-week central-bank cycles). Projects "N occurrences ahead" rather than months ahead.
- *Example:* an ECB-style ~6-week cycle → Every 6 weeks.

### Frequency: "Manual dates"
An explicit list of dates (no formula). Paste one per line. Options: a "year if not given" default, and an optional "resolve to N business/calendar days before each pasted date" shift.
- Reserve this for **genuinely irregular** schedules that no formula (clean or approximate) captures. Do **not** pick manual just because an official schedule is published — a formula that's ~≥80% right, adjusted as exceptions approach, is lower-maintenance across many events than a date list you re-pull every year.

---

## Output template — FIT

```
EVENT: <name>
PATTERN: <plain-English description, e.g. "2nd Thursday of every month">
CONFIDENCE: high | medium (say why if not high)

SET IN APP:
  Frequency: <Monthly-based | Weekly | Every N weeks | Manual dates>
  Months:    <Every month | Quarterly | Once a year (<Mon>) | Specific: <list>>   (monthly only)
  On:        <Nth weekday | Day of month | Nth business day | Nth-last business day | Business days before a date | Offset from a date>
  Params:    <exact values, e.g. "2nd, Thursday"  /  "3 business days, from the 1st"  /  "2 business days before the 15th">

CHECK: next 3 dates this rule produces → <d1>, <d2>, <d3>
  (Confirm these look right before applying. Holiday shifts are handled by the app.)
NOTES: <e.g. "Mar 2026 shifted from the 3rd to the 4th because of a holiday — expected.">
```

## Output template — APPROXIMATE FIT (the usual answer for imperfect-but-close formulas)

```
EVENT: <name>
BEST FORMULA: <plain-English, e.g. "1st Friday of every month">
ACCURACY: ~<pct>% over the sample (<hits> of <total>)
SET IN APP:
  Frequency / Months / On / Params: <exact values, as in FIT>
ATTACH: <holiday calendar(s) to attach, if misses are holiday-driven — e.g. "US">
MISSES (what you'll adjust as they approach):
  - <condition> → formula gives <X>, actual <Y>   (e.g. "the ~1–2 months/yr it's the 2nd Friday")
  - holiday-driven shifts will surface as the ⚠️ flag once the calendar is attached
CHECK: next 3 dates this rule produces → <d1>, <d2>, <d3>
```

## Output template — MISFIT (bring this to the dev chat)

First check the **Candidate new rules** list below — if the shape matches, name that candidate and add this event as an instance.

```
⚠️ NO EXISTING RULE FITS
EVENT: <name>
PAST DATES: <the dates>
STRUCTURE OBSERVED:
  - weekdays: <...>
  - day-of-month: <...>
  - biz-day-from-start / from-end: <...>
  - week-of-month: <...>
  - month coverage: <...>
THE REAL PATTERN (best characterisation): <precise plain-English rule, e.g.
  "the Wednesday of the week containing the 15th" or
  "the first Friday that is at least 5 business days after month start">
WHY NO RULE FITS: <which rules were tested and how each failed>
PROPOSED NEW RULE (draft spec for the engine):
  name: <snake_case, e.g. weekday_of_week_containing_dom>
  inputs: <params>
  definition: <how to compute the date for a given month>
```

Order of preference: **clean FIT → approximate FIT → MANUAL (only if genuinely irregular) → MISFIT (only for a real new formula shape).**

---

## Candidate new rules to watch

Misfit *shapes* seen so far. If an event's dates match one of these, label the MISFIT with the candidate name and add the event under its instances. **Reuse — not complexity — decides when we build one:** a complex rule serving one event isn't worth it; the same rule serving several is. We build a candidate once 2–3+ events share its shape.

### Candidate #1 — `reference_week` (aka `nth_weekday_after_reference_week`)
- **Shape:** the Nth [weekday] after the end of the Sun–Sat week containing the Dth of a reference month (usually the previous month), with a holiday roll. The release day-of-month wanders — usually, but not always, the 1st [weekday] of the month. Some events sit at a fixed **offset from** this anchor.
- **Instances (2 — approaching the build threshold):**
  1. **US Non-Farm Payrolls / Employment Situation** — ref D=12, prev month, 3rd Friday, US-federal holiday roll (BLS "third Friday after the reference week"). *Interim:* `1st Friday` + US holidays (~85%).
  2. **US ADP Nonfarm Employment Change** — the NFP anchor **minus 2 days** (the Wednesday of NFP week); if the Monday of that week is a federal holiday (Labor Day), minus 1 day instead. *Interim:* `1st Wednesday` + US holidays (~73%).
- **Design options when we build it:**
  - **(a)** add a `result_offset_days` input to `reference_week` (NFP = 0, ADP = −2) plus the Labor-Day clause — self-contained, simple.
  - **(b)** a more general **"offset from another series' occurrence"** primitive (ADP = NFP's date − 2 days). More powerful — many events cluster around anchors (ADP↔NFP; events keyed to FOMC/CPI) — but a bigger change (one series depends on another → dependency + re-projection ordering). Decide (a) vs (b) at build time.
- **Status:** NOT built. Build when clearly worth it (~3+ instances, or when (b) would serve several anchor-relative events). Use the per-instance interims above until then.
- **If built:** leave out ad-hoc exception hacks (e.g. an "early-January +7" fudge). Discretionary shifts (benchmark revisions, shutdowns) aren't formula-modelable — handle per-occurrence.

### Candidate #2 — `first_weekday_on_or_after` (weekday anchored to a day-of-month)
- **Shape:** the first [weekday] on or after the Dth of the month (D typically ~11–14). **Easy to mistake for `Nth weekday`** — they give the same date in most months and only diverge when the month starts so that the target weekday's 2nd occurrence is already ≥ D (then "on/after D" lands a week earlier than "3rd weekday").
- **Instances (2):**
  1. **UK GDP (Monthly)** — group A (Jan/Apr/Jul/Oct): looks like "3rd Thursday", likely "first Thursday on/after ~the 11th". Divergence test: **Jan 2027** (3rd Thu = 21st vs on/after-11 = 14th).
  2. **Canada CPI** — Monday regime (since Nov 2025): looks like "3rd Monday", likely "first Monday on/after the 14th". Divergence test: **Dec 2026** (3rd Mon = 21st vs on/after-14 = 14th). (June runs a week later → its own 4th-weekday series.)
- **Status: BUILT (2026-09-22)** as rule #7 above (`First weekday on/after a date`, holiday-rolled). Canada CPI's Sep 2026 already confirmed the day-of-month anchor (released the 14th, not the 21st), so **use rule #7 for Canada CPI now** (group A: first Monday on/after the 14th; June group B: on/after the 21st — or keep June as 4th Monday). **UK GDP:** hold on the `3rd Thursday` interim until **Jan 2027** confirms the earlier date, then switch group A to "first Thursday on/after the 11th". Attach the holiday calendar so the roll works.

---

## Applying a rule in the app (reference for you, the user)

1. Open the event — **any occurrence, it doesn't matter which** (the pattern lives on the series, not the occurrence).
2. In the pattern editor set Frequency / Months / On / Params as above.
3. Click **Update repeat & re-project.** This regenerates all *future* projections on the new pattern. Your time, alerts, priority, category, holiday calendars and sound carry forward automatically.
4. Only cleanup: if you had *confirmed* future occurrences on the old dates, they're locked and won't move — delete those few strays. Tentative future ones are replaced cleanly. Use the **census** at the top of the editor to check counts.
5. Take an **Export → JSON restore file (complete)** before a batch, so it's all undoable.
