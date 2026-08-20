/**
 * Die Karte: Standortreihen als Spur, letzte Position als Punkt, benannte Orte als Kreis.
 *
 * Das Plugin kennt weder den Token noch die API — es fragt den Wirt (`traccoon.*`), und was
 * es zu sehen bekommt, entscheidet die Freigabe. Deshalb steht hier auch keine Anmeldung und
 * keine Adresse: Wenn ein Ruf abgewiesen wird, ist das eine Antwort, kein Fehler.
 */
"use strict";

var KACHELN = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
var HERKUNFT = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// Wenn eine Reihe keine eigene Farbe hat, bekommt sie eine aus dieser Folge — nach ihrer
// Stelle in der Liste, damit dasselbe Gerät nach dem Neuladen dieselbe Farbe behält.
var FARBEN = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#a855f7", "#06b6d4", "#ec4899"];

var ZEITRAEUME = [
  { key: "heute", label: "Heute", stunden: null },
  { key: "24h", label: "24 h", stunden: 24 },
  { key: "7t", label: "7 T", stunden: 24 * 7 },
  { key: "30t", label: "30 T", stunden: 24 * 30 },
  { key: "alles", label: "Alles", stunden: 0 },
];

var karte, kachelschicht;
var reihen = [];                 // [{key, name, color, state, …}]
var sichtbar = {};               // key -> bool
var zeichnung = {};              // key -> {linie, marker, punkte}
var ortskreise = [];
var zeitraum = "24h";
var ersteAnsicht = true;

// ── Hilfen ──────────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

function farbeVon(reihe, i) {
  return reihe.color || FARBEN[i % FARBEN.length];
}

function vonBis() {
  var jetzt = new Date();
  var eintrag = ZEITRAEUME.filter(function (z) { return z.key === zeitraum; })[0];
  if (!eintrag || eintrag.stunden === 0) return {};
  if (eintrag.stunden === null) {
    var start = new Date(jetzt);
    start.setHours(0, 0, 0, 0);
    return { von: start.toISOString() };
  }
  return { von: new Date(jetzt.getTime() - eintrag.stunden * 3600e3).toISOString() };
}

function zeit(wert) {
  if (!wert) return "";
  var d = new Date(wert);
  return isNaN(d) ? "" : d.toLocaleString();
}

function seit(wert) {
  if (!wert) return "nie";
  var min = Math.round((Date.now() - new Date(wert).getTime()) / 60000);
  if (min < 1) return "gerade eben";
  if (min < 60) return "vor " + min + " min";
  if (min < 60 * 24) return "vor " + Math.round(min / 60) + " h";
  return "vor " + Math.round(min / 1440) + " T";
}

/** Text für das Popup eines Punktes — nur, was auch dasteht. */
function beschriftung(reihe, p) {
  var zeilen = ["<b>" + reihe.name + "</b>", zeit(p.ts)];
  if (p.accuracy != null) zeilen.push("Genauigkeit " + Math.round(p.accuracy) + " m");
  if (p.speed != null) zeilen.push("Tempo " + (p.speed * 3.6).toFixed(1) + " km/h");
  if (p.battery != null) zeilen.push("Akku " + Math.round(p.battery) + " %");
  if (p.source) zeilen.push("Quelle " + p.source);
  return zeilen.join("<br>");
}

// ── Aufbau ──────────────────────────────────────────────────────────────────

function karteAufbauen() {
  karte = L.map("karte", { zoomControl: true, attributionControl: true });
  karte.setView([51.0, 10.0], 5);
  kachelschicht = L.tileLayer(KACHELN, { attribution: HERKUNFT, maxZoom: 19 });
  kachelschicht.addTo(karte);
}

function zeitraumKnoepfe() {
  var behaelter = el("zeitraum");
  behaelter.innerHTML = "";
  ZEITRAEUME.forEach(function (z) {
    var b = document.createElement("button");
    b.textContent = z.label;
    b.className = z.key === zeitraum ? "aktiv" : "";
    b.onclick = function () {
      zeitraum = z.key;
      zeitraumKnoepfe();
      alleSpurenLaden();
    };
    behaelter.appendChild(b);
  });
}

