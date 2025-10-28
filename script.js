
const API_KEY = "d1750a9be2de97ccedded32753dc658d4aa861289fa8027e73d4c991ad20bbc7";
// Initialize Leaflet map centered on Indonesia
const map = L.map('map').setView([-2.5, 118], 5);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 10,
  attribution: '© OpenStreetMap contributors'
}).addTo(map);

// Load your custom icons
const orangeIcon = L.icon({
  iconUrl: 'volcano-eruption.png',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28]
});

const whiteIcon = L.icon({
  iconUrl: 'volcano.png',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -28]
});
const res = await fetch(
  "https://corsproxy.io/?" + encodeURIComponent("https://api.ambeedata.com/disasters/latest/by-country-code?countryCode=IDN&limit=50&page=1"),
  {
    headers: {
      "x-api-key": "YOUR_API_KEY",
      "Content-Type": "application/json"
    }
  }
);

const showAllCheckbox = document.getElementById("showAll");

// Fetch data from Ambee API
async function fetchVolcanoes() {
  try {
    const response = await fetch(
  "https://corsproxy.io/?" + encodeURIComponent("https://api.ambeedata.com/disasters/latest/by-country-code?countryCode=IDN&limit=50&page=1"),
  {
    headers: {
      "x-api-key": "YOUR_API_KEY",
      "Content-Type": "application/json"
    }
  }
);


    const data = await response.json();
    if (data.result && data.result.length > 0) {
      plotVolcanoes(data.result);
    } else {
      console.warn("No volcano data found.");
    }
  } catch (error) {
    console.error("Error fetching volcano data:", error);
  }
}

// Plot volcano markers on the map
function plotVolcanoes(volcanoes) {
  // Clear previous markers
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) map.removeLayer(layer);
  });

  volcanoes.forEach((volcano) => {
    if (volcano.event_type !== "VO") return;

    // Determine eruption status based on event name
    const erupting = volcano.event_name.toLowerCase().includes("eruption");

    // Skip non-erupting volcanoes if "showAll" is unchecked
    if (!erupting && !showAllCheckbox.checked) return;

    // Add marker
    const marker = L.marker([volcano.lat, volcano.lng], {
      icon: erupting ? orangeIcon : whiteIcon
    }).addTo(map);

    marker.bindPopup(`
      <b>${volcano.event_name}</b><br>
      🌋 <b>Status:</b> ${erupting ? "Erupting" : "Active"}<br>
      📅 <b>Date:</b> ${volcano.date}<br>
      🧭 <b>Location:</b> ${volcano.lat.toFixed(2)}, ${volcano.lng.toFixed(2)}
    `);
  });
}

// Re-fetch when user toggles "Show all"
showAllCheckbox.addEventListener("change", fetchVolcanoes);

// Initial load
fetchVolcanoes();

// Optional: auto-refresh every 10 minutes
setInterval(fetchVolcanoes, 10 * 60 * 1000);
