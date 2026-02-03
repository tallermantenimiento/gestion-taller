// cloud_sync.js (lightweight) - fixes missing 404 and renders deliveries lists from localStorage (TallerFlowDB)
// This file is intentionally dependency-free and safe to load in any module page.

(function () {
  "use strict";

  function safeParseJSON(s, fallback) {
    try { return JSON.parse(s); } catch (e) { return fallback; }
  }

  function getDB() {
    return safeParseJSON(localStorage.getItem("TallerFlowDB") || "{}", {});
  }

  function getDeliveries(db) {
    db = db || getDB();
    const a = Array.isArray(db.deliveries) ? db.deliveries : [];
    const b = Array.isArray(db.state && db.state.deliveries) ? db.state.deliveries : [];
    // Prefer db.deliveries (richer), but merge by ref if both exist.
    const byRef = new Map();
    for (const it of b) if (it && it.ref) byRef.set(it.ref, it);
    for (const it of a) {
      if (!it || !it.ref) continue;
      const prev = byRef.get(it.ref) || {};
      byRef.set(it.ref, Object.assign({}, prev, it));
    }
    return Array.from(byRef.values());
  }

  function stageFromFlow(flow) {
    // Choose the "current" stage as the one with progress between 0 and 100 and not completed,
    // falling back to highest non-100 stage.
    if (!flow || typeof flow !== "object") return "prep";
    const order = ["prep", "fab", "pintura", "almacen", "entregado"];
    // If there is no "prep" key in flow, treat "fab" start as after prep.
    let best = null;
    for (const k of order) {
      const v = Number(flow[k]);
      if (!Number.isFinite(v)) continue;
      if (v >= 0 && v < 100) { best = k; break; }
    }
    if (!best) {
      // pick last stage that isn't 100
      for (const k of order) {
        const v = Number(flow[k]);
        if (Number.isFinite(v) && v !== 100) best = k;
      }
    }
    return best || "prep";
  }

  function formatDate(d) {
    if (!d) return "";
    // expects YYYY-MM-DD
    return String(d);
  }

  function pctBar(flow) {
    const keys = ["fab", "pintura", "almacen", "entregado"];
    const parts = keys.map(k => {
      const v = flow && typeof flow === "object" ? Number(flow[k]) : NaN;
      return `<span style="display:inline-block;min-width:72px;margin-right:10px;opacity:.9">${k}: <b>${Number.isFinite(v)?v:0}%</b></span>`;
    }).join("");
    return `<div style="margin-top:6px;font-size:12px">${parts}</div>`;
  }

  function ensureRender() {
    const db = getDB();
    const deliveries = getDeliveries(db);

    // Only render if page has the "Pedidos en curso" section (preparacion/fabricacion/almacen/entregados)
    // UI: optional "deliveries list" injector (DEBUG only)
    // By default, this is OFF so it never pollutes other modules (e.g., Stock).
    // To enable on a page, set: window.CLOUDSYNC_SHOW_DELIVERIES_LIST = true; before loading cloud_sync.js
    if (!window.CLOUDSYNC_SHOW_DELIVERIES_LIST) return;

    const bodyText = (document.body && document.body.innerText) ? document.body.innerText : "";
    const isLikelyWorkflows = /Pedidos en curso|Preparación|Fabricación|Almac[eé]n|Entregad/i.test(bodyText);

    if (!isLikelyWorkflows) return;

    // Try to find container near heading "Pedidos en curso"
    let anchor = null;
    const all = Array.from(document.querySelectorAll("*"));
    for (const el of all) {
      const t = (el.textContent || "").trim();
      if (t === "Pedidos en curso" || t.startsWith("Pedidos en curso")) { anchor = el; break; }
    }

    // Create/replace a list container
    let host = document.getElementById("cloudSyncDeliveriesList");
    if (!host) {
      host = document.createElement("div");
      host.id = "cloudSyncDeliveriesList";
      host.style.marginTop = "12px";
      host.style.padding = "10px";
      host.style.borderRadius = "12px";
      host.style.background = "rgba(0,0,0,.18)";
      host.style.backdropFilter = "blur(4px)";
      host.style.border = "1px solid rgba(255,255,255,.08)";
      host.style.maxWidth = "900px";
      host.style.width = "calc(100% - 24px)";
      host.style.boxSizing = "border-box";
      host.style.color = "#eaf2ff";
      host.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    } else {
      host.innerHTML = "";
    }

    const title = document.createElement("div");
    title.style.display = "flex";
    title.style.justifyContent = "space-between";
    title.style.alignItems = "center";
    title.style.marginBottom = "8px";
    title.innerHTML = `<div style="font-weight:700">Pedidos (desde TallerFlowDB)</div>
      <div style="font-size:12px;opacity:.8">deliveries: <b>${deliveries.length}</b></div>`;
    host.appendChild(title);

    if (!deliveries.length) {
      const empty = document.createElement("div");
      empty.style.opacity = ".85";
      empty.textContent = "No hay deliveries en TallerFlowDB.deliveries.";
      host.appendChild(empty);
    } else {
      // Render cards
      const list = document.createElement("div");
      list.style.display = "grid";
      list.style.gridTemplateColumns = "1fr";
      list.style.gap = "10px";

      const stageWanted = (document.title || "").toLowerCase().includes("fabric") ? "fab"
        : (document.title || "").toLowerCase().includes("almac") ? "almacen"
        : (document.title || "").toLowerCase().includes("entreg") ? "entregado"
        : "prep";

      const filtered = deliveries.filter(d => stageFromFlow(d.flow) === stageWanted || stageWanted === "prep");
      // If filtering removes everything, show all to avoid "empty" confusion.
      const finalList = filtered.length ? filtered : deliveries;

      for (const d of finalList) {
        const card = document.createElement("div");
        card.style.padding = "10px 12px";
        card.style.borderRadius = "12px";
        card.style.border = "1px solid rgba(255,255,255,.08)";
        card.style.background = "rgba(0,0,0,.20)";
        const ref = d.ref || "(sin ref)";
        const concept = d.concept || "";
        const company = d.company || "";
        const datePed = formatDate(d.datePed);
        const datePrev = formatDate(d.datePrev);
        const total = (d.total != null) ? d.total : "";
        const stage = stageFromFlow(d.flow);

        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap">
            <div>
              <div style="font-weight:800;font-size:14px">${ref} <span style="opacity:.75;font-weight:600">· ${concept}</span></div>
              <div style="font-size:12px;opacity:.85;margin-top:2px">
                <span style="margin-right:10px">Empresa: <b>${company || "-"}</b></span>
                <span style="margin-right:10px">Pedido: <b>${datePed || "-"}</b></span>
                <span style="margin-right:10px">Prev: <b>${datePrev || "-"}</b></span>
                <span>Total: <b>${total || "-"}</b></span>
              </div>
              ${pctBar(d.flow || {})}
            </div>
            <div style="text-align:right;min-width:120px">
              <div style="font-size:12px;opacity:.8">Etapa</div>
              <div style="font-weight:800">${stage}</div>
            </div>
          </div>
        `;
        list.appendChild(card);
      }
      host.appendChild(list);
    }

    // Insert into DOM: after anchor's parent block if possible
    if (anchor) {
      // walk up a bit to find a block-level container
      let p = anchor;
      for (let i = 0; i < 6 && p && p.parentElement; i++) {
        if (p.tagName === "DIV" && (p.className || "").toString().includes("panel")) break;
        p = p.parentElement;
      }
      (p && p.parentElement ? p.parentElement : document.body).appendChild(host);
    } else {
      document.body.appendChild(host);
    }

    // Remove the "No hay pedidos..." message if present
    for (const el of Array.from(document.querySelectorAll("*"))) {
      const t = (el.textContent || "").trim();
      if (/No hay pedidos/i.test(t)) {
        // keep headings/buttons; remove only plain text nodes blocks
        if (el.children.length === 0 && t.length < 80) el.textContent = "";
      }
    }
  }

  // Expose helpers for debugging
  window.CloudSync = {
    getDB,
    getDeliveries: () => getDeliveries(getDB()),
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureRender);
  } else {
    ensureRender();
  }
})();