function seitenleiste() {
  var behaelter = el("reihen");
  behaelter.innerHTML = "";
  if (!reihen.length) {
    behaelter.innerHTML = '<div class="leer">Keine Standortreihen. '
      + 'Lege in Traccoon eine Reihe der Art „Standort“ an.</div>';
    return;
  }
  reihen.forEach(function (r, i) {
    var b = document.createElement("button");
    b.className = "zeile" + (sichtbar[r.key] ? "" : " aus");
    b.title = sichtbar[r.key] ? "ausblenden" : "einblenden";

    var punkt = document.createElement("span");
    punkt.className = "punkt";
    punkt.style.background = farbeVon(r, i);

    var text = document.createElement("span");
    text.className = "text";
    var name = document.createElement("span");
    name.className = "name";
    name.textContent = r.name || r.key;
    var unten = document.createElement("span");
    unten.className = "unten";
    // Fremde Reihen sagen, wem sie gehören — sonst steht da zweimal „Handy“.
    var teile = [seit(r.last_at)];
    if (r.state && r.state.battery != null) teile.push(Math.round(r.state.battery) + " %");
    if (!r.own && r.owner) teile.push(r.owner);
    unten.textContent = teile.join(" · ");

    text.appendChild(name);
    text.appendChild(unten);
    b.appendChild(punkt);
    b.appendChild(text);
    b.onclick = function () {
      sichtbar[r.key] = !sichtbar[r.key];
      seitenleiste();
      if (sichtbar[r.key]) spurLaden(r, i);
      else spurEntfernen(r.key);
    };
    behaelter.appendChild(b);
  });
}

function orteZeichnen(orte) {
  var behaelter = el("orte");
  behaelter.innerHTML = "";
  ortskreise.forEach(function (k) { karte.removeLayer(k); });
  ortskreise = [];

  if (!orte.length) {
    behaelter.innerHTML = '<div class="leer">–</div>';
    return;
  }
  orte.forEach(function (o) {
    var farbe = o.color || "#f59e0b";
    var kreis = L.circle([o.lat, o.lon], {
      radius: o.radius_m, color: farbe, weight: 1, fillColor: farbe, fillOpacity: 0.12,
    }).bindPopup("<b>" + o.name + "</b><br>Radius " + o.radius_m + " m"
                 + (o.notify ? "" : "<br>meldet nichts"));
    kreis.addTo(karte);
    ortskreise.push(kreis);

    var b = document.createElement("button");
    b.className = "zeile";
    b.title = "auf der Karte zeigen";
    var punkt = document.createElement("span");
    punkt.className = "punkt";
    punkt.style.background = farbe;
    var text = document.createElement("span");
    text.className = "text";
    text.innerHTML = '<span class="name"></span><span class="unten"></span>';
    text.querySelector(".name").textContent = o.name;
    text.querySelector(".unten").textContent = o.radius_m + " m";
    b.appendChild(punkt);
    b.appendChild(text);
    b.onclick = function () { karte.setView([o.lat, o.lon], 15); kreis.openPopup(); };
    behaelter.appendChild(b);
  });
}

// ── Spuren ──────────────────────────────────────────────────────────────────

function spurEntfernen(key) {
  var z = zeichnung[key];
  if (!z) return;
  if (z.linie) karte.removeLayer(z.linie);
  if (z.marker) karte.removeLayer(z.marker);
  delete zeichnung[key];
  schieberAufbauen();
}

function spurLaden(reihe, i) {
  var spanne = vonBis();
  spanne.grenze = 5000;
  return traccoon.punkte(reihe.key, spanne).then(function (antwort) {
    spurEntfernen(reihe.key);
    if (!sichtbar[reihe.key]) return;

    var punkte = (antwort.points || []).filter(function (p) {
      return p.lat != null && p.lon != null;
    });
    var farbe = farbeVon(reihe, i);
    var koord = punkte.map(function (p) { return [p.lat, p.lon]; });
    var eintrag = { punkte: punkte, farbe: farbe, reihe: reihe };

    if (koord.length > 1) {
      eintrag.linie = L.polyline(koord, { color: farbe, weight: 3, opacity: 0.85 });
      eintrag.linie.addTo(karte);
    }
    // Die letzte bekannte Stelle kommt aus dem Stand der Reihe, nicht aus den Punkten: Wer
    // sich seit einer Woche nicht bewegt hat, hat im Zeitraum „24 h“ gar keinen Punkt — soll
    // aber trotzdem auf der Karte stehen.
    var letzter = punkte.length ? punkte[punkte.length - 1] : null;
    var stelle = letzter ? [letzter.lat, letzter.lon]
      : (reihe.state && reihe.state.lat != null ? [reihe.state.lat, reihe.state.lon] : null);
    if (stelle) {
      eintrag.marker = L.circleMarker(stelle, {
        radius: 7, color: "#fff", weight: 2, fillColor: farbe, fillOpacity: 1,
      }).bindPopup(beschriftung(reihe, letzter || {
        ts: reihe.last_at, battery: (reihe.state || {}).battery,
        accuracy: (reihe.state || {}).accuracy, speed: (reihe.state || {}).speed,
      }));
      eintrag.marker.addTo(karte);
    }

    zeichnung[reihe.key] = eintrag;
    einpassen();
    schieberAufbauen();
  }).catch(function (e) {
    el("stand").textContent = reihe.name + ": " + e.message;
  });
}

