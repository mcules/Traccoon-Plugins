/** Zeigt in drei Feldern, was die Brücke kann — und wo sie zumacht. */
function zeige(id, wert) {
  document.getElementById(id).textContent =
    typeof wert === "string" ? wert : JSON.stringify(wert, null, 2);
}

traccoon.ich().then((d) => zeige("ich", d)).catch((e) => zeige("ich", "Fehler: " + e.message));

traccoon.reihen("number")
  .then((d) => zeige("reihen", d.length ? d : "keine Messreihen vorhanden"))
  .catch((e) => zeige("reihen", "Fehler: " + e.message));

// Standortreihen fordert dieses Plugin gar nicht an — der Wirt muss das abweisen.
traccoon.reihen("location")
  .then((d) => zeige("verboten", "unerwartet durchgelassen: " + JSON.stringify(d)))
  .catch((e) => zeige("verboten", "wie erwartet abgewiesen — " + e.message));
