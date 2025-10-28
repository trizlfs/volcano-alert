const API_KEY = "d1750a9be2de97ccedded32753dc658d4aa861289fa8027e73d4c991ad20bbc7";

(async () => {
  const map = L.map("map").setView([-2.5, 118], 5);
  const markers = []; // store all markers for zoom scaling

  // 🗺️ Tile Layer
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // 🌋 Volcano Icons
  const eruptionIcon = L.icon({
    iconUrl: "volcano-alert/volcano-eruption.png",
    iconSize: [48, 48],
    iconAnchor: [24, 48],
    popupAnchor: [0, -48],
  });

  const activeIcon = L.icon({
    iconUrl: "volcano-alert/volcano.png",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });

  // 🌐 API + Proxy
  const API_URL =
    "https://api.ambeedata.com/disasters/latest/by-country-code?countryCode=IDN&limit=10&page=1";
  const PROXY_URL = `https://volcano-proxy.blazetrenttls.workers.dev?url=${encodeURIComponent(
    API_URL
  )}`;

  try {
    const res = await fetch(PROXY_URL);
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    const data = await res.json();

    if (!data.result || data.result.length === 0) {
      console.warn("No volcano data found");
      return;
    }

    // Identify erupting volcanoes reliably
    const eruptingVolcanoIds = data.result
      .filter(v => v.event_type === "VO" && v.event_name.toLowerCase().includes("eruption"))
      .map(v => v.event_id);

    // Add markers
    data.result.forEach(volcano => {
      if (volcano.event_type !== "VO") return; // only volcanoes

      const isErupting = eruptingVolcanoIds.includes(volcano.event_id);

      const marker = L.marker([volcano.lat, volcano.lng], {
        icon: isErupting ? eruptionIcon : activeIcon,
      }).addTo(map);

      marker.bindPopup(`
        <b>${volcano.event_name}</b><br>
        <b>Date:</b> ${volcano.date}<br>
        <b>Location:</b> ${volcano.lat}, ${volcano.lng}
      `);

      markers.push(marker);
    });
  } catch (err) {
    console.error("Error fetching volcano data:", err);
  }

  // 🔄 Optional: scale icons based on zoom
  map.on("zoomend", () => {
    const zoom = map.getZoom();
    markers.forEach(marker => {
      const iconUrl = marker.options.icon.options.iconUrl;
      const size = iconUrl.includes("eruption") ? 48 : 40;
      const scaled = size * (zoom / 5); // scale with zoom
      marker.setIcon(
        L.icon({
          iconUrl,
          iconSize: [scaled, scaled],
          iconAnchor: [scaled / 2, scaled],
          popupAnchor: [0, -scaled],
        })
      );
    });
  });
})();
