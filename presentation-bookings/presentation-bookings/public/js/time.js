// =========================================================
// Date and time helpers, and the maths that builds the slots.
// =========================================================

// Turns "09:30" into minutes after midnight (570).
export function toMinutes(timeText) {
  const parts = String(timeText || "").split(":").map(Number);
  return parts[0] * 60 + parts[1];
}

// Turns minutes after midnight (570) into "09:30".
export function formatTime(minutes) {
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mins = String(minutes % 60).padStart(2, "0");
  return hours + ":" + mins;
}

// Returns a date as "YYYY-MM-DD", a number of days from today (0 = today).
export function dateFromToday(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  // Shift to local time so the date is right in South Africa (and anywhere else).
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

// Today's date as "YYYY-MM-DD".
export function todayISO() {
  return dateFromToday(0);
}

// "2026-11-16" -> "Monday, 16 November 2026"
export function formatDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

// "2026-11-16" -> "16 Nov"
export function formatShortDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

// Converts saved breaks ({ label, start: "10:30", end: "11:00" }) into minutes,
// drops any that don't make sense, and sorts them by start time.
export function normaliseBreaks(breaks) {
  if (!Array.isArray(breaks)) {
    return [];
  }

  const result = [];
  for (const item of breaks) {
    const start = toMinutes(item.start);
    const end = toMinutes(item.end);
    if (!isNaN(start) && !isNaN(end) && end > start) {
      result.push({ label: item.label || "Break", start: start, end: end });
    }
  }

  result.sort((a, b) => a.start - b.start);
  return result;
}

// Works out every presentation slot in a day.
// Each slot is { index, start, end } in minutes after midnight.
//   startTime / endTime: "09:00" / "12:00"
//   duration: length of each presentation in minutes
//   gap: changeover time between presentations in minutes
//   breaks: list of break periods where no presentation may happen
export function buildSlots(startTime, endTime, duration, gap, breaks) {
  const slots = [];
  const dayEnd = toMinutes(endTime);
  let time = toMinutes(startTime);
  duration = Number(duration);
  gap = Number(gap);

  // Stop early if any of the numbers are invalid.
  if (!(duration > 0) || !(gap >= 0) || isNaN(time) || isNaN(dayEnd)) {
    return slots;
  }

  const breakList = normaliseBreaks(breaks);
  const MAX_SLOTS = 200; // safety limit

  while (slots.length < MAX_SLOTS) {
    // If this slot would run into a break, move it to straight after the break.
    let moved = true;
    while (moved) {
      moved = false;
      for (const item of breakList) {
        const overlaps = time < item.end && time + duration > item.start;
        if (overlaps) {
          time = item.end;
          moved = true;
        }
      }
    }

    // Stop when the next presentation would finish after the day ends.
    if (time + duration > dayEnd) {
      break;
    }

    slots.push({ index: slots.length, start: time, end: time + duration });
    time = time + duration + gap;
  }

  return slots;
}

// Shortcut: the slots for a saved presentation day.
export function slotsForSession(session) {
  return buildSlots(session.startTime, session.endTime, session.duration, session.gap, session.breaks);
}

// The breaks of a presentation day that start between two times (in minutes).
export function breaksBetween(session, from, to) {
  return normaliseBreaks(session.breaks).filter((item) => item.start >= from && item.start < to);
}
