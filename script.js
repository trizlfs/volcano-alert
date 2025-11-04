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
  const API_URL = "https://volcanoes.usgs.gov/hans-public/api/volcano/getCapElevated";
  // No proxy / no key required for public API

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    const data = await res.json();

    // Debug: inspect raw response in browser console
    console.log("getVhpStatus response:", data);

    // Support multiple possible shapes: array, { result: [] }, { items: [] }, etc.
    const items = (() => {
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.result)) return data.result;
      if (Array.isArray(data.items)) return data.items;
      if (Array.isArray(data.volcanoes)) return data.volcanoes;
      // fallback: try to find first array property
      for (const k of Object.keys(data || {})) {
        if (Array.isArray(data[k])) return data[k];
      }
      return [];
    })();

    if (!items.length) {
      console.warn("No volcano data found (items empty). Check API response above.");
      return;
    }

    // Identify Eruptions (best-effort; may be empty if fields not present)
    const eruptingVolcanoIds = items
      .filter(v => v && v.event_type === "VO" && typeof v.event_name === "string" && v.event_name.toLowerCase().includes("eruption"))
      .map(v => v.event_id)
      .filter(Boolean);

    // helper: try multiple fields for lat/lng and coerce to Number
    const getCoord = (obj, keys) => {
      for (const k of keys) {
        if (obj && obj[k] !== undefined && obj[k] !== null && obj[k] !== "") {
          const n = Number(obj[k]);
          if (!Number.isNaN(n)) return n;
        }
      }
      return null;
    };
    const latKeys = ["latitude", "lat", "latitude_dd", "lat_dd", "Latitude"];
    const lngKeys = ["longitude", "lon", "lng", "longitude_dd", "lng_dd", "Longitude"];

    // color map for alert colors (must be YELLOW, ORANGE, or RED)
    const COLOR_MAP = {
      YELLOW: "#ffd43b",
      ORANGE: "#ff8c00",
      RED: "#ff2e2e"
    };

    // Adds Markers for relevant volcanoes (only YELLOW/ORANGE/RED)
    const volcanoMarkers = [];
    const bounds = [];
    items.forEach((volcano, idx) => {
      try {
        if (!volcano || typeof volcano !== "object") return;
        // Accept either event-based items or the map/status items — prefer direct color_code field
        const colorCode = (volcano.color_code || volcano.color || volcano.colorCode || "").toString().toUpperCase();
        if (!colorCode) return;
        if (!["YELLOW", "ORANGE", "RED"].includes(colorCode)) return; // only show required colors

        const lat = getCoord(volcano, latKeys);
        const lng = getCoord(volcano, lngKeys);
        if (lat === null || lng === null) {
          console.warn(`Skipping item ${idx} (missing coords)`, volcano);
          return; // skip if no coords
        }

        const isErupting = eruptingVolcanoIds.includes(volcano.event_id) || !!volcano.is_elevated_cap || !!volcano.is_elevated || !!volcano.is_elevated;
        const markerColor = COLOR_MAP[colorCode] || "#ffd43b";

        // Build popup using fields returned by getVhpStatus / getCapElevated variants
        const name = volcano.volcano_name_appended || volcano.volcano_name || volcano.event_name || volcano.name || "Unknown";
        const pubDate = volcano.pubDate || volcano.sent_date_cap || volcano.alertdate || "";
        const vnum = volcano.vnum || volcano.vn || volcano.vnum_id || "";
        const obs = volcano.obs_fullname || volcano.obs || volcano.obsname || volcano.obs_full || "N/A";
        const capCertainty = volcano.cap_certainty || volcano.certainty || "";
        const capSeverity = volcano.cap_severity || volcano.severity || "";
        const capUrgency = volcano.cap_urgency || volcano.urgency || "";
        const synopsis = volcano.synopsis || volcano.status || volcano.more_info || "";
        const noticeUrl = volcano.notice_url || volcano.vhplink || volcano.notice_data || "";
        const noticeData = volcano.notice_data || "";

        const popupHtml = `
          <div style="min-width:240px">
            <b>${name}</b> ${vnum ? `(<small>${vnum}</small>)` : ""}<br/>
            <b>Alert Level:</b> ${volcano.alert_level || volcano.alert || "N/A"}<br/>
            <b>Color Code:</b> ${colorCode}<br/>
            <b>Observatory:</b> ${obs}<br/>
            <b>Elevation (m):</b> ${volcano.elevation_meters ?? volcano.elevation ?? "N/A"}<br/>
            <b>CAP:</b> ${volcano.is_elevated_cap ? "Elevated" : "Normal"} ${capCertainty ? `- ${capCertainty}` : ""} ${capSeverity ? `| ${capSeverity}` : ""} ${capUrgency ? `| ${capUrgency}` : ""}<br/>
            ${synopsis ? `<div style="margin-top:6px"><i>${synopsis}</i></div>` : ""}
            <div style="margin-top:6px">
              <b>Date:</b> ${pubDate || "N/A"}<br/>
              ${noticeUrl ? `<a href="${noticeUrl}" target="_blank" rel="noreferrer">Notice</a>` : ""}
              ${noticeData && noticeData !== noticeUrl ? ` <a href="${noticeData}" target="_blank" rel="noreferrer">Notice Data</a>` : ""}
            </div>
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
      } catch (e) {
        console.error("Error processing volcano item", idx, e, volcano);
      }
    });

    // fit map to markers if any
    if (bounds.length) {
      map.fitBounds(bounds, { padding: [20, 20], maxZoom: 8 });
    }
    // end marker creation
  } catch (err) {
    // More descriptive error for common CORS/fetch issues
    console.error("Error fetching volcano data:", err);
    console.error("If you see a CORS error, the public API may block direct browser requests. Try using a proxy or run fetch from a server-side environment.");
  }
})();
