/**
 * app/(admin)/simulation.tsx
 *
 * Admin route simulation.
 *
 * - Reuses the same Leaflet/WebView map, Balacbac–Town waypoints, OSRM routing
 *   and 4-zone colour scheme as (tabs)/mapscreen.tsx.
 * - A simulated jeep moves along the route using REAL elapsed time
 *   (requestAnimationFrame delta) multiplied by an adjustable speed (1x/2x/5x/10x).
 * - Motion model: acceleration / cruise / braking, with dwell time at each stop.
 * - Optional "sync to live jeep" starts the sim from a real jeep's current
 *   position (reads jeeps/ + jeep_info/ — the same nodes the live map uses).
 * - The simulation is LOCAL ONLY. It never writes to Firebase, so it cannot
 *   pollute the live map, trips, or revenue data.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView,
    ActivityIndicator, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView } from "react-native-webview";
import {
    Play, Pause, RotateCcw, Gauge, Navigation, MapPin,
    Circle, Clock, LocateFixed, Bus, Radio,
} from "lucide-react-native";
import { db, ref, onValue } from "../../services/firebase";
import { useTheme } from "../ThemeContext";

const { height: SCREEN_H } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────────────────────
// TYPES & CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

type Destination = "Town" | "Balacbac";
type SimStatus   = "available" | "full";

interface SimState {
    playing: boolean;
    done: boolean;
    dist: number;        // metres travelled
    total: number;       // route length in metres
    v: number;           // m/s
    dwell: number;       // sim-seconds left at current stop
    stopName: string;    // next stop (or current stop while dwelling)
    stopIdx: number;
    stopCount: number;
    elapsed: number;     // sim-seconds since start
    lat: number | null;
    lng: number | null;
}

interface LiveJeep {
    uid: string;
    destination?: Destination;
    status?: string;
    latitude?: number;
    longitude?: number;
    driverName: string;
    plate: string;
}

const INITIAL_STATE: SimState = {
    playing: false, done: false, dist: 0, total: 0, v: 0, dwell: 0,
    stopName: "—", stopIdx: 0, stopCount: 0, elapsed: 0, lat: null, lng: null,
};

const ROUTES: { dest: Destination; label: string }[] = [
    { dest: "Town",     label: "Balacbac → Town" },
    { dest: "Balacbac", label: "Town → Balacbac" },
];

const SPEEDS = [1, 2, 5, 10];

// Rough average speed incl. acceleration (m/s) — used only for the ETA estimate
const AVG_SPEED_MS = 6.8;
const DWELL_SECONDS = 10;

const fmtClock = (sec: number) => {
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// MAP HTML  (Leaflet — same tiles, waypoints, markers and zone colours as
// mapscreen.tsx; simulation engine runs inside the WebView for smooth motion)
// ─────────────────────────────────────────────────────────────────────────────

const mapHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    body { margin: 0; padding: 0; }
    #map { height: 100vh; width: 100vw; background: #f0f4f0; }
    .jeep-bubble {
      width: 44px; height: 44px;
      background: linear-gradient(145deg,#22c55e,#15803d);
      border: 2.5px solid white; border-radius: 22px;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 3px 10px rgba(21,128,61,0.45);
    }
    .jeep-bubble.full {
      background: linear-gradient(145deg,#f87171,#dc2626) !important;
      box-shadow: 0 3px 10px rgba(220,38,38,0.5) !important;
    }
    .jeep-bubble.stopped { animation: stopPulse 1.2s ease infinite; }
    @keyframes stopPulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.12); } }
    .stop-dot {
      width: 12px; height: 12px; border-radius: 50%;
      background: white; border: 3px solid #15803d;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }
    .stop-tip {
      background: white; border-radius: 10px; padding: 5px 10px;
      font-size: 11px; font-weight: 700; color: #111;
      box-shadow: 0 3px 12px rgba(0,0,0,0.18); white-space: nowrap;
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: false, attributionControl: false, preferCanvas: true })
      .setView([16.4023, 120.5960], 14);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Same corridor as mapscreen.tsx
    var ROUTE_WAYPOINTS_FWD = [
      [16.414019, 120.593455],
      [16.393590, 120.579564],
      [16.388988, 120.575658],
      [16.386876, 120.576439],
      [16.380109, 120.579936],
      [16.378661, 120.580563],
      [16.378759, 120.586049]
    ];
    // Real stop coordinates from constants/routes.ts (POINTS); Balacbac = TIERRA terminal
    var STOP_POINTS_FWD = [
      { name: 'Town',       pt: [16.414019, 120.593455] },
      { name: 'Shell',      pt: [16.393590, 120.579564] },
      { name: 'Junction',   pt: [16.388988, 120.575658] },
      { name: 'Centro',     pt: [16.380109, 120.579936] },
      { name: 'Friendship', pt: [16.378661, 120.580563] },
      { name: 'Balacbac',   pt: [16.378759, 120.586049] }
    ];

    // ── Motion model constants ───────────────────────────────────────────────
    var CRUISE = 6.9;   // m/s  (~25 km/h)
    var ACC    = 1.1;   // m/s^2
    var DECEL  = 1.4;   // m/s^2
    var DWELL  = ${DWELL_SECONDS};     // sim-seconds at each intermediate stop

    // ── State ────────────────────────────────────────────────────────────────
    var coords = [], cum = [], total = 0;
    var stops = [];                 // [{ name, d }]
    var destination = 'Town';
    var loadToken = 0;
    var follow = true;
    var simStatus = 'available';

    var sim = { dist: 0, v: 0, dwell: 0, playing: false, speed: 1,
                elapsed: 0, nextStop: 1, done: false };

    var ghostBorder = null, ghostLine = null;
    var trailBorder = null, trailLine = null;
    var zoneLayers = [];
    var stopMarkers = [];
    var destMarker = null;
    var jeepMarker = null;
    var lastDrawDist = -9999;
    var lastPost = 0;

    function post(obj) {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }

    function haversineM(lat1, lng1, lat2, lng2) {
      var R = 6371000;
      var dLat = (lat2-lat1)*Math.PI/180, dLng = (lng2-lng1)*Math.PI/180;
      var a = Math.sin(dLat/2)*Math.sin(dLat/2)
            + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)*Math.sin(dLng/2);
      return R*2*Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }

    // ── Routing (OSRM, same endpoint as mapscreen.tsx, with fallback) ────────
    function fetchRoute(waypoints, callback) {
      var finished = false;
      var timer = setTimeout(function() {
        if (!finished) { finished = true; callback(null); }
      }, 7000);
      var coordStr = waypoints.map(function(p) { return p[1]+','+p[0]; }).join(';');
      fetch('https://router.project-osrm.org/route/v1/driving/' + coordStr
            + '?overview=full&geometries=geojson&annotations=false')
        .then(function(r) { return r.json(); })
        .then(function(data) {
          if (finished) return;
          finished = true; clearTimeout(timer);
          if (!data.routes || !data.routes[0]) { callback(null); return; }
          callback(data.routes[0].geometry.coordinates.map(function(c) { return [c[1], c[0]]; }));
        })
        .catch(function() {
          if (finished) return;
          finished = true; clearTimeout(timer);
          callback(null);
        });
    }

    function splitByDistance(pts, n) {
      if (!pts || pts.length < 2) return [pts];
      var totalDist = 0, i;
      for (i = 1; i < pts.length; i++) totalDist += haversineM(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1]);
      var segSize = totalDist / n, segments = [], current = [pts[0]], accum = 0, segIdx = 0;
      for (i = 1; i < pts.length; i++) {
        accum += haversineM(pts[i-1][0], pts[i-1][1], pts[i][0], pts[i][1]);
        current.push(pts[i]);
        if (accum >= segSize * (segIdx + 1) && segIdx < n - 1) {
          segments.push(current.slice());
          current = [pts[i]];
          segIdx++;
        }
      }
      if (current.length > 0) segments.push(current);
      while (segments.length < n) segments.push([]);
      return segments;
    }

    function computeCum() {
      cum = [0];
      for (var i = 1; i < coords.length; i++) {
        cum.push(cum[i-1] + haversineM(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]));
      }
      total = cum[cum.length - 1];
    }

    function buildStops(dest) {
      var list = dest === 'Balacbac' ? STOP_POINTS_FWD.slice() : STOP_POINTS_FWD.slice().reverse();
      stops = [];
      var fromIdx = 0;
      list.forEach(function(s, i) {
        var last = i === list.length - 1;
        var bestIdx = coords.length - 1;
        if (i === 0) bestIdx = 0;
        else if (!last) {
          // nearest route vertex at/after the previous stop keeps stops in travel order
          var best = Infinity;
          for (var k = fromIdx; k < coords.length; k++) {
            var dd = haversineM(s.pt[0], s.pt[1], coords[k][0], coords[k][1]);
            if (dd < best) { best = dd; bestIdx = k; }
          }
        }
        fromIdx = bestIdx;
        stops.push({ name: s.name, d: cum[bestIdx] });
      });
    }

    // Largest vertex index with cum[idx] <= d
    function indexAt(d) {
      var lo = 0, hi = cum.length - 1;
      while (lo < hi) {
        var mid = Math.ceil((lo + hi) / 2);
        if (cum[mid] <= d) lo = mid; else hi = mid - 1;
      }
      return lo;
    }

    function pointAt(d) {
      if (!coords.length) return null;
      if (d <= 0) return coords[0];
      if (d >= total) return coords[coords.length - 1];
      var i = indexAt(d);
      var seg = cum[i+1] - cum[i];
      var t = seg > 0 ? (d - cum[i]) / seg : 0;
      return [
        coords[i][0] + (coords[i+1][0] - coords[i][0]) * t,
        coords[i][1] + (coords[i+1][1] - coords[i][1]) * t
      ];
    }

    // ── Drawing ──────────────────────────────────────────────────────────────
    function clearRoute() {
      [ghostBorder, ghostLine, trailBorder, trailLine, destMarker].forEach(function(l) { if (l) map.removeLayer(l); });
      ghostBorder = ghostLine = trailBorder = trailLine = destMarker = null;
      zoneLayers.forEach(function(l) { map.removeLayer(l); }); zoneLayers = [];
      stopMarkers.forEach(function(l) { map.removeLayer(l); }); stopMarkers = [];
      lastDrawDist = -9999;
    }

    function drawStatic() {
      ghostBorder = L.polyline(coords, { color: 'rgba(0,0,0,0.08)', weight: 12, lineCap: 'round', lineJoin: 'round' }).addTo(map);
      ghostLine = L.polyline(coords, { color: 'rgba(160,160,160,0.35)', weight: 6, dashArray: '6 10', lineCap: 'round', lineJoin: 'round' }).addTo(map);

      stops.forEach(function(s) {
        var p = pointAt(s.d);
        var m = L.marker([p[0], p[1]], {
          icon: L.divIcon({ className: '', html: '<div class="stop-dot"></div>', iconSize: [12,12], iconAnchor: [6,6] }),
          zIndexOffset: 300
        }).bindTooltip('<div class="stop-tip">' + s.name + '</div>', { direction: 'top', offset: [0,-8] }).addTo(map);
        stopMarkers.push(m);
      });

      var end = coords[coords.length - 1];
      var destHtml = '<div style="width:38px;height:38px;border-radius:50%;'
        + 'background:linear-gradient(135deg,#15803d,#166534);border:3px solid white;'
        + 'display:flex;align-items:center;justify-content:center;'
        + 'box-shadow:0 4px 16px rgba(21,128,61,0.65),0 0 0 7px rgba(21,128,61,0.18);'
        + 'font-size:17px;line-height:1;">&#127919;</div>';
      destMarker = L.marker([end[0], end[1]], {
        icon: L.divIcon({ className: '', html: destHtml, iconSize: [38,38], iconAnchor: [19,19] }),
        zIndexOffset: 900
      }).addTo(map);
    }

    function drawDynamic(force) {
      if (!coords.length) return;
      if (!force && Math.abs(sim.dist - lastDrawDist) < 8) return;
      lastDrawDist = sim.dist;

      var pos = pointAt(sim.dist);
      var idx = indexAt(sim.dist);

      var travelled = coords.slice(0, idx + 1).concat([pos]);
      if (travelled.length >= 2) {
        if (!trailBorder) {
          trailBorder = L.polyline(travelled, { color: 'rgba(0,0,0,0.10)', weight: 10, lineCap: 'round', lineJoin: 'round' }).addTo(map);
          trailLine = L.polyline(travelled, { color: 'rgba(120,120,120,0.40)', weight: 5, dashArray: '5 9', lineCap: 'round', lineJoin: 'round' }).addTo(map);
        } else {
          trailBorder.setLatLngs(travelled);
          trailLine.setLatLngs(travelled);
        }
      }

      zoneLayers.forEach(function(l) { map.removeLayer(l); });
      zoneLayers = [];
      var remaining = [pos].concat(coords.slice(idx + 1));
      if (remaining.length >= 2) {
        var zc = destination === 'Town'
          ? ['#22c55e', '#eab308', '#f97316', '#ef4444']
          : ['#ef4444', '#f97316', '#eab308', '#22c55e'];
        var zones = splitByDistance(remaining, 4);
        zones.forEach(function(seg, i) {
          if (!seg || seg.length < 2) return;
          var col = zc[Math.min(i, zc.length - 1)];
          zoneLayers.push(L.polyline(seg, { color: 'rgba(255,255,255,0.95)', weight: 16, lineCap: 'round', lineJoin: 'round' }).addTo(map));
          zoneLayers.push(L.polyline(seg, { color: 'rgba(0,0,0,0.18)', weight: 11, lineCap: 'round', lineJoin: 'round' }).addTo(map));
          zoneLayers.push(L.polyline(seg, { color: col, weight: 8, opacity: 0.97, lineCap: 'round', lineJoin: 'round' }).addTo(map));
          zoneLayers.push(L.polyline(seg, { color: 'rgba(255,255,255,0.45)', weight: 3, dashArray: '2 16', lineCap: 'round', lineJoin: 'round' }).addTo(map));
        });
      }
    }

    // ── Jeep marker ──────────────────────────────────────────────────────────
    function jeepSVG() {
      return '<svg width="26" height="24" viewBox="0 0 38 34" fill="none" xmlns="http://www.w3.org/2000/svg">'
        + '<rect x="0" y="4" width="6" height="10" rx="3" fill="rgba(255,255,255,0.82)"/>'
        + '<rect x="32" y="4" width="6" height="10" rx="3" fill="rgba(255,255,255,0.82)"/>'
        + '<rect x="0" y="20" width="6" height="10" rx="3" fill="rgba(255,255,255,0.82)"/>'
        + '<rect x="32" y="20" width="6" height="10" rx="3" fill="rgba(255,255,255,0.82)"/>'
        + '<rect x="5" y="1" width="28" height="32" rx="4" fill="rgba(255,255,255,0.96)"/>'
        + '<rect x="7" y="2" width="24" height="8" rx="2.5" fill="#7dd3fc" opacity="0.88"/>'
        + '<rect x="14" y="0" width="10" height="2.5" rx="1.25" fill="rgba(255,255,255,0.95)"/>'
        + '<rect x="5" y="14" width="28" height="3" fill="rgba(255,255,255,0.38)"/>'
        + '<rect x="8" y="27" width="22" height="5" rx="2" fill="#7dd3fc" opacity="0.55"/>'
        + '<rect x="6" y="29" width="6" height="3" rx="1.5" fill="#fca5a5" opacity="0.95"/>'
        + '<rect x="26" y="29" width="6" height="3" rx="1.5" fill="#fca5a5" opacity="0.95"/>'
        + '</svg>';
    }

    var lastIconKey = '';
    function updateJeepMarker() {
      var p = pointAt(sim.dist);
      if (!p) return;
      var stopped = sim.dwell > 0 || sim.done;
      var key = simStatus + '|' + stopped;
      if (!jeepMarker) {
        jeepMarker = L.marker([p[0], p[1]], { zIndexOffset: 1000 }).addTo(map);
        lastIconKey = '';
      }
      if (key !== lastIconKey) {
        lastIconKey = key;
        jeepMarker.setIcon(L.divIcon({
          className: '',
          html: '<div class="jeep-bubble' + (simStatus === 'full' ? ' full' : '') + (stopped ? ' stopped' : '') + '">' + jeepSVG() + '</div>',
          iconSize: [44,44], iconAnchor: [22,22]
        }));
      }
      jeepMarker.setLatLng([p[0], p[1]]);
      if (follow) map.panTo([p[0], p[1]], { animate: false });
    }

    // ── Simulation engine ────────────────────────────────────────────────────
    function resetSim(startDist) {
      sim.dist = startDist || 0;
      sim.v = 0;
      sim.dwell = 0;
      sim.elapsed = 0;
      sim.done = false;
      sim.playing = false;
      sim.nextStop = stops.length - 1;
      for (var i = 0; i < stops.length; i++) {
        if (stops[i].d > sim.dist + 1) { sim.nextStop = i; break; }
      }
      drawDynamic(true);
      updateJeepMarker();
      postState(true);
    }

    function step(h) {
      if (sim.dwell > 0) {
        sim.dwell -= h; sim.v = 0;
        if (sim.dwell <= 0) { sim.dwell = 0; sim.nextStop++; }
        return;
      }
      var target = stops[sim.nextStop];
      if (!target) { sim.done = true; sim.playing = false; return; }
      var toStop = target.d - sim.dist;

      // Speed we can still brake from: v^2 = 2*a*d  (floor so we never stall)
      var vBrake = Math.sqrt(2 * DECEL * Math.max(toStop, 0)) + 0.6;
      var vMax = Math.min(CRUISE, vBrake);
      if (sim.v < vMax) sim.v = Math.min(vMax, sim.v + ACC * h);
      else sim.v = Math.max(vMax, sim.v - DECEL * h);

      sim.dist += sim.v * h;

      if (target.d - sim.dist <= 1.5) {
        sim.dist = target.d;
        sim.v = 0;
        if (sim.nextStop >= stops.length - 1) {
          sim.done = true; sim.playing = false;
        } else {
          sim.dwell = DWELL;
        }
      }
    }

    function stopLabel() {
      var s = stops[Math.min(sim.nextStop, stops.length - 1)];
      return s ? s.name : '-';
    }

    function postState(force) {
      var now = Date.now();
      if (!force && now - lastPost < 150) return;
      lastPost = now;
      var p = pointAt(sim.dist);
      post({
        type: 'STATE',
        playing: sim.playing, done: sim.done,
        dist: sim.dist, total: total, v: sim.v, dwell: Math.max(0, sim.dwell),
        stopName: stopLabel(), stopIdx: sim.nextStop, stopCount: stops.length,
        elapsed: sim.elapsed,
        lat: p ? p[0] : null, lng: p ? p[1] : null
      });
    }

    var lastTs = null;
    function frame(ts) {
      requestAnimationFrame(frame);
      if (lastTs === null) { lastTs = ts; return; }
      var realDt = Math.max(0, Math.min((ts - lastTs) / 1000, 0.25));
      lastTs = ts;
      if (!sim.playing || !total) return;

      // Real elapsed time x speed multiplier, integrated in <=0.25s sim-steps
      var remain = realDt * sim.speed;
      while (remain > 0 && sim.playing) {
        var h = Math.min(remain, 0.25);
        step(h);
        remain -= h;
      }
      sim.elapsed += realDt * sim.speed;

      drawDynamic(false);
      updateJeepMarker();
      postState(!sim.playing);
    }
    requestAnimationFrame(frame);

    // ── Route loading ────────────────────────────────────────────────────────
    function loadRoute(dest, startLat, startLng) {
      var token = ++loadToken;
      destination = dest;
      sim.playing = false;
      post({ type: 'ROUTE_LOADING' });

      var wp = dest === 'Balacbac' ? ROUTE_WAYPOINTS_FWD.slice() : ROUTE_WAYPOINTS_FWD.slice().reverse();
      fetchRoute(wp, function(c) {
        if (token !== loadToken) return;   // a newer request superseded this one
        var fallback = false;
        if (!c) { c = wp; fallback = true; }

        clearRoute();
        coords = c;
        computeCum();
        buildStops(dest);
        drawStatic();

        var startDist = 0;
        if (startLat !== null && startLat !== undefined) {
          var best = Infinity, bi = 0;
          for (var i = 0; i < coords.length; i++) {
            var d = haversineM(startLat, startLng, coords[i][0], coords[i][1]);
            if (d < best) { best = d; bi = i; }
          }
          startDist = cum[bi];
        }
        resetSim(startDist);
        map.fitBounds(L.polyline(coords).getBounds(), { padding: [50, 50] });
        post({ type: 'ROUTE_READY', total: total, fallback: fallback });
      });
    }

    // ── Messages from React Native ───────────────────────────────────────────
    function handleMessage(event) {
      try {
        var m = JSON.parse(event.data);
        if (m.type === 'SET_ROUTE')  loadRoute(m.destination, m.startLat, m.startLng);
        if (m.type === 'PLAY') {
          if (!total) return;
          if (sim.done) resetSim(0);
          sim.playing = true;
          postState(true);
        }
        if (m.type === 'PAUSE') { sim.playing = false; postState(true); }
        if (m.type === 'RESET') { resetSim(0); if (coords.length) map.fitBounds(L.polyline(coords).getBounds(), { padding: [50, 50] }); }
        if (m.type === 'SET_SPEED') sim.speed = m.speed;
        if (m.type === 'SET_STATUS') { simStatus = m.status; lastIconKey = ''; updateJeepMarker(); }
        if (m.type === 'SET_FOLLOW') {
          follow = !!m.follow;
          if (follow) updateJeepMarker();
          else if (coords.length) map.fitBounds(L.polyline(coords).getBounds(), { padding: [50, 50] });
        }
      } catch (e) { console.error('Message error:', e); }
    }
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage);

    setTimeout(function() { post({ type: 'MAP_READY' }); }, 500);
  </script>
</body>
</html>
`;

// ─────────────────────────────────────────────────────────────────────────────
// MAIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────

export default function AdminSimulation() {
    const { darkMode } = useTheme();
    const webRef = useRef<WebView>(null);

    const [mapReady, setMapReady]       = useState(false);
    const [routeLoading, setRouteLoading] = useState(true);
    const [fallback, setFallback]       = useState(false);
    const [destination, setDestination] = useState<Destination>("Town");
    const [speed, setSpeed]             = useState(1);
    const [status, setStatus]           = useState<SimStatus>("available");
    const [follow, setFollow]           = useState(true);
    const [sim, setSim]                 = useState<SimState>(INITIAL_STATE);
    const [liveJeeps, setLiveJeeps]     = useState<LiveJeep[]>([]);

    const destRef  = useRef<Destination>(destination);
    const speedRef = useRef(speed);
    useEffect(() => { destRef.current = destination; }, [destination]);
    useEffect(() => { speedRef.current = speed; }, [speed]);

    // Theme-aware colours (same pattern as FareManagement.tsx)
    const bg        = darkMode ? "#0a0f1a" : "#f9fafb";
    const headerBg  = darkMode ? "#0f172a" : "#fff";
    const headerBd  = darkMode ? "#1e293b" : "#e5e7eb";
    const titleCol  = darkMode ? "#4ade80" : "#15803d";
    const cardBg    = darkMode ? "#1e293b" : "#fff";
    const border    = darkMode ? "#334155" : "#e5e7eb";
    const textMain  = darkMode ? "#f1f5f9" : "#111827";
    const textMuted = darkMode ? "#94a3b8" : "#6b7280";
    const segBg     = darkMode ? "#0f172a" : "#f3f4f6";

    const send = useCallback((msg: object) => {
        webRef.current?.postMessage(JSON.stringify(msg));
    }, []);

    // ── Live jeeps (read-only; same nodes the live map & dashboard use) ──────
    useEffect(() => {
        let jeeps: Record<string, any> = {};
        let info: Record<string, any>  = {};
        const rebuild = () => {
            setLiveJeeps(
                Object.entries(jeeps)
                    .filter(([_, j]: any) => j.destination && j.latitude && j.longitude)
                    .map(([uid, j]: any) => ({
                        uid,
                        destination: j.destination,
                        status: j.status,
                        latitude: j.latitude,
                        longitude: j.longitude,
                        driverName: info[uid]?.driverName ?? "Unknown Driver",
                        plate: info[uid]?.plate ?? "No plate",
                    }))
            );
        };
        const u1 = onValue(ref(db, "jeeps"), snap => { jeeps = snap.exists() ? snap.val() : {}; rebuild(); });
        const u2 = onValue(ref(db, "jeep_info"), snap => { info = snap.exists() ? snap.val() : {}; rebuild(); });
        return () => { u1(); u2(); };
    }, []);

    // ── WebView messages ─────────────────────────────────────────────────────
    const onMessage = (event: any) => {
        try {
            const m = JSON.parse(event.nativeEvent.data);
            if (m.type === "MAP_READY") {
                setMapReady(true);
                send({ type: "SET_SPEED", speed: speedRef.current });
                send({ type: "SET_ROUTE", destination: destRef.current });
            }
            if (m.type === "ROUTE_LOADING") setRouteLoading(true);
            if (m.type === "ROUTE_READY") {
                setRouteLoading(false);
                setFallback(!!m.fallback);
            }
            if (m.type === "STATE") {
                setSim({
                    playing: m.playing, done: m.done, dist: m.dist, total: m.total,
                    v: m.v, dwell: m.dwell, stopName: m.stopName, stopIdx: m.stopIdx,
                    stopCount: m.stopCount, elapsed: m.elapsed, lat: m.lat, lng: m.lng,
                });
            }
        } catch (e) { console.log("Sim message parse error:", e); }
    };

    // ── Controls ─────────────────────────────────────────────────────────────
    const togglePlay = () => {
        if (routeLoading || !mapReady) return;
        if (sim.playing) { send({ type: "PAUSE" }); setSim(p => ({ ...p, playing: false })); }
        else             { send({ type: "PLAY" });  setSim(p => ({ ...p, playing: true, done: false })); }
    };
    const reset = () => send({ type: "RESET" });
    const changeSpeed = (s: number) => { setSpeed(s); send({ type: "SET_SPEED", speed: s }); };
    const changeRoute = (d: Destination) => {
        if (d === destination && !routeLoading) return;
        setDestination(d);
        setSim(INITIAL_STATE);
        send({ type: "SET_ROUTE", destination: d });
    };
    const changeStatus = (s: SimStatus) => { setStatus(s); send({ type: "SET_STATUS", status: s }); };
    const toggleFollow = () => { const n = !follow; setFollow(n); send({ type: "SET_FOLLOW", follow: n }); };
    const syncToLive = (j: LiveJeep) => {
        if (!j.destination) return;
        setDestination(j.destination);
        setSim(INITIAL_STATE);
        send({ type: "SET_ROUTE", destination: j.destination, startLat: j.latitude, startLng: j.longitude });
    };

    // ── Derived display values ───────────────────────────────────────────────
    const progress = sim.total > 0 ? Math.min(1, sim.dist / sim.total) : 0;
    const kmh      = Math.round(sim.v * 3.6);
    const remainingStops = Math.max(0, sim.stopCount - 1 - sim.stopIdx);
    const etaSec   = sim.total > 0 && !sim.done
        ? (sim.total - sim.dist) / AVG_SPEED_MS + remainingStops * DWELL_SECONDS
        : 0;

    const statusInfo = useMemo(() => {
        if (routeLoading)  return { text: "Loading route…", color: "#d97706", bg: "#fef3c7" };
        if (sim.done)      return { text: `Arrived at ${sim.stopName}`, color: "#2563eb", bg: "#eff6ff" };
        if (sim.playing && sim.dwell > 0)
                           return { text: `Stopped at ${sim.stopName} · ${Math.ceil(sim.dwell)}s`, color: "#d97706", bg: "#fef3c7" };
        if (sim.playing)   return { text: `Running · To ${destination} · ${kmh} km/h`, color: "#15803d", bg: "#f0fdf4" };
        if (sim.dist > 0)  return { text: "Paused", color: "#6b7280", bg: darkMode ? "#334155" : "#f3f4f6" };
        return               { text: "Ready · press Play to start", color: "#6b7280", bg: darkMode ? "#334155" : "#f3f4f6" };
    }, [routeLoading, sim, destination, kmh, darkMode]);

    return (
        <SafeAreaView style={[s.container, { backgroundColor: bg }]}>
            {/* Header */}
            <View style={[s.header, { backgroundColor: headerBg, borderBottomColor: headerBd }]}>
                <View>
                    <Text style={[s.title, { color: titleCol }]}>Simulation</Text>
                    <Text style={[s.sub, { color: textMuted }]}>Local test · does not affect live data</Text>
                </View>
                <View style={s.simBadge}>
                    <Radio color="#7c3aed" size={12} />
                    <Text style={s.simBadgeTxt}>SIM</Text>
                </View>
            </View>

            {/* Map */}
            <View style={s.mapWrap}>
                <WebView
                    ref={webRef}
                    originWhitelist={["*"]}
                    source={{ html: mapHtml }}
                    style={{ flex: 1 }}
                    javaScriptEnabled
                    domStorageEnabled
                    mixedContentMode="always"
                    cacheEnabled={false}
                    onMessage={onMessage}
                    onError={(e) => console.error("Sim WebView error:", e.nativeEvent)}
                />
                {(!mapReady || routeLoading) && (
                    <View style={s.mapLoading}>
                        <ActivityIndicator color="#15803d" />
                        <Text style={s.mapLoadingTxt}>{mapReady ? "Fetching route…" : "Loading map…"}</Text>
                    </View>
                )}
                <TouchableOpacity
                    style={[s.followFab, follow && { backgroundColor: "#15803d" }]}
                    onPress={toggleFollow}
                    activeOpacity={0.85}
                >
                    <LocateFixed color={follow ? "white" : "#15803d"} size={20} />
                </TouchableOpacity>
            </View>

            {/* Control panel */}
            <ScrollView
                style={[s.panel, { backgroundColor: cardBg, borderTopColor: border, maxHeight: SCREEN_H * 0.5 }]}
                contentContainerStyle={{ padding: 16, paddingBottom: 20 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Status strip */}
                <View style={[s.statusStrip, { backgroundColor: statusInfo.bg }]}>
                    <Circle size={10} color={statusInfo.color} fill={statusInfo.color} />
                    <Text style={[s.statusStripTxt, { color: statusInfo.color }]} numberOfLines={1}>{statusInfo.text}</Text>
                </View>

                {/* Progress */}
                <View style={s.progressRow}>
                    <View style={[s.progressTrack, { backgroundColor: segBg }]}>
                        <View style={[s.progressFill, { width: `${progress * 100}%` }]} />
                    </View>
                    <Text style={[s.progressTxt, { color: textMuted }]}>
                        {Math.round(progress * 100)}% · {(sim.dist / 1000).toFixed(2)}/{(sim.total / 1000).toFixed(2)} km
                    </Text>
                </View>

                {/* Stat tiles */}
                <View style={s.statsRow}>
                    <View style={[s.stat, { backgroundColor: darkMode ? "#064e3b" : "#f0fdf4" }]}>
                        <Gauge color="#15803d" size={14} />
                        <Text style={[s.statNum, { color: "#15803d" }]}>{kmh}</Text>
                        <Text style={s.statLbl}>km/h</Text>
                    </View>
                    <View style={[s.stat, { backgroundColor: darkMode ? "#1e3a8a" : "#eff6ff" }]}>
                        <MapPin color="#2563eb" size={14} />
                        <Text style={[s.statNum, { color: "#2563eb", fontSize: 13 }]} numberOfLines={1}>{sim.stopName}</Text>
                        <Text style={s.statLbl}>{sim.done ? "Arrived" : sim.dwell > 0 ? "Stopped" : "Next Stop"}</Text>
                    </View>
                    <View style={[s.stat, { backgroundColor: darkMode ? "#78350f" : "#fefce8" }]}>
                        <Clock color="#d97706" size={14} />
                        <Text style={[s.statNum, { color: "#d97706" }]}>{etaSec > 0 ? fmtClock(etaSec) : "—"}</Text>
                        <Text style={s.statLbl}>ETA</Text>
                    </View>
                    <View style={[s.stat, { backgroundColor: darkMode ? "#064e3b" : "#f0fdf4" }]}>
                        <Navigation color="#15803d" size={14} />
                        <Text style={[s.statNum, { color: "#15803d" }]}>{fmtClock(sim.elapsed)}</Text>
                        <Text style={s.statLbl}>Elapsed</Text>
                    </View>
                </View>

                {sim.lat !== null && sim.lng !== null && (
                    <Text style={[s.coords, { color: textMuted }]}>
                        {sim.lat.toFixed(5)}, {sim.lng.toFixed(5)}
                    </Text>
                )}

                {/* Route selector */}
                <Text style={[s.label, { color: textMuted }]}>ROUTE</Text>
                <View style={[s.seg, { backgroundColor: segBg }]}>
                    {ROUTES.map(r => (
                        <TouchableOpacity
                            key={r.dest}
                            style={[s.segBtn, destination === r.dest && s.segBtnActive]}
                            onPress={() => changeRoute(r.dest)}
                        >
                            <Text style={[s.segTxt, destination === r.dest && s.segTxtActive]}>{r.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Speed control */}
                <Text style={[s.label, { color: textMuted }]}>SPEED</Text>
                <View style={[s.seg, { backgroundColor: segBg }]}>
                    {SPEEDS.map(sp => (
                        <TouchableOpacity
                            key={sp}
                            style={[s.segBtn, speed === sp && s.segBtnActive]}
                            onPress={() => changeSpeed(sp)}
                        >
                            <Text style={[s.segTxt, speed === sp && s.segTxtActive]}>{sp}x</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Simulated seat status (same available/full states as drivers) */}
                <Text style={[s.label, { color: textMuted }]}>JEEP STATUS</Text>
                <View style={s.statusRow}>
                    <TouchableOpacity
                        onPress={() => changeStatus("available")}
                        style={[s.statusBtn, { backgroundColor: darkMode ? "#064e3b" : "#F0FDF4", borderColor: status === "available" ? "#15803d" : border }]}
                    >
                        <Circle size={10} color={status === "available" ? "#10B981" : "#9CA3AF"} fill={status === "available" ? "#10B981" : "#9CA3AF"} />
                        <Text style={[s.statusBtnTxt, { color: status === "available" ? textMain : textMuted }]}>Available</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => changeStatus("full")}
                        style={[s.statusBtn, { backgroundColor: darkMode ? "#7f1d1d" : "#FEF2F2", borderColor: status === "full" ? "#15803d" : border }]}
                    >
                        <Circle size={10} color={status === "full" ? "#EF4444" : "#9CA3AF"} fill={status === "full" ? "#EF4444" : "#9CA3AF"} />
                        <Text style={[s.statusBtnTxt, { color: status === "full" ? textMain : textMuted }]}>Full</Text>
                    </TouchableOpacity>
                </View>

                {/* Playback controls */}
                <View style={s.controlsRow}>
                    <TouchableOpacity style={[s.resetBtn, { backgroundColor: segBg }]} onPress={reset} activeOpacity={0.8}>
                        <RotateCcw color={textMuted} size={18} />
                        <Text style={[s.resetTxt, { color: textMuted }]}>Reset</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[
                            s.playBtn,
                            sim.playing && { backgroundColor: "#d97706" },
                            (routeLoading || !mapReady) && { backgroundColor: "#9ca3af" },
                        ]}
                        onPress={togglePlay}
                        disabled={routeLoading || !mapReady}
                        activeOpacity={0.85}
                    >
                        {sim.playing ? <Pause color="white" size={20} /> : <Play color="white" size={20} />}
                        <Text style={s.playTxt}>
                            {sim.playing ? "Pause" : sim.done ? "Replay" : sim.dist > 0 ? "Resume" : "Play"}
                        </Text>
                    </TouchableOpacity>
                </View>

                {fallback && (
                    <Text style={[s.note, { color: "#d97706" }]}>
                        Routing service unreachable — using straight lines between waypoints.
                    </Text>
                )}

                {/* Sync to a live jeep */}
                {liveJeeps.length > 0 && (
                    <>
                        <Text style={[s.label, { color: textMuted, marginTop: 18 }]}>START FROM A LIVE JEEP</Text>
                        {liveJeeps.map(j => (
                            <TouchableOpacity
                                key={j.uid}
                                style={[s.liveCard, { backgroundColor: darkMode ? "#0f172a" : "#f9fafb", borderColor: border }]}
                                onPress={() => syncToLive(j)}
                                activeOpacity={0.75}
                            >
                                <View style={s.liveIcon}><Bus color="#15803d" size={18} /></View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[s.liveName, { color: textMain }]}>{j.driverName}</Text>
                                    <Text style={[s.liveSub, { color: textMuted }]}>{j.plate} · To {j.destination}</Text>
                                </View>
                                <View style={[s.liveBadge, { backgroundColor: j.status === "full" ? "#fef2f2" : "#dcfce7" }]}>
                                    <Text style={[s.liveBadgeTxt, { color: j.status === "full" ? "#ef4444" : "#15803d" }]}>
                                        {j.status === "full" ? "Full" : "Active"}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container: { flex: 1 },

    header:    { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title:     { fontSize: 22, fontWeight: "900" },
    sub:       { fontSize: 12, marginTop: 2 },
    simBadge:  { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#f5f3ff", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    simBadgeTxt: { color: "#7c3aed", fontWeight: "800", fontSize: 11 },

    mapWrap:       { flex: 1, minHeight: 160 },
    mapLoading:    { position: "absolute", top: 12, left: 12, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "white", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
    mapLoadingTxt: { fontSize: 12, fontWeight: "700", color: "#374151" },
    followFab:     { position: "absolute", top: 12, right: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: "white", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 8 },

    panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderTopWidth: 1, marginTop: -16 },

    statusStrip:    { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12, marginBottom: 12 },
    statusStripTxt: { fontSize: 13, fontWeight: "700", flex: 1 },

    progressRow:   { marginBottom: 14 },
    progressTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
    progressFill:  { height: 8, borderRadius: 4, backgroundColor: "#15803d" },
    progressTxt:   { fontSize: 11, fontWeight: "600", marginTop: 6 },

    statsRow: { flexDirection: "row", gap: 8, marginBottom: 6 },
    stat:     { flex: 1, borderRadius: 12, padding: 10, alignItems: "center", gap: 3 },
    statNum:  { fontSize: 16, fontWeight: "900" },
    statLbl:  { fontSize: 9, fontWeight: "700", color: "#9ca3af", textTransform: "uppercase" },
    coords:   { fontSize: 11, textAlign: "center", marginTop: 4 },

    label: { fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 14, marginBottom: 8 },

    seg:          { flexDirection: "row", borderRadius: 12, padding: 4, gap: 4 },
    segBtn:       { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
    segBtnActive: { backgroundColor: "#15803d" },
    segTxt:       { fontSize: 12, fontWeight: "700", color: "#6b7280" },
    segTxtActive: { color: "white" },

    statusRow:    { flexDirection: "row", gap: 12 },
    statusBtn:    { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12, borderRadius: 14, gap: 8, borderWidth: 2 },
    statusBtnTxt: { fontSize: 14, fontWeight: "700" },

    controlsRow: { flexDirection: "row", gap: 10, marginTop: 18 },
    resetBtn:    { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20 },
    resetTxt:    { fontWeight: "700", fontSize: 14 },
    playBtn:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#15803d", borderRadius: 14, paddingVertical: 16 },
    playTxt:     { color: "white", fontWeight: "800", fontSize: 16 },

    note: { fontSize: 11, marginTop: 10, textAlign: "center", fontWeight: "600" },

    liveCard:     { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 8 },
    liveIcon:     { width: 36, height: 36, borderRadius: 10, backgroundColor: "#f0fdf4", alignItems: "center", justifyContent: "center" },
    liveName:     { fontSize: 14, fontWeight: "700" },
    liveSub:      { fontSize: 11, marginTop: 2 },
    liveBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
    liveBadgeTxt: { fontSize: 11, fontWeight: "700" },
});
