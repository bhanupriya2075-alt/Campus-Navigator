// frontend/app.js
// Hybrid indoor navigation using your DB locations (lat/lon + floor).
// - Loads /api/locations
// - Builds graph by connecting nearby nodes on same floor
// - Supports QR params (?start=ROOM or ?lat=...&lon=...)
// - A* pathfinding, live updates, voice guidance
// - Room names shown as map labels (no markers except user & destination)

let map, userMarker, destMarker, routeLine;
let NODES = {};           // { room_name: {lat, lon, floor, desc, label} }
let GRAPH = {};           // adjacency list {nodeName: [neighborNames]}
let currentFloor = 0;
let currentLocation = null; // [lat, lon]
let destination = null;      // {name, lat, lon, floor}
let watchId = null;
let lastSpoken = "";
const VOICE_LANG = 'en-IN';
const CONNECT_DIST_M = 20; // threshold in meters to auto connect nodes on same floor

// ---------- Utility: haversine distance (meters) ----------
function haversine(aLat, aLon, bLat, bLon) {
  const R = 6371e3;
  const φ1 = aLat * Math.PI/180;
  const φ2 = bLat * Math.PI/180;
  const Δφ = (bLat - aLat) * Math.PI/180;
  const Δλ = (bLon - aLon) * Math.PI/180;
  const aa = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1-aa));
  return R * c;
}

// ---------- Load locations from backend DB ----------
async function loadLocationsFromDB() {
  try {
    const res = await fetch('/api/locations');
    if (!res.ok) throw new Error('Failed to load locations');
    const data = await res.json();
    NODES = {};
    data.forEach(row => {
      const lat = parseFloat(row.latitude);
      const lon = parseFloat(row.longitude);
      const floor = parseInt(row.floor_number || row.floor || 0, 10);
      NODES[row.room_name] = {
        lat, lon, floor,
        description: row.description || '',
        dbId: row.id || null
      };
    });
    console.log('Loaded nodes from DB:', NODES);
  } catch (err) {
    console.error('Error loading locations:', err);
    alert('Failed to load locations from server.');
  }
}

// ---------- Build GRAPH automatically ----------
function buildGraph(thresholdMeters = CONNECT_DIST_M) {
  GRAPH = {};
  const names = Object.keys(NODES);
  for (let i=0;i<names.length;i++){
    const a = names[i];
    GRAPH[a] = GRAPH[a] || [];
    for (let j=0;j<names.length;j++){
      if (i===j) continue;
      const b = names[j];
      if (NODES[a].floor !== NODES[b].floor) continue;
      const d = haversine(NODES[a].lat, NODES[a].lon, NODES[b].lat, NODES[b].lon);
      if (d <= thresholdMeters) {
        GRAPH[a].push(b);
      }
    }
  }
  console.log('Graph built (connections):', GRAPH);
}

// ---------- Map init ----------
async function init() {
  await loadLocationsFromDB();
  buildGraph();

  map = L.map('map').setView([12.30402, 76.7118], 19);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 22, attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // optional: overlay building outline
  fetch('map.geojson').then(r => r.ok ? r.json() : null)
  .then(geojson => {
    if (geojson) L.geoJSON(geojson, { style:{color:'#0066cc', weight:2, fillOpacity:0.12} }).addTo(map);
  }).catch(()=>{});

  // create labels instead of markers
  for (const [name, info] of Object.entries(NODES)) {
    const label = L.marker([info.lat, info.lon], {
      icon: L.divIcon({
        className: 'room-label',
        html: `<b>${name}</b>`,
        iconSize: [60, 20]
      })
    });
    info.label = label;
    if (info.floor === currentFloor) label.addTo(map);
  }

  handleUrlParams();
  startWatchPosition();


  /* -----------------------------------------------------
       ADMIN PANEL BUTTON (added without modifying anything)
  ------------------------------------------------------*/
  const adminBtn = L.control({ position: "topright" });

  adminBtn.onAdd = function () {
    const div = L.DomUtil.create("div", "admin-btn");
    div.innerHTML = `
      <button id="openAdminBtn"
        style="
          padding:8px 12px;
          background:#ff8800;
          color:white;
          font-weight:600;
          border:none;
          border-radius:8px;
          cursor:pointer;
          box-shadow:0 2px 6px rgba(0,0,0,0.2);
        "
      >
        Admin Panel
      </button>
    `;

    // Prevent map dragging when clicking
    L.DomEvent.disableClickPropagation(div);
    return div;
  };

  adminBtn.addTo(map);

  document.addEventListener("click", e => {
    if (e.target.id === "openAdminBtn") {
      window.location.href = "/admin";  // your admin panel route
    }
  });
}

