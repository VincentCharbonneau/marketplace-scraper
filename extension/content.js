(() => {
  const ITEM_SEL = 'a[href*="/marketplace/item/"]';
  const ID_RE = /\/marketplace\/item\/(\d+)/;

  let settings = { ...MPF.DEFAULTS };
  let isMatch = MPF.matcher(settings.match);
  let isExcluded = MPF.excluder(settings.exclude);
  let matches = {}; // id -> saved listing, mirrors chrome.storage.local
  const cards = new Map(); // id -> parsed card (cached: hidden cards have no innerText)
  const cellFor = new WeakMap(); // item link -> the grid cell we dim/hide
  let stats = { scanned: 0, matched: 0 };
  let scanning = false;
  let outsideReached = false;
  let minimized = false; // panel shrunk to a pill; page shown unfiltered

  // ---------- storage ----------

  chrome.storage.sync.get("settings", ({ settings: s }) => {
    applySettings(s);
    chrome.storage.local.get(["matches", "minimized"], ({ matches: m, minimized: min }) => {
      matches = m || {};
      minimized = !!min;
      tick();
    });
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.settings) applySettings(changes.settings.newValue);
    if (changes.matches) matches = changes.matches.newValue || {};
    if (changes.minimized) minimized = !!changes.minimized.newValue;
    tick();
  });

  function applySettings(s) {
    settings = { ...MPF.DEFAULTS, ...(s || {}) };
    isMatch = MPF.matcher(settings.match);
    isExcluded = MPF.excluder(settings.exclude);
  }

  let saveTimer;
  function saveMatches() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => chrome.storage.local.set({ matches }), 500);
  }

  // ---------- page processing ----------

  const onMarketplace = () => location.pathname.startsWith("/marketplace");

  // Walk up from the link to the grid cell that holds only this listing.
  function cellOf(a) {
    const w = a.getBoundingClientRect().width || 1;
    let el = a;
    while (
      el.parentElement &&
      el.parentElement !== document.body &&
      el.parentElement.querySelectorAll(ITEM_SEL).length === 1 &&
      el.parentElement.getBoundingClientRect().width <= w * 1.5
    ) {
      el = el.parentElement;
    }
    return el;
  }

  function outsideCutoffY() {
    const markers = settings.outsideMarkers.map((m) => m.toLowerCase());
    for (const el of document.querySelectorAll('span, h2, h3, div[role="heading"]')) {
      if (el.children.length) continue;
      const t = (el.textContent || "").trim().toLowerCase();
      if (t && markers.some((m) => t.includes(m))) return el.getBoundingClientRect().top + scrollY;
    }
    return null;
  }

  function process() {
    if (!onMarketplace()) return renderPanel();
    const cutoff = outsideCutoffY();
    outsideReached = cutoff !== null;
    let scanned = 0;
    let matched = 0;
    let changed = false;

    for (const a of document.querySelectorAll(ITEM_SEL)) {
      const m = ID_RE.exec(a.href);
      if (!m) continue;
      const id = m[1];

      if (a.dataset.mpfId !== id) {
        // New link, or FB reused the node for another listing: reset it.
        cellFor.get(a)?.classList.remove("mpf-dim", "mpf-hide", "mpf-hit");
        cellFor.delete(a);
        a.dataset.mpfId = id;
      }
      if (!cards.has(id)) {
        const card = MPF.parseCard(a.innerText || "");
        if (!card.title) continue; // not rendered yet, retry next pass
        cards.set(id, card);
      }
      const card = cards.get(id);

      // Find the cell while it's visible; a hidden cell has no size to measure.
      if (!cellFor.has(a)) cellFor.set(a, cellOf(a));
      const cell = cellFor.get(a);
      const top = cell.getBoundingClientRect().top + scrollY;
      const outside = cutoff !== null && top > cutoff;
      const hit = isMatch(card.title) && !isExcluded(card.title);
      const counts = !(outside && settings.stopAtOutside);

      if (counts) scanned++;
      if (hit && counts) {
        matched++;
        const now = Date.now();
        if (!matches[id]) {
          matches[id] = {
            id,
            ...card,
            matched: isMatch(card.title),
            url: `https://www.facebook.com/marketplace/item/${id}/`,
            firstSeen: now,
            lastSeen: now,
          };
          changed = true;
        } else if (now - matches[id].lastSeen > 60_000 || matches[id].price !== card.price) {
          Object.assign(matches[id], card, { lastSeen: now });
          changed = true;
        }
      }

      cell.classList.remove("mpf-dim", "mpf-hide", "mpf-hit");
      if (settings.mode !== "off" && !minimized) {
        if (hit && counts) cell.classList.add("mpf-hit");
        else cell.classList.add(settings.mode === "hide" ? "mpf-hide" : "mpf-dim");
      }
    }

    stats = { scanned, matched };
    if (changed) saveMatches();
    renderPanel();
  }

  let procTimer;
  const tick = () => {
    clearTimeout(procTimer);
    procTimer = setTimeout(process, 250);
  };
  new MutationObserver(tick).observe(document.body, { childList: true, subtree: true });

  // ---------- auto-scroll scan ----------

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function scan() {
    if (scanning) return;
    scanning = true;
    let stale = 0;
    let last = -1;
    for (let i = 0; i < settings.maxScrolls && scanning; i++) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(1500 + Math.random() * 1000);
      process();
      if (outsideReached && settings.stopAtOutside) break;
      const n = document.querySelectorAll(ITEM_SEL).length;
      stale = n === last ? stale + 1 : 0;
      last = n;
      if (stale >= 3) break;
      setStatus(`scrolling… ${i + 1}/${settings.maxScrolls}`);
    }
    scanning = false;
    setStatus(outsideReached && settings.stopAtOutside ? "done (reached edge of search area)" : "done");
    renderPanel();
  }

  // ---------- on-page panel ----------

  const style = document.createElement("style");
  style.textContent = `
    .mpf-dim { opacity: .15 !important; transition: opacity .2s; }
    .mpf-dim:hover { opacity: .8 !important; }
    .mpf-hide { display: none !important; }
    .mpf-hit { outline: 3px solid #22c55e !important; outline-offset: 2px; border-radius: 8px; }
  `;
  document.documentElement.appendChild(style);

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;bottom:16px;right:16px;z-index:2147483647;";
  const root = host.attachShadow({ mode: "open" });
  root.innerHTML = `
    <style>
      .box { font: 13px -apple-system, system-ui, sans-serif; background: #111827; color: #f9fafb;
             border-radius: 10px; padding: 10px 12px; box-shadow: 0 4px 16px rgba(0,0,0,.3); min-width: 210px; }
      .row { display: flex; gap: 6px; align-items: center; margin-top: 8px; }
      b { color: #4ade80; }
      button, select { font: inherit; border: 0; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
      button { background: #22c55e; color: #052e16; font-weight: 600; }
      button.stop { background: #f87171; color: #450a0a; }
      .status { color: #9ca3af; font-size: 11px; margin-top: 6px; min-height: 1em; }
      .x { margin-left: auto; background: none; color: #9ca3af; padding: 0 4px; }
      .pill { font: 600 12px -apple-system, system-ui, sans-serif; background: #111827; color: #4ade80;
              border-radius: 999px; padding: 6px 12px; box-shadow: 0 4px 16px rgba(0,0,0,.3); }
      .pill:hover { background: #1f2937; }
      [hidden] { display: none !important; }
    </style>
    <button class="pill" title="Show exact-match filter" hidden>✓ <span class="pm">0</span></button>
    <div class="box">
      <div><b class="m">0</b> exact matches / <span class="s">0</span> scanned</div>
      <div class="row">
        <button class="go">Scan all</button>
        <select class="mode">
          <option value="dim">Dim others</option>
          <option value="hide">Hide others</option>
          <option value="off">Show all</option>
        </select>
        <button class="x" title="Minimize (pauses filtering)">–</button>
      </div>
      <div class="status"></div>
    </div>`;
  const $ = (s) => root.querySelector(s);
  $(".go").onclick = () => (scanning ? (scanning = false) : scan());
  $(".mode").onchange = (e) => chrome.storage.sync.set({ settings: { ...settings, mode: e.target.value } });
  const setMinimized = (v) => {
    if (v) scanning = false;
    chrome.storage.local.set({ minimized: v }); // onChanged re-applies it here and in other tabs
  };
  $(".x").onclick = () => setMinimized(true);
  $(".pill").onclick = () => setMinimized(false);

  function setStatus(t) {
    $(".status").textContent = t;
  }

  function renderPanel() {
    if (!onMarketplace()) {
      host.remove();
      return;
    }
    if (!host.isConnected) document.body.appendChild(host);
    $(".box").hidden = minimized;
    $(".pill").hidden = !minimized;
    $(".pm").textContent = stats.matched;
    $(".m").textContent = stats.matched;
    $(".s").textContent = stats.scanned;
    $(".mode").value = settings.mode;
    $(".go").textContent = scanning ? "Stop" : "Scan all";
    $(".go").classList.toggle("stop", scanning);
  }

  // Facebook is a single-page app: catch navigation into/out of Marketplace.
  let lastPath = location.pathname + location.search;
  setInterval(() => {
    const p = location.pathname + location.search;
    if (p !== lastPath) {
      lastPath = p;
      scanning = false;
      setStatus("");
      tick();
    }
  }, 1000);
})();
