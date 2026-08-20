/**
 * The map: location series as a track, the last position as a dot, named places as circles.
 *
 * The plugin knows neither the token nor the API — it asks the host (`traccoon.*`), and what
 * it gets to see is decided by the grant. That is why there is no login and no address in
 * here: when a call is refused, that is an answer, not a failure.
 */
"use strict";

var TILES = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
var ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

// A series without its own colour gets one from this cycle — by its position in the list, so
// the same device keeps its colour across reloads.
var COLOURS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#a855f7", "#06b6d4", "#ec4899"];

var RANGES = [
  { key: "today", label: "Today", hours: null },
  { key: "24h", label: "24 h", hours: 24 },
  { key: "7d", label: "7 d", hours: 24 * 7 },
  { key: "30d", label: "30 d", hours: 24 * 30 },
  { key: "all", label: "All", hours: 0 },
];

var map, tileLayer;
var series = [];              // [{key, name, color, state, …}]
var visible = {};             // key -> bool
var drawn = {};               // key -> {line, marker, points}
var placeCircles = [];
var range = "24h";
var firstView = true;

// ── Helpers ─────────────────────────────────────────────────────────────────

function el(id) { return document.getElementById(id); }

function colourOf(s, i) {
  return s.color || COLOURS[i % COLOURS.length];
}

function span() {
  var now = new Date();
  var entry = RANGES.filter(function (r) { return r.key === range; })[0];
  if (!entry || entry.hours === 0) return {};
  if (entry.hours === null) {
    var start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString() };
  }
  return { from: new Date(now.getTime() - entry.hours * 3600e3).toISOString() };
}

function when(value) {
  if (!value) return "";
  var d = new Date(value);
  return isNaN(d) ? "" : d.toLocaleString();
}

function since(value) {
  if (!value) return "never";
  var min = Math.round((Date.now() - new Date(value).getTime()) / 60000);
  if (min < 1) return "just now";
  if (min < 60) return min + " min ago";
  if (min < 60 * 24) return Math.round(min / 60) + " h ago";
  return Math.round(min / 1440) + " d ago";
}

/** Popup text for a point — only what is actually there. */
function label(s, p) {
  var lines = ["<b>" + s.name + "</b>", when(p.ts)];
  if (p.accuracy != null) lines.push("Accuracy " + Math.round(p.accuracy) + " m");
  if (p.speed != null) lines.push("Speed " + (p.speed * 3.6).toFixed(1) + " km/h");
  if (p.battery != null) lines.push("Battery " + Math.round(p.battery) + " %");
  if (p.source) lines.push("Source " + p.source);
  return lines.join("<br>");
}

// ── Setup ───────────────────────────────────────────────────────────────────

function buildMap() {
  map = L.map("map", { zoomControl: true, attributionControl: true });
  map.setView([51.0, 10.0], 5);
  tileLayer = L.tileLayer(TILES, { attribution: ATTRIBUTION, maxZoom: 19 });
  tileLayer.addTo(map);
}

function rangeButtons() {
  var box = el("ranges");
  box.innerHTML = "";
  RANGES.forEach(function (r) {
    var b = document.createElement("button");
    b.textContent = r.label;
    b.className = r.key === range ? "active" : "";
    b.onclick = function () {
      range = r.key;
      rangeButtons();
      loadAllTracks();
    };
    box.appendChild(b);
  });
}

function sidebar() {
  var box = el("series");
  box.innerHTML = "";
  if (!series.length) {
    box.innerHTML = '<div class="empty">No location series. '
      + 'Create a series of kind "location" in Traccoon.</div>';
    return;
  }
  series.forEach(function (s, i) {
    var b = document.createElement("button");
    b.className = "row" + (visible[s.key] ? "" : " off");
    b.title = visible[s.key] ? "hide" : "show";

    var dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = colourOf(s, i);

    var text = document.createElement("span");
    text.className = "text";
    var name = document.createElement("span");
    name.className = "name";
    name.textContent = s.name || s.key;
    var sub = document.createElement("span");
    sub.className = "sub";
    // Series that are not mine say whose they are — otherwise the list shows "Phone" twice.
    var bits = [since(s.last_at)];
    if (s.state && s.state.battery != null) bits.push(Math.round(s.state.battery) + " %");
    if (!s.own && s.owner) bits.push(s.owner);
    sub.textContent = bits.join(" · ");

    text.appendChild(name);
    text.appendChild(sub);
    b.appendChild(dot);
    b.appendChild(text);
    b.onclick = function () {
      visible[s.key] = !visible[s.key];
      sidebar();
      if (visible[s.key]) loadTrack(s, i);
      else dropTrack(s.key);
    };
    box.appendChild(b);
  });
}

function drawPlaces(places) {
  var box = el("places");
  box.innerHTML = "";
  placeCircles.forEach(function (c) { map.removeLayer(c); });
  placeCircles = [];

  if (!places.length) {
    box.innerHTML = '<div class="empty">–</div>';
    return;
  }
  places.forEach(function (p) {
    var colour = p.color || "#f59e0b";
    var circle = L.circle([p.lat, p.lon], {
      radius: p.radius_m, color: colour, weight: 1, fillColor: colour, fillOpacity: 0.12,
    }).bindPopup("<b>" + p.name + "</b><br>Radius " + p.radius_m + " m"
                 + (p.notify ? "" : "<br>reports nothing"));
    circle.addTo(map);
    placeCircles.push(circle);

    var b = document.createElement("button");
    b.className = "row";
    b.title = "show on the map";
    var dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = colour;
    var text = document.createElement("span");
    text.className = "text";
    text.innerHTML = '<span class="name"></span><span class="sub"></span>';
    text.querySelector(".name").textContent = p.name;
    text.querySelector(".sub").textContent = p.radius_m + " m";
    b.appendChild(dot);
    b.appendChild(text);
    b.onclick = function () { map.setView([p.lat, p.lon], 15); circle.openPopup(); };
    box.appendChild(b);
  });
}

