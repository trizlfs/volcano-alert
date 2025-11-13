(async () => {
  // Map Configurations
  const map = L.map("map").setView([37, -142], 3);

  // Defines multiple Maps for OPTIONS!
  const baseLayers = {
    "Default Map": L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 18,
      minZoom: 2,
      attribution: '&copy; OpenStreetMap Contributors'
    }),

    "Satellite": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 18,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, USDA, USGS'
    }),

    "Topographic": L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
      maxZoom: 17,
      attribution: '&copy; OpenTopoMap, SRTM, OpenStreetMap Contributors'
    })
  };

  // Default Map as the one that is automatically enabled
  baseLayers["Default Map"].addTo(map);

  // Added Map controll (Designed in index.html)
  L.control.layers(baseLayers, null, { collapsed: false }).addTo(map);

  // Creates Panes for Markers allowing for disabling, and layer control.
  map.createPane('pane-unassigned'); map.getPane('pane-unassigned').style.zIndex = 350;
  map.createPane('pane-green');  map.getPane('pane-green').style.zIndex = 400;
  map.createPane('pane-yellow'); map.getPane('pane-yellow').style.zIndex = 450;
  map.createPane('pane-orange'); map.getPane('pane-orange').style.zIndex = 500;
  map.createPane('pane-red');    map.getPane('pane-red').style.zIndex = 550;

  const markersGroup = L.layerGroup().addTo(map);
  let activeMarkersVisible = true;

  // Collects Data for each Volcano based on Color Code
  const markersByColor = { UNASSIGNED: [], GREEN: [], YELLOW: [], ORANGE: [], RED: [] };

  // All API Endpoints where we can fetch our Data
  const elevatedURL = "https://volcanoes.usgs.gov/hans-public/api/volcano/getElevatedVolcanoes";
  const volcanoVnumURL = vnum => `https://volcanoes.usgs.gov/hans-public/api/volcano/getVolcano/${vnum}`;
  // changed to US volcano list per request
  const monitoredURL = "https://volcanoes.usgs.gov/hans-public/api/volcano/getUSVolcanoes";

  // First Focuses on fetching Elevated Volcanoes in case of the regular API failing or being slow.
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
    // Now we fetch the other volcanoes as the elvated ones have been processed..
    const resMon = await fetch(monitoredURL);
    if (!resMon.ok) throw new Error(`USVolcanoes API Error ${resMon.status}`);
    const monitored = await resMon.json();
    console.log("getUSVolcanoes response:", monitored);

    const monitoredItems = Array.isArray(monitored) ? monitored : (Array.isArray(monitored.result) ? monitored.result : []);
    const monitoredVnums = new Set(monitoredItems.map(mi => mi.vnum || mi.vn));

    // Due to the API's data not providing locations, we go to a second API which will give details for each volcano.
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

    // These are the Icons for each Color Code, which is the goverment icon used by the USGS, 
    // (Due to how hard it was to get these, we resulted to the Alaska Volcano Observatory for getting the icons directly.)
    const ICON_URLS = {
      UNASSIGNED: "https://avo.alaska.edu/img/icons/svg/uninstrumented.svg",
      GREEN: "https://avo.alaska.edu/img/icons/svg/triangle.svg",
      YELLOW: "https://avo.alaska.edu/img/icons/svg/yellowtriangle.svg",
      ORANGE: "https://avo.alaska.edu/img/icons/svg/eyecon-orange.svg",
      RED: "https://avo.alaska.edu/img/icons/svg/danger.svg"
    };
    // Makes each Volcano Icon
    const makeIcon = url => L.icon({
      iconUrl: url,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
      popupAnchor: [0, -28]
    });
    // This is the Icon map which allows adds the icons directly to the map, so they can move around, and not be static.
    const ICON_MAP = {
      UNASSIGNED: makeIcon(ICON_URLS.UNASSIGNED),
      GREEN: makeIcon(ICON_URLS.GREEN),
      YELLOW: makeIcon(ICON_URLS.YELLOW),
      ORANGE: makeIcon(ICON_URLS.ORANGE),
      RED: makeIcon(ICON_URLS.RED)
    };

    const bounds = [];
    const shownVnums = new Set();
    // This actually adds the icons to the map, where the ICON_MAP configured them.
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

    // This is where we get the volcano data for the elevated volcanoes.
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
        // This is Data from the APIs which we use when you click on a volcano icon.
        const name = summary.volcano_name_appended || summary.volcano_name || detail.volcano_name_appended || detail.volcano_name || "Unknown";
        const vnum = summary.vnum || summary.vn || detail.vnum || "";
        const obs = summary.obs_fullname || summary.obs || detail.obs_fullname || detail.obs || "N/A";
        const pubDate = summary.pubDate || summary.sent_date_cap || detail.pubDate || "";
        const synopsis = summary.synopsis || detail.synopsis || detail.status || "";
        const alertLevel = summary.alert_level || summary.cap_level || detail.alert_level || "N/A";
        const noticeUrl = summary.notice_url || detail.notice_url || summary.notice_data || detail.notice_data || "";
        const imageUrl = summary.volcano_image_url || detail.volcano_image_url || "";
        // This is the text/box shown when you click on a volcano icon.
        const popupHtml = `
          <div style="min-width:240px">
            ${imageUrl ? `<div style="text-align:center"><img src="${imageUrl}" alt="${name} image" style="max-width:220px;max-height:140px;display:block;margin:6px auto;border-radius:4px" /></div>` : ""}
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

        // This finds if a color is actually assigned, and if not, assumes GREEN unless marked uninstrumented.
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
          // If No color assigned, assumes GREEN
          colorCode = 'GREEN';
        }
        // This is Data from the APIs which we use when you click on a volcano icon.
        const name = summary.volcano_name_appended || summary.volcano_name || detail.volcano_name_appended || detail.volcano_name || "Unknown";
        const vnum = summary.vnum || summary.vn || detail.vnum || "";
        const obs = summary.obs_fullname || summary.obs || detail.obs_fullname || detail.obs || "N/A";
        const pubDate = summary.pubDate || summary.sent_date_cap || detail.pubDate || "";
        const synopsis = summary.synopsis || detail.synopsis || detail.status || "";
        const noticeUrl = summary.notice_url || detail.notice_url || summary.notice_data || detail.notice_data || "";
        const imageUrl = summary.volcano_image_url || detail.volcano_image_url || "";
        // This is the text/box shown when you click on a volcano icon.
        const popupHtml = `
          <div style="min-width:240px">
            ${imageUrl ? `<div style="text-align:center"><img src="${imageUrl}" alt="${name} image" style="max-width:220px;max-height:140px;display:block;margin:6px auto;border-radius:4px" /></div>` : ""}
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
    // This function toggles the visibility of markers based on their color code.
    const toggleColor = (color, show) => {
      (markersByColor[color] || []).forEach(m => {
        if (show) m.addTo(map);
        else m.remove();
      });
    };
    // This is the part that takes the data from the checkboxes and applies them to the map.
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
    // This part adds the buttons to show all or none of the volcanoes.
    const btnAll = document.getElementById('btn-show-all');
    const btnNone = document.getElementById('btn-show-none');
    if (btnAll) btnAll.addEventListener('click', () => { ['UNASSIGNED','GREEN','YELLOW','ORANGE','RED'].forEach(c => { const el = document.getElementById(`chk-${c.toLowerCase()}`); if (el) { el.checked = true; toggleColor(c, true); } }); });
    if (btnNone) btnNone.addEventListener('click', () => { ['UNASSIGNED','GREEN','YELLOW','ORANGE','RED'].forEach(c => { const el = document.getElementById(`chk-${c.toLowerCase()}`); if (el) { el.checked = false; toggleColor(c, false); } }); });

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initToggles);
    else initToggles();
    // Ensures the API didnt fail, or if theres errors with either broswers, or code.
  } catch (err) {
    console.error("Error fetching volcano data:", err);
    console.error("If you see a CORS error, the public API may block direct browser requests. Try using a proxy or run fetch from a server-side environment.");
  }
})();
