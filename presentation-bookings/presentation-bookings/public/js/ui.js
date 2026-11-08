// =========================================================
// Small helpers for building and updating the page.
// =========================================================

// Shortcut for document.getElementById.
export function $(id) {
  return document.getElementById(id);
}

// Creates an HTML element.
//   el("button", { class: "primary", onclick: save }, "Save")
// Attributes starting with "on" become event listeners, and "text" sets the text.
export function el(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);

  for (const [name, value] of Object.entries(attributes)) {
    if (name === "class") {
      element.className = value;
    } else if (name === "text") {
      element.textContent = value;
    } else if (name.startsWith("on")) {
      element.addEventListener(name.slice(2), value);
    } else if (value === true) {
      element.setAttribute(name, "");
    } else if (value !== false && value !== null && value !== undefined) {
      element.setAttribute(name, value);
    }
  }

  for (const child of children.flat()) {
    if (child === null || child === undefined) {
      continue;
    }
    if (child.nodeType) {
      element.append(child);
    } else {
      element.append(document.createTextNode(String(child)));
    }
  }

  return element;
}

// Shows a short message at the bottom of the screen for a few seconds.
let toastTimer = null;
export function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 3200);
}

// Shows a message in the banner at the top. Pass null to hide it.
// kind is "warn", "bad" or "ok".
export function setStatus(message, kind = "warn") {
  const banner = $("status");
  if (!message) {
    banner.classList.add("hidden");
    return;
  }
  banner.className = "banner " + kind;
  banner.textContent = message;
}

// Opens the shared pop-up and waits for Yes (true) or Cancel (false).
function openConfirmDialog(title, bodyElements, confirmLabel, cancelLabel) {
  return new Promise((resolve) => {
    const dialog = $("confirm-dialog");
    const form = $("confirm-form");
    const cancelButton = $("confirm-no");

    $("confirm-title").textContent = title;
    $("confirm-body").replaceChildren(...bodyElements);
    $("confirm-yes").textContent = confirmLabel;
    cancelButton.textContent = cancelLabel;

    function finish(result) {
      form.removeEventListener("submit", onConfirm);
      cancelButton.removeEventListener("click", onCancel);
      dialog.removeEventListener("cancel", onCancel);
      dialog.close();
      resolve(result);
    }

    function onConfirm(event) {
      event.preventDefault();
      finish(true);
    }

    function onCancel() {
      finish(false);
    }

    form.addEventListener("submit", onConfirm);
    cancelButton.addEventListener("click", onCancel);
    dialog.addEventListener("cancel", onCancel); // Escape key

    dialog.showModal();
  });
}

// Asks "are you sure?" and returns true or false.
export function askConfirm(title, message, confirmLabel = "Yes") {
  return openConfirmDialog(title, [el("p", { text: message })], confirmLabel, "Keep it");
}

// Asks for a line of text and returns it, or null if cancelled.
export async function askForText(title, label, currentValue, confirmLabel = "Save") {
  const input = el("input", { id: "dialog-text", type: "text", value: currentValue || "", maxlength: "120" });
  const field = el("div", { class: "field full" }, el("label", { for: "dialog-text", text: label }), input);

  const dialogPromise = openConfirmDialog(title, [field], confirmLabel, "Cancel");
  input.focus();

  const confirmed = await dialogPromise;
  if (!confirmed) {
    return null;
  }
  return input.value.trim();
}

// Turns a Firebase error into a sentence people can understand.
export function friendlyError(error) {
  const code = (error && error.code) || "";

  if (code === "permission-denied") {
    return "You don't have permission to do that. Only the lecturer can change presentation days, and students can only change their own booking.";
  }
  if (code === "resource-exhausted") {
    return "The database has reached its free daily limit. Try again tomorrow.";
  }
  if (code === "unavailable") {
    return "Can't reach the database. Check your internet connection and try again.";
  }
  return "That didn't save. Check your connection and try again.";
}
