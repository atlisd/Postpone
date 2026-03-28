import { addDays, format, startOfDay } from 'date-fns';

export interface ParsedDateResult {
  cleanTitle: string;
  dueDate: string;       // 'YYYY-MM-DD'
  dueDateTime?: string;  // ISO 8601 UTC string
}

const MONTH_MAP: Record<string, number> = {
  jan: 0, january: 0,
  feb: 1, february: 1,
  mar: 2, march: 2,
  apr: 3, april: 3,
  may: 4,
  jun: 5, june: 5,
  jul: 6, july: 6,
  aug: 7, august: 7,
  sep: 8, september: 8,
  oct: 9, october: 9,
  nov: 10, november: 10,
  dec: 11, december: 11,
};

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

/** Returns the next occurrence of targetDow (0=Sun…6=Sat) from today.
 *  Always at least 1 day ahead (if today is targetDow, returns +7 days). */
function nextWeekday(targetDow: number, today: Date): Date {
  const todayDow = today.getDay();
  let daysAhead = targetDow - todayDow;
  if (daysAhead <= 0) daysAhead += 7;
  return addDays(startOfDay(today), daysAhead);
}

/** Remove matched spans from the original string, collapse spaces, trim. */
function removeSpans(original: string, spans: Array<[number, number]>): string {
  const sorted = [...spans].sort((a, b) => a[0] - b[0]);
  let result = '';
  let cursor = 0;
  for (const [start, end] of sorted) {
    result += original.slice(cursor, start);
    cursor = end;
  }
  result += original.slice(cursor);
  return result.replace(/\s{2,}/g, ' ').trim();
}

