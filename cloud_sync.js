/* cloud_sync.js (v2) - TallerFlowDB deliveries renderer + basic workflow actions
   - Reads localStorage key "TallerFlowDB"
   - Renders "fichas" (cards) for deliveries with basic actions (add delivery qty, set total, delete)
   - Does NOT depend on Firestore; purely local so it works on GitHub Pages.
*/
(function(){
  'use strict';

  const LS_KEY = 'TallerFlowDB';

  function loadDB(){
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; }
    catch(e){ console.warn('[cloud_sync] DB parse error', e); return {}; }
  }
  function saveDB(db){
    localStorage.setItem(LS_KEY, JSON.stringify(db||{}));
  }

  function sumDelivered(d){
    const hist = Array.isArray(d?.history) ? d.history : [];
    return hist.reduce((a,x)=>a + (Number(x?.qty)||0), 0);
  }
  function normalize(d){
    const total = Number(d?.total)||0;
    const delivered = sumDelivered(d);
    const pending = Math.max(0, total - delivered);
    const pct = total>0 ? Math.round((delivered/total)*100) : 0;
    let stage = 'prep';
    if (total>0 && delivered>=total) stage = 'entregado';
    else if (delivered>0) stage = 'fab'; // in production/ongoing
    // If you later store explicit stage, prefer it:
    if (d?.stage && typeof d.stage === 'string') stage = d.stage;
    return { total, delivered, pending, pct, stage };
  }

  function el(tag, attrs={}, children=[]){
    const n = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs||{})){
      if (k === 'class') n.className = v;
      else if (k === 'style') n.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (v !== undefined && v !== null) n.setAttribute(k, String(v));
    }
    for (const c of children){
      if (c === null || c === undefined) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }

  function findMainPanel(){
    // Try to locate the existing "Pedidos en curso" panel to insert our UI into.
    const headers = [...document.querySelectorAll('h1,h2,h3,div,span,p')];
    const hit = headers.find(x => (x.textContent||'').trim().toLowerCase() === 'pedidos en curso');
    if (hit) return hit.closest('div') || hit.parentElement;
    // fallback: first big container under body
    return document.body;
  }

  function hideEmptyMessage(panel){
    const nodes = panel ? panel.querySelectorAll('*') : [];
    for (const n of nodes){
      const t = (n.textContent||'').trim().toLowerCase();
      if (t.includes('no hay pedidos en preparación')) n.style.display = 'none';
    }
  }

  function render(){
    const db = loadDB();
    const deliveries = Array.isArray(db.deliveries) ? db.deliveries : [];
    const panel = findMainPanel();
    hideEmptyMessage(panel);

    // Remove previous mount
    const old = document.getElementById('cloudSyncMount');
    if (old) old.remove();

    const mount = el('div', { id:'cloudSyncMount', style:'margin-top:14px;' });

    // Header row: title + filters
    const title = el('div', {style:'display:flex;align-items:center;justify-content:space-between;gap:10px;margin:8px 0 10px;'},
      [
        el('div', {style:'font-weight:700;opacity:0.95;'}, [`Pedidos (fichas) — ${deliveries.length}`]),
        el('div', {style:'display:flex;gap:8px;flex-wrap:wrap;'}, [
          btn('Todos', ()=>setFilter('all')),
          btn('Prep', ()=>setFilter('prep')),
          btn('Fab', ()=>setFilter('fab')),
          btn('Entregados', ()=>setFilter('entregado')),
          btn('Refrescar', ()=>render()),
        ])
      ]
    );

    const list = el('div', {style:'display:flex;flex-direction:column;gap:10px;'});
    mount.appendChild(title);
    mount.appendChild(list);

    // State
    let filter = (window.__cloudSyncFilter || 'all');
    function setFilter(f){ window.__cloudSyncFilter = f; filter = f; render(); }

    const toShow = deliveries
      .map(d => ({ d, n: normalize(d) }))
      .filter(x => filter==='all' ? true : x.n.stage===filter);

    if (toShow.length === 0){
      list.appendChild(el('div', {style:'opacity:0.75; padding:10px;'}, ['(No hay pedidos para este filtro)']));
    }

    for (const {d,n} of toShow){
      list.appendChild(card(d,n));
    }

    // Insert near the top of the panel
    panel.appendChild(mount);
  }

  function btn(label, onClick){
    return el('button', {
      class: 'cloudSyncBtn',
      style: `
        padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,0.18);
        background: rgba(0,0,0,0.22); color: rgba(255,255,255,0.92);
        cursor:pointer; font-size:12px;`,
      onclick: (e)=>{ e.preventDefault(); onClick(); }
    }, [label]);
  }

  function card(d,n){
    const ref = d?.ref || '(sin ref)';
    const concept = d?.concept ? ` — ${d.concept}` : '';
    const company = d?.company || '—';
    const datePed = d?.datePed || '—';
    const datePrev = d?.datePrev || '—';

    const progressText = n.total>0 ? `${n.delivered}/${n.total} (${n.pct}%)` : `${n.delivered}`;

    const top = el('div', {style:'display:flex;justify-content:space-between;gap:10px;align-items:flex-start;'}, [
      el('div', {}, [
        el('div', {style:'font-weight:700;'}, [ref, concept]),
        el('div', {style:'opacity:0.8; font-size:12px; margin-top:2px;'}, [
          `Empresa: ${company}   ·   Pedido: ${datePed}   ·   Prev: ${datePrev}   ·   Total: ${n.total||0}`
        ]),
      ]),
      el('div', {style:'text-align:right; min-width:110px;'}, [
        el('div', {style:'opacity:0.8;font-size:12px;'}, ['Etapa']),
        el('div', {style:'font-weight:800; text-transform:uppercase;'}, [n.stage]),
      ])
    ]);

    const barOuter = el('div', {style:'height:10px;border-radius:999px;background:rgba(255,255,255,0.10);overflow:hidden;margin-top:8px;'});
    const barInner = el('div', {style:`height:100%;width:${Math.min(100,Math.max(0,n.pct))}%;background:rgba(0,160,255,0.75);`});
    barOuter.appendChild(barInner);

    const stats = el('div', {style:'display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:6px;'}, [
      el('div', {style:'opacity:0.85;font-size:12px;'}, [`Entregado: ${progressText} · Pendiente: ${n.pending}`]),
      el('div', {style:'display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;'}, [
        btn('+ Entrega', ()=>addEntrega(d)),
        btn('Editar total', ()=>editTotal(d)),
        btn('Ver notas', ()=>showNotes(d)),
        btn('Eliminar', ()=>removeDelivery(d)),
      ])
    ]);

    const wrap = el('div', {
      style: `
        border:1px solid rgba(255,255,255,0.12);
        border-radius:14px;
        padding:12px 12px 10px;
        background: rgba(0,0,0,0.18);
        box-shadow: 0 6px 20px rgba(0,0,0,0.25);
      `
    }, [top, barOuter, stats]);

    return wrap;
  }

  function findIndexByRef(db, ref){
    const arr = Array.isArray(db.deliveries) ? db.deliveries : [];
    return arr.findIndex(x => (x?.ref||'') === ref);
  }

  function addEntrega(d){
    const qtyStr = prompt('Cantidad entregada ahora (número):', '1');
    if (qtyStr === null) return;
    const qty = Number(qtyStr);
    if (!Number.isFinite(qty) || qty<=0) return alert('Cantidad inválida');
    const date = prompt('Fecha (YYYY-MM-DD):', new Date().toISOString().slice(0,10));
    if (!date) return;

    const db = loadDB();
    const idx = findIndexByRef(db, d?.ref);
    if (idx < 0) return alert('No se encontró el pedido en DB');
    const item = db.deliveries[idx];
    item.history = Array.isArray(item.history) ? item.history : [];
    item.history.push({date, qty});
    // Update flow (treat as units)
    item.flow = item.flow || {};
    const delivered = item.history.reduce((a,x)=>a+(Number(x?.qty)||0),0);
    const total = Number(item.total)||0;
    item.flow.entregado = delivered;
    item.flow.fab = Math.max(0, total - delivered);
    db.deliveries[idx] = item;
    saveDB(db);
    render();
  }

  function editTotal(d){
    const db = loadDB();
    const idx = findIndexByRef(db, d?.ref);
    if (idx < 0) return alert('No se encontró el pedido en DB');
    const item = db.deliveries[idx];

    const totalStr = prompt('Nuevo TOTAL (unidades):', String(item.total ?? '0'));
    if (totalStr === null) return;
    const total = Number(totalStr);
    if (!Number.isFinite(total) || total<0) return alert('Total inválido');

    item.total = total;
    const delivered = sumDelivered(item);
    item.flow = item.flow || {};
    item.flow.entregado = delivered;
    item.flow.fab = Math.max(0, total - delivered);
    db.deliveries[idx] = item;
    saveDB(db);
    render();
  }

  function showNotes(d){
    const notes = d?.partialNotes || (Array.isArray(d?.history) ? d.history.map(x=>`${x.date}: ${x.qty}`).join('\n') : '');
    alert(notes ? notes : '(sin notas)');
  }

  function removeDelivery(d){
    if (!confirm(`Eliminar pedido "${d?.ref||''}"?`)) return;
    const db = loadDB();
    db.deliveries = (Array.isArray(db.deliveries) ? db.deliveries : []).filter(x => (x?.ref||'') !== (d?.ref||''));
    saveDB(db);
    render();
  }

  // Public API
  window.CloudSync = {
    render,
    loadDB,
    saveDB,
  };

  // Auto-render on DOM ready
  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', render);
  } else {
    render();
  }
})();