// ── Tracks ──────────────────────────────────────────────────────────────────

function dropTrack(key) {
  var d = drawn[key];
  if (!d) return;
  if (d.line) map.removeLayer(d.line);
  if (d.marker) map.removeLayer(d.marker);
  delete drawn[key];
  buildScrubber();
}

function loadTrack(s, i) {
  var opt = span();
  opt.limit = 5000;
  return traccoon.points(s.key, opt).then(function (answer) {
    dropTrack(s.key);
    if (!visible[s.key]) return;

    var points = (answer.points || []).filter(function (p) {
      return p.lat != null && p.lon != null;
    });
    var colour = colourOf(s, i);
    var coords = points.map(function (p) { return [p.lat, p.lon]; });
    var entry = { points: points, colour: colour, series: s };

    if (coords.length > 1) {
      entry.line = L.polyline(coords, { color: colour, weight: 3, opacity: 0.85 });
      entry.line.addTo(map);
    }
    // The last known spot comes from the series state, not from the points: whoever has not
    // moved for a week has no point at all in "24 h" — and should still show on the map.
    var last = points.length ? points[points.length - 1] : null;
    var spot = last ? [last.lat, last.lon]
      : (s.state && s.state.lat != null ? [s.state.lat, s.state.lon] : null);
    if (spot) {
      entry.marker = L.circleMarker(spot, {
        radius: 7, color: "#fff", weight: 2, fillColor: colour, fillOpacity: 1,
      }).bindPopup(label(s, last || {
        ts: s.last_at, battery: (s.state || {}).battery,
        accuracy: (s.state || {}).accuracy, speed: (s.state || {}).speed,
      }));
      entry.marker.addTo(map);
    }

    drawn[s.key] = entry;
    fitOnce();
    buildScrubber();
  }).catch(function (e) {
    el("status").textContent = s.name + ": " + e.message;
  });
}

function loadAllTracks() {
  var open = series.map(function (s, i) {
    return visible[s.key] ? loadTrack(s, i) : Promise.resolve();
  });
  return Promise.all(open).then(function () {
    var total = Object.keys(drawn).reduce(function (n, k) {
      return n + drawn[k].points.length;
    }, 0);
    el("status").textContent = total + (total === 1 ? " point" : " points");
  });
}

/** Zoom to everything on first load only — afterwards the map must not jump away while
 *  someone is looking at it. */
function fitOnce() {
  if (!firstView) return;
  var all = [];
  Object.keys(drawn).forEach(function (k) {
    drawn[k].points.forEach(function (p) { all.push([p.lat, p.lon]); });
    var m = drawn[k].marker;
    if (m) all.push([m.getLatLng().lat, m.getLatLng().lng]);
  });
  if (!all.length) return;
  map.fitBounds(L.latLngBounds(all), { padding: [40, 40], maxZoom: 16 });
  firstView = false;
}

// ── Scrubber ────────────────────────────────────────────────────────────────

function allStamps() {
  var stamps = [];
  Object.keys(drawn).forEach(function (k) {
    drawn[k].points.forEach(function (p) { if (p.ts) stamps.push(p.ts); });
  });
  return stamps.sort();
}

function buildScrubber() {
  var stamps = allStamps();
  var slider = el("slider");
  if (stamps.length < 2) {
    el("scrubber").className = "hidden";
    return;
  }
  el("scrubber").className = "";
  slider.min = 0;
  slider.max = stamps.length - 1;
  slider.value = stamps.length - 1;
  el("stamp").textContent = when(stamps[stamps.length - 1]);
  slider.oninput = function () {
    var until = stamps[Number(slider.value)];
    el("stamp").textContent = when(until);
    Object.keys(drawn).forEach(function (k) {
      var d = drawn[k];
      if (!d.line) return;
      var coords = d.points.filter(function (p) { return p.ts <= until; })
                           .map(function (p) { return [p.lat, p.lon]; });
      d.line.setLatLngs(coords);
      if (d.marker && coords.length) d.marker.setLatLng(coords[coords.length - 1]);
    });
  };
}

// ── Start ───────────────────────────────────────────────────────────────────

traccoon.me().then(function (me) {
  if (me && me.theme === "light") document.documentElement.setAttribute("data-light", "");
}).catch(function () { /* colours are no reason not to show the map */ });

buildMap();
rangeButtons();

traccoon.live("location").then(function (list) {
  series = list || [];
  series.forEach(function (s) { visible[s.key] = true; });
  sidebar();
  return loadAllTracks();
}).catch(function (e) {
  el("series").innerHTML = '<div class="empty">' + e.message + "</div>";
  el("status").textContent = "no data";
});

traccoon.places().then(drawPlaces).catch(function () {
  el("places").innerHTML = '<div class="empty">–</div>';
});
