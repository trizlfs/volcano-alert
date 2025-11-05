(async () => {
  // Map Config
  const map = L.map("map").setView([37, -142], 3);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  const markersGroup = L.layerGroup().addTo(map);
  let activeMarkersVisible = true;

  // Fetch Data
  const elevatedURL = "https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes";
  const volcanoVnumURL = vnum => `https://volcanoes.usgs.gov/hans-public/api/volcano/getVolcano/${vnum}`;
  const monitoredURL = "https://volcanoes.usgs.gov/hans-public/api/volcano/getMonitoredVolcanoes";

  try {
    const res = await fetch(elevatedURL);
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    const elevated = await res.json();
    console.log("getElevatedVolcanoes response:", elevated);

    const items = Array.isArray(elevated) ? elevated : (Array.isArray(elevated.result) ? elevated.result : []);
    if (!items.length) {
      console.warn("No elevated volcanoes found.");
      return;
    }

    // Filter to ensure it only shows Yellow+ 
    const allowed = ["YELLOW", "ORANGE", "RED"];
    const filtered = items.filter(i => {
      const c = (i.color_code || i.color || "").toString().toUpperCase();
      return allowed.includes(c) && (i.vnum || i.vn);
    });
    if (!filtered.length) {
      console.warn("No elevated items with required color codes and vnum.");
      return;
    }

    const resMon = await fetch(monitoredURL);
    if (!resMon.ok) throw new Error(`Monitored API Error ${resMon.status}`);
    const monitored = await resMon.json();
    console.log("getMonitoredVolcanoes response:", monitored);

    const monitoredItems = Array.isArray(monitored) ? monitored : (Array.isArray(monitored.result) ? monitored.result : []);
    const monitoredVnums = new Set(monitoredItems.map(mi => mi.vnum || mi.vn));

    // Fetch location for volcanoes
    const detailPromises = filtered.map(async it => {
      const vnum = it.vnum || it.vn;
      try {
        const r = await fetch(volcanoVnumURL(vnum));
        if (!r.ok) throw new Error(`volcano ${vnum} fetch ${r.status}`);
        const detail = await r.json();
        // detail may be the volcano object or { result: {...} }
        const volcanoDetail = (detail && detail.result) ? detail.result : detail;
        return { summary: it, detail: volcanoDetail };
      } catch (e) {
        console.warn(`Failed to fetch volcano ${vnum}:`, e);
        return null;
      }
    });

    const resolved = (await Promise.all(detailPromises)).filter(Boolean);
    if (!resolved.length) {
      console.warn("No volcano details retrieved.");
      return;
    }

    // Use custom icons for volcano markers
    const ICON_URLS = {
      GREEN: "https://avo.alaska.edu/img/icons/svg/triangle.svg",
      YELLOW: "https://avo.alaska.edu/img/icons/svg/yellowtriangle.svg",
      ORANGE: "https://avo.alaska.edu/img/icons/svg/eyecon-orange.svg",
      RED: "https://avo.alaska.edu/img/icons/svg/danger.svg"
    };

    const makeIcon = url => L.icon({
      iconUrl: url,
      iconSize: [28, 28],
      iconAnchor: [14, 28],   // bottom-center
      popupAnchor: [0, -28]
    });

    const ICON_MAP = {
      GREEN: makeIcon(ICON_URLS.GREEN),
      YELLOW: makeIcon(ICON_URLS.YELLOW),
      ORANGE: makeIcon(ICON_URLS.ORANGE),
      RED: makeIcon(ICON_URLS.RED)
    };

    const bounds = [];
    const shownVnums = new Set(); // track vnums already added so monitored doesn't duplicate

    // Add elevated (YELLOW/ORANGE/RED) markers and record shown vnums
    resolved.forEach(({ summary, detail }) => {
      const colorCode = (summary.color_code || summary.color || "").toString().toUpperCase();
      if (!["YELLOW", "ORANGE", "RED"].includes(colorCode)) return;
      const lat = Number(detail.latitude ?? detail.lat ?? detail.latitude_dd);
      const lng = Number(detail.longitude ?? detail.lon ?? detail.lng ?? detail.longitude_dd);
      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        console.warn("Missing coords for vnum", summary.vnum || summary.vn, detail);
        return;
      }

      const name = summary.volcano_name_appended || summary.volcano_name || detail.volcano_name_appended || detail.volcano_name || "Unknown";
      const vnum = summary.vnum || summary.vn || detail.vnum || "";
      const obs = summary.obs_fullname || summary.obs || detail.obs_fullname || detail.obs || "N/A";
      const pubDate = summary.pubDate || summary.sent_date_cap || detail.pubDate || "";
      const synopsis = summary.synopsis || detail.synopsis || detail.status || "";
      const alertLevel = summary.alert_level || summary.cap_level || detail.alert_level || "N/A";
      const noticeUrl = summary.notice_url || detail.notice_url || summary.notice_data || detail.notice_data || "";

      const popupHtml = `
        <div style="min-width:240px">
          <b>${name}</b> ${vnum ? `(<small>${vnum}</small>)` : ""}<br/>
          <b>Alert Level:</b> ${alertLevel}<br/>
          <b>Color Code:</b> ${colorCode}<br/>
          <b>Observatory:</b> ${obs}<br/>
          <b>Elevation (m):</b> ${detail.elevation_meters ?? detail.elevation ?? "N/A"}<br/>
          ${synopsis ? `<div style="margin-top:6px"><i>${synopsis}</i></div>` : ""}
          <div style="margin-top:6px">
            ${noticeUrl ? `<a href="${noticeUrl}" target="_blank" rel="noreferrer">Notice</a>` : ""}
          </div>
        </div>
      `;

      const marker = L.marker([lat, lng], {
        icon: ICON_MAP[colorCode] || ICON_MAP.YELLOW
      }).bindPopup(popupHtml).addTo(markersGroup);

      bounds.push([lat, lng]);
      if (vnum) shownVnums.add(String(vnum));
    });

    // Add monitored (GREEN) markers for monitored volcanos that weren't already shown
    const monitoredToAdd = monitoredItems
      .map(mi => ({ ...mi, vnum: mi.vnum || mi.vn }))
      .filter(mi => mi.vnum && !shownVnums.has(String(mi.vnum)))
      .filter(mi => {
        const c = (mi.color_code || mi.color || "").toString().toUpperCase();
        // Only show explicit GREEN monitored volcanos (some monitored entries may not include color_code)
        return c === "GREEN";
      });

    if (monitoredToAdd.length) {
      const monDetailPromises = monitoredToAdd.map(async mi => {
        const vnum = mi.vnum;
        try {
          const r = await fetch(volcanoVnumURL(vnum));
          if (!r.ok) throw new Error(`volcano ${vnum} fetch ${r.status}`);
          const detail = await r.json();
          const volcanoDetail = (detail && detail.result) ? detail.result : detail;
          return { summary: mi, detail: volcanoDetail };
        } catch (e) {
          console.warn(`Failed to fetch monitored volcano ${vnum}:`, e);
          return null;
        }
      });

      const monResolved = (await Promise.all(monDetailPromises)).filter(Boolean);
      monResolved.forEach(({ summary, detail }) => {
        const lat = Number(detail.latitude ?? detail.lat ?? detail.latitude_dd);
        const lng = Number(detail.longitude ?? detail.lon ?? detail.lng ?? detail.longitude_dd);
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
          console.warn("Missing coords for monitored vnum", summary.vnum || summary.vn, detail);
          return;
        }

        const name = summary.volcano_name_appended || summary.volcano_name || detail.volcano_name_appended || detail.volcano_name || "Unknown";
        const vnum = summary.vnum || summary.vn || detail.vnum || "";
        const obs = summary.obs_fullname || summary.obs || detail.obs_fullname || detail.obs || "N/A";
        const pubDate = summary.pubDate || summary.sent_date_cap || detail.pubDate || "";
        const synopsis = summary.synopsis || detail.synopsis || detail.status || "";
        const noticeUrl = summary.notice_url || detail.notice_url || summary.notice_data || detail.notice_data || "";

        const popupHtml = `
          <div style="min-width:240px">
            <b>${name}</b> ${vnum ? `(<small>${vnum}</small>)` : ""}<br/>
            <b>Alert Level:</b> Normal<br/>
            <b>Color Code:</b> GREEN<br/>
            <b>Observatory:</b> ${obs}<br/>
            <b>Elevation (m):</b> ${detail.elevation_meters ?? detail.elevation ?? "N/A"}<br/>
            ${synopsis ? `<div style="margin-top:6px"><i>${synopsis}</i></div>` : ""}
            <div style="margin-top:6px">
              ${noticeUrl ? `<a href="${noticeUrl}" target="_blank" rel="noreferrer">Notice</a>` : ""}
            </div>
          </div>
        `;

        const marker = L.marker([lat, lng], {
          icon: ICON_MAP.GREEN
        }).bindPopup(popupHtml).addTo(markersGroup);

        bounds.push([lat, lng]);
        if (vnum) shownVnums.add(String(vnum));
      });
    }

    if (bounds.length) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 8 });
  } catch (err) {
    console.error("Error fetching volcano data:", err);
    console.error("If you see a CORS error, the public API may block direct browser requests. Try using a proxy or run fetch from a server-side environment.");
  }
})();
