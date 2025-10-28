const API_KEY = "d1750a9be2de97ccedded32753dc658d4aa861289fa8027e73d4c991ad20bbc7";
const map = L.map("map").setView([-2.5, 118], 5); // Center on Indonesia

// Add OpenStreetMap layer
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 10,
  attribution: "© OpenStreetMap contributors",
}).addTo(map);

// Local icons
const orangeIcon = L.icon({
  iconUrl: "volcano-eruption.png",
  iconSize: [25, 25],
});
const whiteIcon = L.icon({
  iconUrl: "volcano.png",
  iconSize: [25, 25],
});

const showAllCheckbox = document.getElementById("showAll");

async function fetchVolcanoes() {
  try {
    // Use corsproxy.io to bypass browser CORS block
    const url =
      "https://corsproxy.io/?" +
      encodeURIComponent(
        "https://api.ambeedata.com/disasters/latest/by-country-code?countryCode=IDN&limit=50&page=1"
      );

    const res = await fetch(url, {
      headers: {
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
      },
    });

    const data = await res.json();
    console.log("Fetched data:", data);

    if (!data.result || !Array.isArray(data.result)) {
      console.warn("No volcano data received!");
      return;
    }

    plotVolcanoes(data.result);
  } catch (err) {
    console.error("Error fetching volcano data:", err);
  }
}

function plotVolcanoes(volcanoes) {
  // Remove old markers
  map.eachLayer((layer) => {
    if (layer instanceof L.Marker) map.removeLayer(layer);
  });

  volcanoes.forEach((v) => {
    if (v.event_type !== "VO") return; // Volcano events only
    const erupting = v.event_name.toLowerCase().includes("eruption");

    // Hide non-erupting ones unless "show all" is checked
    if (!erupting && !showAllCheckbox.checked) return;

    const marker = L.marker([v.lat, v.lng], {
      icon: erupting ? orangeIcon : whiteIcon,
    }).addTo(map);

    marker.bindPopup(`
      <b>${v.event_name}</b><br>
      🌋 ${erupting ? "Erupting" : "Active"}<br>
      🕓 ${v.date}<br>
      🧭 Lat: ${v.lat}, Lng: ${v.lng}
    `);
  });
}

// Re-fetch when checkbox changes
showAllCheckbox.addEventListener("change", fetchVolcanoes);

// Load on start
fetchVolcanoes();
