/** Three fields showing what the bridge can do — and where it says no. */
function show(id, value) {
  document.getElementById(id).textContent =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

traccoon.me().then((d) => show("me", d)).catch((e) => show("me", "Error: " + e.message));

traccoon.series("number")
  .then((d) => show("series", d.length ? d : "no series yet"))
  .catch((e) => show("series", "Error: " + e.message));

// This plugin does not ask for location series at all — the host has to refuse.
traccoon.series("location")
  .then((d) => show("refused", "unexpectedly allowed: " + JSON.stringify(d)))
  .catch((e) => show("refused", "refused as expected — " + e.message));