export function parseNaturalDate(raw: string): ParsedDateResult | null {
  if (!raw.trim()) return null;

  const lower = raw.toLowerCase();
  const today = startOfDay(new Date());

  // ── 1. Extract time token ────────────────────────────────────────────────
  let timeHours = -1;
  let timeMinutes = 0;
  let timeSpan: [number, number] | null = null;

  // 24-hour: e.g. "16:00", "9:30"
  const time24 = /\b(\d{1,2}):(\d{2})\b/.exec(lower);
  if (time24) {
    const h = parseInt(time24[1], 10);
    const m = parseInt(time24[2], 10);
    if (h <= 23 && m <= 59) {
      timeHours = h;
      timeMinutes = m;
      timeSpan = [time24.index, time24.index + time24[0].length];
    }
  }

  // 12-hour: e.g. "4pm", "11am", "4 pm" — only if no 24h match
  if (timeSpan === null) {
    const time12 = /\b(\d{1,2})\s*(am|pm)\b/.exec(lower);
    if (time12) {
      let h = parseInt(time12[1], 10);
      const ampm = time12[2];
      if (h >= 1 && h <= 12) {
        if (ampm === 'pm' && h !== 12) h += 12;
        if (ampm === 'am' && h === 12) h = 0;
        timeHours = h;
        timeMinutes = 0;
        timeSpan = [time12.index, time12.index + time12[0].length];
      }
    }
  }

  // Build a version of lower with the time span blanked out (replaced with spaces)
  // so date patterns don't accidentally match inside time strings.
  let lowerNoTime = lower;
  if (timeSpan) {
    lowerNoTime =
      lower.slice(0, timeSpan[0]) +
      ' '.repeat(timeSpan[1] - timeSpan[0]) +
      lower.slice(timeSpan[1]);
  }

  // ── 2. Extract date token (priority order) ───────────────────────────────
  let resolvedDate: Date | null = null;
  let dateSpan: [number, number] | null = null;

  const WEEKDAY_PATTERN =
    'mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?';
  const MONTH_PATTERN =
    'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';

  const patterns: Array<{ re: RegExp; resolve: (m: RegExpExecArray) => Date }> = [
    // 1. "next monday" etc.
    {
      re: new RegExp(`\\bnext\\s+(${WEEKDAY_PATTERN})\\b`),
      resolve: (m) => {
        const dow = WEEKDAY_MAP[m[1].slice(0, 3)];
        // "next [weekday]" always means strictly next week occurrence
        const todayDow = today.getDay();
        let daysAhead = dow - todayDow;
        if (daysAhead <= 0) daysAhead += 7;
        // If same day, "next monday" from a monday = +7
        else if (daysAhead === 0) daysAhead = 7;
        return addDays(today, daysAhead);
      },
    },
    // 2. "next week"
    {
      re: /\bnext\s+week\b/,
      resolve: () => addDays(today, 7),
    },
    // 3. "tonight"
    {
      re: /\btonight\b/,
      resolve: () => today,
    },
    // 4. "tomorrow" / "tmrw"
    {
      re: /\bt(?:omorrow|mrw)\b/,
      resolve: () => addDays(today, 1),
    },
    // 5. "today"
    {
      re: /\btoday\b/,
      resolve: () => today,
    },
    // 6a. "[D] [Month]" e.g. "20 apr"
    {
      re: new RegExp(`\\b(\\d{1,2})\\s+(${MONTH_PATTERN})\\b`),
      resolve: (m) => {
        const day = parseInt(m[1], 10);
        const monthKey = m[2].slice(0, 3);
        const month = MONTH_MAP[monthKey];
        let year = today.getFullYear();
        let d = new Date(year, month, day);
        if (d < today) d = new Date(year + 1, month, day);
        return startOfDay(d);
      },
    },
    // 6b. "[Month] [D]" e.g. "apr 20"
    {
      re: new RegExp(`\\b(${MONTH_PATTERN})\\s+(\\d{1,2})\\b`),
      resolve: (m) => {
        const monthKey = m[1].slice(0, 3);
        const month = MONTH_MAP[monthKey];
        const day = parseInt(m[m.length - 1], 10);
        let year = today.getFullYear();
        let d = new Date(year, month, day);
        if (d < today) d = new Date(year + 1, month, day);
        return startOfDay(d);
      },
    },
    // 7. Standalone weekday e.g. "monday", "fri"
    {
      re: new RegExp(`\\b(${WEEKDAY_PATTERN})\\b`),
      resolve: (m) => {
        const dow = WEEKDAY_MAP[m[1].slice(0, 3)];
        return nextWeekday(dow, today);
      },
    },
  ];

  for (const { re, resolve } of patterns) {
    const m = re.exec(lowerNoTime);
    if (m) {
      resolvedDate = resolve(m);
      dateSpan = [m.index, m.index + m[0].length];
      break;
    }
  }

  // ── 3. Return null if nothing was found ──────────────────────────────────
  if (resolvedDate === null && timeHours === -1) return null;

  // Time-only → use today
  if (resolvedDate === null) resolvedDate = today;

  // "tonight" with no explicit time → default to 20:00
  const tonightMatch = /\btonight\b/.exec(lowerNoTime);
  if (tonightMatch && timeHours === -1) {
    timeHours = 20;
    timeMinutes = 0;
  }

  // ── 4. Build output strings ──────────────────────────────────────────────
  const dueDate = format(resolvedDate, 'yyyy-MM-dd');

  let dueDateTime: string | undefined;
  if (timeHours !== -1) {
    const dt = new Date(
      resolvedDate.getFullYear(),
      resolvedDate.getMonth(),
      resolvedDate.getDate(),
      timeHours,
      timeMinutes
    );
    dueDateTime = dt.toISOString();
  }

  // ── 5. Build cleanTitle ──────────────────────────────────────────────────
  const spans: Array<[number, number]> = [];
  if (dateSpan) spans.push(dateSpan);
  if (timeSpan) spans.push(timeSpan);
  const cleanTitle = removeSpans(raw, spans);

  // Don't return a result if the clean title is empty and only keywords were typed
  // (e.g. just "tomorrow") — still return; caller decides what to do.

  return { cleanTitle, dueDate, dueDateTime };
}
