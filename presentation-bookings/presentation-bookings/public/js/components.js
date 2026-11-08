// =========================================================
// Pieces of the page that both the lecturer and student views use.
// =========================================================

import { el } from "./ui.js";
import { presentationKey } from "./state.js";
import { formatTime, formatDate, toMinutes, normaliseBreaks } from "./time.js";

// Remembers which presentation dropdowns the person has opened or closed themselves,
// so their choice stays when the page redraws.
const openGroups = new Map(); // presentation key -> true (open) / false (closed)

// Puts presentation days into groups, one group per presentation name.
// Returns [{ key, name, sessions: [...] }] in the same order as the days given.
export function groupByPresentation(sessions) {
  const groups = new Map();

  for (const session of sessions) {
    const key = presentationKey(session);
    if (!groups.has(key)) {
      const name = String(session.title || "").trim() || "Untitled presentation";
      groups.set(key, { key: key, name: name, sessions: [] });
    }
    groups.get(key).sessions.push(session);
  }

  return [...groups.values()];
}

// A dropdown for one presentation.
//   group:         from groupByPresentation()
//   summaryItems:  what to show next to the name (e.g. "3 booked", "9 available")
//   content:       what's inside when it's opened (the day cards)
//   openByDefault: whether it starts open the first time it's shown
export function presentationGroup(group, summaryItems, content, openByDefault) {
  const details = el("details", { class: "group" });

  // Use the person's own choice if they've clicked it before, otherwise the default.
  if (openGroups.has(group.key)) {
    details.open = openGroups.get(group.key);
  } else {
    details.open = openByDefault;
  }

  const summary = el("summary", { class: "group-summary" },
    el("span", { class: "group-name", text: group.name }),
    el("span", { class: "group-meta" }, summaryItems)
  );

  // Clicking the name opens or closes it; remember which way it will end up.
  summary.addEventListener("click", () => {
    openGroups.set(group.key, !details.open);
  });

  details.append(summary, el("div", { class: "group-body" }, content));
  return details;
}

// The top part of a presentation day card: date, times, venue, breaks and notes.
// The presentation name is left out, because the dropdown above already shows it.
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
    details,
    session.notes ? el("div", { class: "small muted", text: session.notes }) : null
  );
}