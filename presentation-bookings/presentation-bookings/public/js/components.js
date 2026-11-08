// =========================================================
// Pieces of the page that both the lecturer and student views use.
// =========================================================

import { el } from "./ui.js";
import { formatTime, formatDate, toMinutes, normaliseBreaks } from "./time.js";

// The top part of a presentation day card: date, title, times, venue, breaks and notes.
export function sessionInfo(session, slots) {
  const lastSlot = slots[slots.length - 1];
  const endText = lastSlot ? formatTime(lastSlot.end) : session.endTime;

  const details = el("div", { class: "meta tnum" },
    el("span", {}, el("b", { text: formatTime(toMinutes(session.startTime)) + "–" + endText })),
    el("span", {}, "Venue: ", el("b", { text: session.venue || "TBC" })),
    el("span", { text: session.duration + " min each · " + session.gap + " min between" })
  );

  // Add each break, e.g. "Tea break: 10:30–11:00".
  for (const item of normaliseBreaks(session.breaks)) {
    details.append(el("span", {}, item.label + ": ", el("b", { text: formatTime(item.start) + "–" + formatTime(item.end) })));
  }

  return el("div", { class: "session-info" },
    el("div", { class: "session-date", text: formatDate(session.date) }),
    session.title ? el("div", { text: session.title }) : null,
    details,
    session.notes ? el("div", { class: "small muted", text: session.notes }) : null
  );
}