// ---------- handle URL params (QR) ----------
function handleUrlParams() {
  const params = new URLSearchParams(window.location.search);
  const dataParam = params.get('data');

  if (dataParam) {
    try {
      const decoded = JSON.parse(decodeURIComponent(dataParam));
      if (decoded.lat && decoded.lon) {
        setCurrentLocation([decoded.lat, decoded.lon], `QR: ${decoded.id || 'Unknown'}`);
        return;
      }
    } catch (e) {
      console.error('Failed to parse QR data:', e);
    }
  }

  const startName = params.get('start');
  const qlat = parseFloat(params.get('lat'));
  const qlon = parseFloat(params.get('lon'));

  if (startName && NODES[startName]) {
    const n = NODES[startName];
    setCurrentLocation([n.lat, n.lon], `QR start: ${startName}`);
    currentFloor = n.floor;
    showFloor(currentFloor);
  } else if (!isNaN(qlat) && !isNaN(qlon)) {
    setCurrentLocation([qlat, qlon], 'QR coords');
  } else {
    document.getElementById('gpsStatus').innerText = 'Waiting for GPS... or scan QR';
  }
}

// ---------- set current location ----------
function setCurrentLocation([lat,lon], src='') {
  currentLocation = [lat, lon];
  if (userMarker) userMarker.setLatLng(currentLocation);
  else userMarker = L.marker(currentLocation, { title:'You', icon: L.icon({iconUrl:'https://cdn-icons-png.flaticon.com/512/64/64113.png', iconSize:[28,28]}) })
    .addTo(map)
    .bindPopup('You are here');
  map.setView(currentLocation, 19);
  document.getElementById('gpsStatus').innerText =
    (src ? src + ' - ' : '') + `Lat ${lat.toFixed(6)}, Lon ${lon.toFixed(6)}`;
}

// ---------- Floor UI ----------
function switchFloor(f) {
  currentFloor = f;
  document.querySelectorAll('.floor-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.floor,10)===f)
  );
  showFloor(f);
}

function showFloor(f) {
  for (const [name, info] of Object.entries(NODES)) {
    if (info.label) {
      if (info.floor === f) {
        if (!map.hasLayer(info.label)) info.label.addTo(map);
      } else {
        if (map.hasLayer(info.label)) map.removeLayer(info.label);
      }
    }
  }
}

// ---------- Search ----------
function onSearch() { searchRoom(document.getElementById('searchBox').value.trim()); }

async function searchRoom(name) {
  if (!name) return alert('Enter a room name.');
  if (NODES[name]) {
    const target = { name, lat:NODES[name].lat, lon:NODES[name].lon, floor:NODES[name].floor };
    onFoundDestination(target);
    return;
  }
  try {
    const res = await fetch(`/api/locations/search?room_name=${encodeURIComponent(name)}`);
    if (!res.ok) return alert('Room not found');
    const row = await res.json();
    const target = {
      name: row.room_name || name,
      lat: parseFloat(row.latitude),
      lon: parseFloat(row.longitude),
      floor: parseInt(row.floor_number||row.floor||0,10)
    };
    onFoundDestination(target);
  } catch {
    alert('Search failed');
  }
}

// ---------- Destination handling ----------
function onFoundDestination(target) {
  destination = target;
  if (destination.floor !== undefined) {
    currentFloor = destination.floor;
    showFloor(currentFloor);
  }
  if (destMarker) map.removeLayer(destMarker);
  destMarker = L.marker([destination.lat, destination.lon], {
    title: destination.name,
    icon: L.icon({iconUrl:'https://cdn-icons-png.flaticon.com/512/854/854878.png', iconSize:[30,30]})
  }).addTo(map).bindPopup(destination.name).openPopup();

  if (!currentLocation) {
    map.setView([destination.lat, destination.lon], 19);
    document.getElementById('guidanceText').innerText = `Destination ${destination.name} (waiting for your position)`;
    return;
  }
  computeAndShowRoute();
}

