const API_KEY = "d1750a9be2de97ccedded32753dc658d4aa861289fa8027e73d4c991ad20bbc7";

(async () => {
  // Create map
  const map = L.map("map").setView([-2.5, 118], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const markersGroup = L.layerGroup().addTo(map);
  let activeMarkersVisible = true;

  // Fetch volcano data via proxy
  const API_URL = "https://api.ambeedata.com/disasters/latest/by-country-code?countryCode=IDN&limit=50&page=1";
  const PROXY_URL = `https://volcano-proxy.blazetrenttls.workers.dev?url=${encodeURIComponent(API_URL)}`;

  try {
    const res = await fetch(PROXY_URL);
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    const data = await res.json();

    if (!data.result || data.result.length === 0) {
      console.warn("No volcano data found");
      return;
    }

    // Identify erupting volcanoes
    const eruptingVolcanoIds = data.result
      .filter(v => v.event_type === "VO" && v.event_name.toLowerCase().includes("eruption"))
      .map(v => v.event_id);

    // Add markers
    const volcanoMarkers = [];
    data.result.forEach(volcano => {
      if (volcano.event_type !== "VO") return;

      const isErupting = eruptingVolcanoIds.includes(volcano.event_id);

      const marker = L.circleMarker([volcano.lat, volcano.lng], {
        radius: isErupting ? 10 : 6,
        fillColor: isErupting ? "orange" : "white",
        color: "black",
        weight: 1,
        fillOpacity: 0.8
      }).bindPopup(`
        <b>${volcano.event_name}</b><br>
        <b>Date:</b> ${volcano.date}<br>
        <b>Location:</b> ${volcano.lat}, ${volcano.lng}
      `).addTo(markersGroup);

      volcanoMarkers.push({ marker, isErupting });
    });

    // Toggle active volcanoes
    const toggleBtn = L.control({position: 'topright'});
    toggleBtn.onAdd = function() {
      const div = L.DomUtil.create('div', 'toggle-btn');
      div.innerHTML = '<button style="padding:5px">Toggle Active Volcanoes</button>';
      div.firstChild.onclick = () => {
        activeMarkersVisible = !activeMarkersVisible;
        volcanoMarkers.forEach(v => {
          if (!v.isErupting) {
            if (activeMarkersVisible) {
              markersGroup.addLayer(v.marker);
            } else {
              markersGroup.removeLayer(v.marker);
            }
          }
        });
      };
      return div;
    };
    toggleBtn.addTo(map);

  } catch (err) {
    console.error("Error fetching volcano data:", err);
  }
})();
