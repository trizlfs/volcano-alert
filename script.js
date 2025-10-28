const API_KEY = "d1750a9be2de97ccedded32753dc658d4aa861289fa8027e73d4c991ad20bbc7";

(async () => {
  const map = L.map("map").setView([-2.5, 118], 5);

  // 🗺️ Tile Layer
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);

  // 🌋 Volcano Icons
  const eruptionIcon = L.icon({
    iconUrl: "volcano-alert/volcano-eruption.png",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  const activeIcon = L.icon({
    iconUrl: "volcano-alert/volcano.png",
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32],
  });

  // 🌐 API + Proxy Setup
  const API_URL =
    "https://api.ambeedata.com/disasters/latest/by-country-code?countryCode=IDN&limit=10&page=1";

  // ⚙️ Cloudflare Worker proxy URL
  const PROXY_URL = `https://volcano-proxy.blazetrenttls.workers.dev?url=${encodeURIComponent(
    API_URL
  )}`;

  try {
    const res = await fetch(PROXY_URL, {
      headers: {
        "x-api-key": API_KEY,
        "Content-type": "application/json",
      },
    });

    if (!res.ok) throw new Error(`API Error ${res.status}`);
    const data = await res.json();

    if (data.result && data.result.length) {
      data.result.forEach((volcano) => {
        if (volcano.event_type !== "VO") return; // only volcanos

        const marker = L.marker([volcano.lat, volcano.lng], {
          icon: volcano.event_name.toLowerCase().includes("eruption")
            ? eruptionIcon
            : activeIcon,
        }).addTo(map);

        marker.bindPopup(`
          <b>${volcano.event_name}</b><br>
          <b>Date:</b> ${volcano.date}<br>
          <b>Location:</b> ${volcano.lat}, ${volcano.lng}
        `);
      });
    } else {
      console.warn("No volcano data found");
    }
  } catch (err) {
    console.error("Error fetching volcano data:", err);
  }
})();