// ---------- Find nearest node ----------
function findNearestNode(lat, lon, floorHint=null) {
  let nearest=null, minD=Infinity;
  for (const [name, info] of Object.entries(NODES)) {
    if (floorHint !== null && info.floor !== floorHint) continue;
    const d=haversine(lat,lon,info.lat,info.lon);
    if (d<minD){minD=d;nearest=name;}
  }
  if (!nearest) {
    for (const [name, info] of Object.entries(NODES)) {
      const d=haversine(lat,lon,info.lat,info.lon);
      if (d<minD){minD=d;nearest=name;}
    }
  }
  return nearest;
}

// ---------- Floor detection ----------
function detectCurrentFloor(lat, lon) {
  let nearest=null, minD=Infinity, floorGuess=0;
  for (const [name, info] of Object.entries(NODES)) {
    const d = haversine(lat, lon, info.lat, info.lon);
    if (d < minD) {
      minD = d;
      nearest = name;
      floorGuess = info.floor;
    }
  }
  return floorGuess;
}

// ---------- Pathfinding ----------
function heuristic(aName,bName){
  const a=NODES[aName],b=NODES[bName];
  return haversine(a.lat,a.lon,b.lat,b.lon);
}
function findPathAStar(startName,goalName){
  const open=new Set([startName]);
  const cameFrom={},gScore={},fScore={};
  for(const n of Object.keys(GRAPH)){gScore[n]=Infinity;fScore[n]=Infinity;}
  gScore[startName]=0;fScore[startName]=heuristic(startName,goalName);
  while(open.size>0){
    let current=null,minF=Infinity;
    open.forEach(n=>{if(fScore[n]<minF){minF=fScore[n];current=n;}});
    if(current===goalName){
      const path=[current];
      while(cameFrom[current]){current=cameFrom[current];path.unshift(current);}
      return path;
    }
    open.delete(current);
    for(const neigh of (GRAPH[current]||[])){
      const tentative=gScore[current]+haversine(NODES[current].lat,NODES[current].lon,NODES[neigh].lat,NODES[neigh].lon);
      if(tentative<gScore[neigh]){
        cameFrom[neigh]=current;
        gScore[neigh]=tentative;
        fScore[neigh]=tentative+heuristic(neigh,goalName);
        open.add(neigh);
      }
    }
  }
  return [];
}

// ---------- Compute & display route (includes floor guidance) ----------
// ---------- Compute & display route (enhanced with turn-by-turn + multi-floor) ----------
function computeAndShowRoute() {
  if (!currentLocation || !destination) return;
  const startNode = findNearestNode(currentLocation[0], currentLocation[1], currentFloor);
  const endNode = findNearestNode(destination.lat, destination.lon, destination.floor);
  if (!startNode || !endNode) return alert('Could not find nearest nodes for routing');

  const userFloor = detectCurrentFloor(currentLocation[0], currentLocation[1]);
  const destFloor = destination.floor;

  // --- Multi-floor logic ---
  if (userFloor !== destFloor) {
    const direction = destFloor > userFloor ? 'up' : 'down';
    const msg = `Your destination is on floor ${destFloor}. Please go ${direction} using the nearest stairs.`;
    document.getElementById('guidanceText').innerText = msg;
    speakText(msg);
    currentFloor = userFloor;
    showFloor(currentFloor);
    return;
  }

  // --- Same floor: compute A* route ---
  const path = findPathAStar(startNode, endNode);
  if (!path || path.length === 0) {
    drawPolyline([currentLocation, [destination.lat, destination.lon]]);
    speakText('No indoor route found, showing straight line.');
    document.getElementById('guidanceText').innerText = 'No indoor route found; showing direct line.';
    return;
  }

  // Build full coordinates
  const latlngs = [currentLocation];
  path.forEach(n => latlngs.push([NODES[n].lat, NODES[n].lon]));
  latlngs.push([destination.lat, destination.lon]);
  drawPolyline(latlngs);

  // Generate and speak guidance
  const guidanceSteps = generateTurnByTurn(latlngs);
  let guideText = `Route to ${destination.name}: ${guidanceSteps.join(' → ')}`;
  document.getElementById('guidanceText').innerText = guideText;
  speakText(guideText);
}

