(async () => {
  // Map Config
  const map = L.map("map").setView([37, -142], 3);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    minzoom: 2,
    attribution: '&copy; Trizlfs, OpenStreetMap'
  }).addTo(map);

  map.createPane('pane-unassigned'); map.getPane('pane-unassigned').style.zIndex = 350;
  map.createPane('pane-green');  map.getPane('pane-green').style.zIndex = 400;
  map.createPane('pane-yellow'); map.getPane('pane-yellow').style.zIndex = 450;
  map.createPane('pane-orange'); map.getPane('pane-orange').style.zIndex = 500;
  map.createPane('pane-red');    map.getPane('pane-red').style.zIndex = 550;

  const markersGroup = L.layerGroup().addTo(map);
  let activeMarkersVisible = true;

  // include UNASSIGNED bucket
  const markersByColor = { UNASSIGNED: [], GREEN: [], YELLOW: [], ORANGE: [], RED: [] };

  // Fetch Data
  const elevatedURL = "https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes";
  const volcanoVnumURL = vnum => `https://volcanoes.usgs.gov/hans-public/api/volcano/getVolcano/${vnum}`;
  // changed to US volcano list per request
  const monitoredURL = "https://volcanoes.usgs.gov/hans-public/api/volcano/getUSVolcanoes";

  try {
    const res = await fetch(elevatedURL);
    if (!res.ok) throw new Error(`API Error ${res.status}`);
    const elevated = await res.json();
    console.log("getElevatedVolcanoes response:", elevated);

    const items = Array.isArray(elevated) ? elevated : (Array.isArray(elevated.result) ? elevated.result : []);
    if (!items.length) {
      console.warn("No elevated volcanoes found.");
    }

    const allowed = ["YELLOW", "ORANGE", "RED"];
    const filtered = items.filter(i => {
      const c = (i.color_code || i.color || "").toString().toUpperCase();
      return allowed.includes(c) && (i.vnum || i.vn);
    });

    const resMon = await fetch(monitoredURL);
    if (!resMon.ok) throw new Error(`USVolcanoes API Error ${resMon.status}`);
    const monitored = await resMon.json();
    console.log("getUSVolcanoes response:", monitored);

    const monitoredItems = Array.isArray(monitored) ? monitored : (Array.isArray(monitored.result) ? monitored.result : []);
    const monitoredVnums = new Set(monitoredItems.map(mi => mi.vnum || mi.vn));

    // Fetch location for elevated volcanoes
    const detailPromises = filtered.map(async it => {
      const vnum = it.vnum || it.vn;
      try {
        const r = await fetch(volcanoVnumURL(vnum));
        if (!r.ok) throw new Error(`volcano ${vnum} fetch ${r.status}`);
        const detail = await r.json();
        const volcanoDetail = (detail && detail.result) ? detail.result : detail;
        return { summary: it, detail: volcanoDetail };
      } catch (e) {
        console.warn(`Failed to fetch volcano ${vnum}:`, e);
        return null;
      }
    });

    const resolved = (await Promise.all(detailPromises)).filter(Boolean);

    // Icon URLs
    const ICON_URLS = {
      UNASSIGNED: "https://avo.alaska.edu/img/icons/svg/uninstrumented.svg",
      GREEN: "https://avo.alaska.edu/img/icons/svg/triangle.svg",
      YELLOW: "https://avo.alaska.edu/img/icons/svg/yellowtriangle.svg",
      ORANGE: "https://avo.alaska.edu/img/icons/svg/eyecon-orange.svg",
      RED: "https://avo.alaska.edu/img/icons/svg/danger.svg"
    };

    const makeIcon = url => L.icon({
      iconUrl: url,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });

    const ICON_MAP = {
      UNASSIGNED: makeIcon(ICON_URLS.UNASSIGNED),
      GREEN: makeIcon(ICON_URLS.GREEN),
      YELLOW: makeIcon(ICON_URLS.YELLOW),
      ORANGE: makeIcon(ICON_URLS.ORANGE),
      RED: makeIcon(ICON_URLS.RED)
    };

    const bounds = [];
    const shownVnums = new Set();

    const addMarker = (lat, lng, colorCode, popupHtml, vnum) => {
      const paneName = ({
        UNASSIGNED: 'pane-unassigned',
        GREEN: 'pane-green',
        YELLOW: 'pane-yellow',
        ORANGE: 'pane-orange',
        RED: 'pane-red'
      })[colorCode] || 'pane-unassigned';

      const marker = L.marker([lat, lng], {
        icon: ICON_MAP[colorCode] || ICON_MAP.UNASSIGNED,
        pane: paneName,
        title: popupHtml && popupHtml.replace(/<[^>]+>/g, '').slice(0, 200)
      }).bindPopup(popupHtml);

      marker.addTo(map);

      markersByColor[colorCode] = markersByColor[colorCode] || [];
      markersByColor[colorCode].push(marker);

      bounds.push([lat, lng]);

      if (vnum) shownVnums.add(String(vnum));
      return marker;
    };

    // Add elevated (YELLOW/ORANGE/RED)
    if (resolved && resolved.length) {
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

        addMarker(lat, lng, colorCode, popupHtml, vnum);
      });
    }

    const monitoredToAdd = monitoredItems
      .map(mi => ({ ...mi, vnum: mi.vnum || mi.vn }))
      .filter(mi => mi.vnum && !shownVnums.has(String(mi.vnum)));

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

        // determine color; if explicitly unassigned or uninstrumented use UNASSIGNED,
        // if a valid color is provided use it, otherwise default to GREEN
        const rawColor = (summary.color_code || summary.color || "").toString().toUpperCase();
        const instrumentedFalse = summary.instrumented === false
          || summary.instrumented === 'false'
          || summary.uninstrumented === true
          || summary.uninstrumented === 'true';

        let colorCode;
        if (rawColor === 'UNASSIGNED' || instrumentedFalse) {
          colorCode = 'UNASSIGNED';
        } else if (['GREEN','YELLOW','ORANGE','RED'].includes(rawColor)) {
          colorCode = rawColor;
        } else {
          // no explicit color -> assume GREEN for monitored volcanoes unless flagged uninstrumented
          colorCode = 'GREEN';
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
            <b>Alert Level:</b> ${colorCode === 'UNASSIGNED' ? 'N/A' : 'Normal'}<br/>
            <b>Color Code:</b> ${colorCode}<br/>
            <b>Observatory:</b> ${obs}<br/>
            <b>Elevation (m):</b> ${detail.elevation_meters ?? detail.elevation ?? "N/A"}<br/>
            ${synopsis ? `<div style="margin-top:6px"><i>${synopsis}</i></div>` : ""}
            <div style="margin-top:6px">
              ${noticeUrl ? `<a href="${noticeUrl}" target="_blank" rel="noreferrer">Notice</a>` : ""}
            </div>
          </div>
        `;

        addMarker(lat, lng, colorCode, popupHtml, vnum);
      });
    }

    if (bounds.length) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 8 });

    const toggleColor = (color, show) => {
      (markersByColor[color] || []).forEach(m => {
        if (show) m.addTo(map);
        else m.remove();
      });
    };

    const initToggles = () => {
      const ids = { UNASSIGNED: 'chk-unassigned', GREEN: 'chk-green', YELLOW: 'chk-yellow', ORANGE: 'chk-orange', RED: 'chk-red' };
      Object.entries(ids).forEach(([color, id]) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.checked = true;
        el.addEventListener('change', () => {
          toggleColor(color, el.checked);
        });
      });
    };

    const btnAll = document.getElementById('btn-show-all');
    const btnNone = document.getElementById('btn-show-none');
    if (btnAll) btnAll.addEventListener('click', () => { ['UNASSIGNED','GREEN','YELLOW','ORANGE','RED'].forEach(c => { const el = document.getElementById(`chk-${c.toLowerCase()}`); if (el) { el.checked = true; toggleColor(c, true); } }); });
    if (btnNone) btnNone.addEventListener('click', () => { ['UNASSIGNED','GREEN','YELLOW','ORANGE','RED'].forEach(c => { const el = document.getElementById(`chk-${c.toLowerCase()}`); if (el) { el.checked = false; toggleColor(c, false); } }); });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initToggles);
    else initToggles();

  } catch (err) {
    console.error("Error fetching volcano data:", err);
    console.error("If you see a CORS error, the public API may block direct browser requests. Try using a proxy or run fetch from a server-side environment.");
  }
})();