function alleSpurenLaden() {
  var offen = reihen.map(function (r, i) {
    return sichtbar[r.key] ? spurLaden(r, i) : Promise.resolve();
  });
  return Promise.all(offen).then(function () {
    var summe = Object.keys(zeichnung).reduce(function (n, k) {
      return n + zeichnung[k].punkte.length;
    }, 0);
    el("stand").textContent = summe + (summe === 1 ? " Punkt" : " Punkte");
  });
}

/** Beim ersten Laden auf alles zoomen — danach nicht mehr, sonst springt die Karte weg,
 *  während man hineinschaut. */
function einpassen() {
  if (!ersteAnsicht) return;
  var alle = [];
  Object.keys(zeichnung).forEach(function (k) {
    zeichnung[k].punkte.forEach(function (p) { alle.push([p.lat, p.lon]); });
    var m = zeichnung[k].marker;
    if (m) alle.push([m.getLatLng().lat, m.getLatLng().lng]);
  });
  if (!alle.length) return;
  karte.fitBounds(L.latLngBounds(alle), { padding: [40, 40], maxZoom: 16 });
  ersteAnsicht = false;
}

// ── Zeitschieber ────────────────────────────────────────────────────────────

function alleZeitpunkte() {
  var zeiten = [];
  Object.keys(zeichnung).forEach(function (k) {
    zeichnung[k].punkte.forEach(function (p) { if (p.ts) zeiten.push(p.ts); });
  });
  return zeiten.sort();
}

function schieberAufbauen() {
  var zeiten = alleZeitpunkte();
  var regler = el("zeitregler");
  if (zeiten.length < 2) {
    el("schieber").className = "versteckt";
    return;
  }
  el("schieber").className = "";
  regler.min = 0;
  regler.max = zeiten.length - 1;
  regler.value = zeiten.length - 1;
  el("zeitmarke").textContent = zeit(zeiten[zeiten.length - 1]);
  regler.oninput = function () {
    var bis = zeiten[Number(regler.value)];
    el("zeitmarke").textContent = zeit(bis);
    Object.keys(zeichnung).forEach(function (k) {
      var z = zeichnung[k];
      if (!z.linie) return;
      var koord = z.punkte.filter(function (p) { return p.ts <= bis; })
                          .map(function (p) { return [p.lat, p.lon]; });
      z.linie.setLatLngs(koord);
      if (z.marker && koord.length) z.marker.setLatLng(koord[koord.length - 1]);
    });
  };
}

// ── Start ───────────────────────────────────────────────────────────────────

traccoon.ich().then(function (ich) {
  if (ich && ich.theme === "light") document.documentElement.setAttribute("data-hell", "");
}).catch(function () { /* Farben sind kein Grund, die Karte nicht zu zeigen. */ });

karteAufbauen();
zeitraumKnoepfe();

traccoon.live("location").then(function (liste) {
  reihen = liste || [];
  reihen.forEach(function (r) { sichtbar[r.key] = true; });
  seitenleiste();
  return alleSpurenLaden();
}).catch(function (e) {
  el("reihen").innerHTML = '<div class="leer">' + e.message + "</div>";
  el("stand").textContent = "keine Daten";
});

traccoon.orte().then(orteZeichnen).catch(function () {
  el("orte").innerHTML = '<div class="leer">–</div>';
});