// ---------- Generate turn-by-turn instructions ----------
function generateTurnByTurn(latlngs) {
  const steps = [];
  if (latlngs.length < 3) return ['Go straight to your destination'];

  for (let i = 1; i < latlngs.length - 1; i++) {
    const prev = latlngs[i - 1];
    const curr = latlngs[i];
    const next = latlngs[i + 1];

    const bearing1 = bearingBetween(prev, curr);
    const bearing2 = bearingBetween(curr, next);
    const diff = ((bearing2 - bearing1 + 540) % 360) - 180;

    const dist = haversine(curr[0], curr[1], next[0], next[1]);

    if (Math.abs(diff) < 25) {
      steps.push(`Move straight for ${Math.round(dist)} meters`);
    } else if (diff > 25) {
      steps.push(`Turn right and continue ${Math.round(dist)} meters`);
    } else if (diff < -25) {
      steps.push(`Turn left and continue ${Math.round(dist)} meters`);
    }
  }

  steps.push('You have reached your destination');
  return steps;
}

// ---------- Bearing between two coordinates ----------
function bearingBetween(p1, p2) {
  const [lat1, lon1] = p1.map(x => x * Math.PI / 180);
  const [lat2, lon2] = p2.map(x => x * Math.PI / 180);
  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}
// ---------- Generate turn-by-turn instructions ----------
function generateTurnByTurn(latlngs) {
  const steps = [];
  if (latlngs.length < 3) return ['Go straight to your destination'];

  for (let i = 1; i < latlngs.length - 1; i++) {
    const prev = latlngs[i - 1];
    const curr = latlngs[i];
    const next = latlngs[i + 1];

    // Calculate direction angles between each leg of the route
    const bearing1 = bearingBetween(prev, curr);
    const bearing2 = bearingBetween(curr, next);
    const diff = ((bearing2 - bearing1 + 540) % 360) - 180; // normalize to [-180,180]

    const dist = haversine(curr[0], curr[1], next[0], next[1]);

    if (Math.abs(diff) < 25) {
      steps.push(`Move straight for ${Math.round(dist)} meters`);
    } else if (diff > 25) {
      steps.push(`Turn right and continue ${Math.round(dist)} meters`);
    } else if (diff < -25) {
      steps.push(`Turn left and continue ${Math.round(dist)} meters`);
    }
  }

  steps.push('You have reached your destination');
  return steps;
}

// ---------- Bearing between two coordinates ----------
function bearingBetween(p1, p2) {
  const [lat1, lon1] = p1.map(x => x * Math.PI / 180);
  const [lat2, lon2] = p2.map(x => x * Math.PI / 180);

  const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
            Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);

  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360; // convert to [0,360)
}

// ---------- Draw polyline ----------
function drawPolyline(latlngs) {
  if (routeLine) map.removeLayer(routeLine);
  routeLine = L.polyline(latlngs, { color:'#2a8cff', weight:5, opacity:0.9 }).addTo(map);
  const bounds = L.latLngBounds(latlngs);
  map.fitBounds(bounds.pad(0.2));
}

// ---------- Live GPS ----------
function startWatchPosition() {
  if (!('geolocation' in navigator)) {
    document.getElementById('gpsStatus').innerText = 'Geolocation not supported';
    return;
  }
  navigator.geolocation.getCurrentPosition(pos=>{
    if (!currentLocation) setCurrentLocation([pos.coords.latitude,pos.coords.longitude],'GPS start');
  });
  watchId = navigator.geolocation.watchPosition(pos=>{
    setCurrentLocation([pos.coords.latitude,pos.coords.longitude],'GPS');
    if (destination) {
      const newFloor = detectCurrentFloor(pos.coords.latitude, pos.coords.longitude);
      if (newFloor !== currentFloor) {
        currentFloor = newFloor;
        showFloor(currentFloor);
        speakText(`You are now on floor ${currentFloor}.`);
      }
      computeAndShowRoute();
    }
  }, err => console.warn('watchPosition error', err), { enableHighAccuracy:true });
}

// ---------- Voice ----------
function speakText(msg) {
  if (!window.speechSynthesis) return;
  if (msg === lastSpoken) return;
  lastSpoken = msg;
  const u = new SpeechSynthesisUtterance(msg);
  u.lang = VOICE_LANG;
  u.rate = 1;
  window.speechSynthesis.speak(u);
}

// ---------- on page load ----------
window.onload = init;