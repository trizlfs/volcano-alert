const API_KEY = "d1750a9be2de97ccedded32753dc658d4aa861289fa8027e73d4c991ad20bbc7";

(async () => {
  // Map
  const map = L.map("map").setView([37, -142], 4);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 5,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const markersGroup = L.layerGroup().addTo(map);
  let activeMarkersVisible = true;

  // Fetch Data
  const API_URL = "https://volcanoes.usgs.gov/hans-public/api/map/getVhpStatus";
  //  const PROXY_URL = `https://volcano-proxy.blazetrenttls.workers.dev?url=${encodeURIComponent(API_URL)}`;
  // No proxy / no key required for public API

  try {
    //    const res = await fetch(API_URL);
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    const data = await res.json();

    if (!data.result || data.result.length === 0) {
      console.warn("No volcano data found");
      return;
    }

    // Identify Eruptions
    const eruptingVolcanoIds = data.result
      .filter(v => v.event_type === "VO" && v.event_name && v.event_name.toLowerCase().includes("eruption"))
      .map(v => v.event_id);

    // helper: try multiple fields for lat/lng and coerce to Number
    const getCoord = (obj, keys) => {
      for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null && obj[k] !== "") {
          const n = Number(obj[k]);
          if (!Number.isNaN(n)) return n;
        }
      }
      return null;
    };
    const latKeys = ["lat", "latitude", "Latitude", "LAT", "lat_dd", "latitude_dd"];
    const lngKeys = ["lng", "lon", "longitude", "Longitude", "LON", "long", "lng_dd", "longitude_dd"];

    // color map for alert colors (must be YELLOW, ORANGE, or RED)
    const COLOR_MAP = {
      YELLOW: "#ffd43b",
      ORANGE: "#ff8c00",
      RED: "#ff2e2e"
    };

    // Adds Markers for relevant volcanoes (only YELLOW/ORANGE/RED)
    const volcanoMarkers = [];
    const bounds = [];
    data.result.forEach(volcano => {
      if (volcano.event_type !== "VO") return;
      const colorCode = (volcano.color_code || "").toString().toUpperCase();
      if (!["YELLOW", "ORANGE", "RED"].includes(colorCode)) return; // only show required colors

      const lat = getCoord(volcano, latKeys);
      const lng = getCoord(volcano, lngKeys);
      if (lat === null || lng === null) return; // skip if no coords

      const isErupting = eruptingVolcanoIds.includes(volcano.event_id);
      const markerColor = COLOR_MAP[colorCode] || "#ffd43b";

      const popupHtml = `
        <div style="min-width:200px">
          <b>${volcano.event_name || volcano.volcano_name || "Unknown"}</b><br/>
          <b>Alert:</b> ${volcano.alert_level || volcano.color_code || "N/A"}<br/>
          <b>Color Code:</b> ${colorCode}<br/>
          <b>Status:</b> ${volcano.status || volcano.more_info || "N/A"}<br/>
          <b>Region:</b> ${volcano.region || volcano.location || "N/A"}<br/>
          <b>Elevation (m):</b> ${volcano.elevation_meters || volcano.elevation || "N/A"}<br/>
          <b>Obs:</b> ${volcano.obs || "N/A"}<br/>
          <b>Date:</b> ${volcano.alertdate || volcano.date || "N/A"}<br/>
          ${volcano.view ? `<a href="${volcano.view}" target="_blank">Details</a>` : (volcano.vhplink ? `<a href="${volcano.vhplink}" target="_blank">Details</a>` : "")}
        </div>
      `;

      const marker = L.circleMarker([lat, lng], {
        radius: isErupting ? 10 : 7,
        fillColor: markerColor,
        color: "#333",
        weight: 1,
        fillOpacity: 0.9
      }).bindPopup(popupHtml).addTo(markersGroup);

      volcanoMarkers.push({ marker, isErupting, data: volcano });
      bounds.push([lat, lng]);
    });

    // fit map to markers if any
    if (bounds.length) {
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 8 });
    }
    // end marker creation
  } catch (err) {
    console.error("Error fetching volcano data:", err);
  }
})();
