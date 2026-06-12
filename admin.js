let map, selectedLatLng, selectedId = null;
let geojsonLayer;
let allLocations = [];
let locationLabels = [];
let currentFloor = 0;

let tempMarker = null;  // ⭐ NEW: for click marker only

function initAdminMap() {
  map = L.map('mapAdmin').setView([12.30402, 76.7118], 21);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 25,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  fetch('map.geojson')
    .then(res => res.json())
    .then(data => {
      geojsonLayer = L.geoJSON(data, {
        style: {
          color: "#2E86AB",
          weight: 2,
          fillColor: "#A9CCE3",
          fillOpacity: 0.3
        }
      }).addTo(map);

      map.fitBounds(geojsonLayer.getBounds());
    });

  // ⭐ ONE marker only for selection
  map.on('click', (e) => {
    selectedLatLng = e.latlng;

    if (tempMarker) map.removeLayer(tempMarker);
    
    tempMarker = L.marker([selectedLatLng.lat, selectedLatLng.lng])
      .addTo(map);

    alert(`Selected: ${selectedLatLng.lat.toFixed(6)}, ${selectedLatLng.lng.toFixed(6)} on Floor ${currentFloor}`);
  });

  loadAllLocations();
  highlightFloorButton();
}

function switchFloor(floor) {
  currentFloor = floor;
  highlightFloorButton();
  refreshPermanentMarkers();

  // Remove temporary marker when switching floors  
  if (tempMarker) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }

  refreshTable();
}

function highlightFloorButton() {
  for (let i = 0; i <= 3; i++) {
    const btn = document.getElementById("floorBtn" + i);
    if (i === currentFloor) btn.classList.add("active");
    else btn.classList.remove("active");
  }
}

async function loadAllLocations() {
  const res = await fetch('/api/locations');
  allLocations = await res.json();

  refreshPermanentMarkers();
  refreshTable();
}

// ⭐ SHOW ONLY CURRENT FLOOR PERMANENT LABELS
function refreshPermanentMarkers() {
  locationLabels.forEach(lbl => map.removeLayer(lbl));
  locationLabels = [];

  allLocations
    .filter(loc => loc.floor_number == currentFloor)
    .forEach(loc => {

      const lbl = L.marker([loc.latitude, loc.longitude], {
        icon: L.divIcon({
          className: "text-label",
          html: `<b>${loc.room_name}</b>`
        })
      }).addTo(map);

      locationLabels.push(lbl);
    });
}

// TABLE FILTER
function refreshTable() {
  const tbody = document.querySelector("#locTable tbody");
  tbody.innerHTML = "";

  allLocations
    .filter(loc => loc.floor_number == currentFloor)
    .forEach(loc => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${loc.id}</td>
        <td>${loc.room_name}</td>
        <td>${loc.floor_number}</td>
        <td><button onclick="editLocation(${loc.id})">✏️</button></td>
      `;
      tbody.appendChild(tr);
    });
}

async function editLocation(id) {
  const res = await fetch(`/api/locations/${id}`);
  const loc = await res.json();

  switchFloor(loc.floor_number);

  document.getElementById("roomName").value = loc.room_name;
  document.getElementById("roomDesc").value = loc.description;

  selectedLatLng = { lat: loc.latitude, lng: loc.longitude };
  selectedId = id;

  alert(`Editing ${loc.room_name} on Floor ${loc.floor_number}`);
}

async function saveLocation() {
  const room_name = document.getElementById("roomName").value.trim();
  const description = document.getElementById("roomDesc").value.trim();
  const password = document.getElementById("adminPass").value.trim();

  if (password !== "admin123") return alert("Incorrect password");
  if (!selectedLatLng || !room_name) return alert("Select location on map & fill fields");

  const body = {
    room_name,
    description,
    latitude: selectedLatLng.lat,
    longitude: selectedLatLng.lng,
    floor_number: currentFloor
  };

  const url = selectedId ? `/api/locations/${selectedId}` : "/api/locations/add";
  const method = selectedId ? "PUT" : "POST";

  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  alert(data.message);

  selectedId = null;

  // Remove temporary marker after save  
  if (tempMarker) {
    map.removeLayer(tempMarker);
    tempMarker = null;
  }

  loadAllLocations();
}

async function deleteLocation() {
  if (!selectedId) return alert("Select a location to delete first");

  const password = document.getElementById("adminPass").value.trim();
  if (password !== "admin123") return alert("Incorrect password");
  if (!confirm("Are you sure?")) return;

  const res = await fetch(`/api/locations/${selectedId}`, { method: "DELETE" });
  const data = await res.json();

  alert(data.message);

  selectedId = null;

  loadAllLocations();
}

window.onload = initAdminMap;