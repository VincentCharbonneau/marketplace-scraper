const $ = (s) => document.querySelector(s);

// ---------- tabs ----------

document.querySelectorAll("nav button").forEach((b) => {
  b.onclick = () => {
    document.querySelectorAll("nav button").forEach((x) => x.classList.toggle("on", x === b));
    document.querySelectorAll("section").forEach((s) => (s.hidden = s.id !== b.dataset.tab));
  };
});

// ---------- matches ----------

let matches = {};

function renderList(lastViewed) {
  const list = $(".list");
  const items = Object.values(matches).sort((a, b) => b.firstSeen - a.firstSeen);
  if (!items.length) {
    list.innerHTML = `<div class="empty">No matches yet.<br>Search Marketplace and hit “Scan all”.</div>`;
    return;
  }
  list.replaceChildren(
    ...items.map((m) => {
      const div = document.createElement("div");
      div.className = "item";
      const a = document.createElement("a");
      a.href = m.url;
      a.target = "_blank";
      a.textContent = m.title;
      if (m.firstSeen > lastViewed) {
        const tag = document.createElement("span");
        tag.className = "new";
        tag.textContent = "NEW";
        div.append(tag);
      }
      const meta = document.createElement("div");
      meta.className = "meta";
      const price = document.createElement("span");
      price.className = "price";
      price.textContent = m.price || "—";
      meta.append(price, ` · ${m.location || "?"} · found ${new Date(m.firstSeen).toLocaleString()}`);
      div.append(a, meta);
      return div;
    })
  );
}

chrome.storage.local.get(["matches", "lastViewed"], ({ matches: m, lastViewed = 0 }) => {
  matches = m || {};
  renderList(lastViewed);
  chrome.storage.local.set({ lastViewed: Date.now() }); // clears NEW badge next time
});

$("#clear").onclick = () => {
  if (!confirm("Clear all saved matches?")) return;
  matches = {};
  chrome.storage.local.set({ matches });
  renderList(0);
};

$("#csv").onclick = () => {
  const cols = ["title", "price", "location", "url", "matched", "firstSeen"];
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = Object.values(matches).map((m) =>
    cols.map((c) => esc(c === "firstSeen" ? new Date(m[c]).toISOString() : m[c])).join(",")
  );
  const blob = new Blob([[cols.join(","), ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `marketplace-matches-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
};

// ---------- settings ----------

const lines = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean);

chrome.storage.sync.get("settings", ({ settings: s }) => {
  const st = { ...MPF.DEFAULTS, ...(s || {}) };
  $("#match").value = st.match.join("\n");
  $("#exclude").value = st.exclude.join("\n");
  $("#mode").value = st.mode;
  $("#stopAtOutside").checked = st.stopAtOutside;
  $("#maxScrolls").value = st.maxScrolls;

  let t;
  const save = () => {
    clearTimeout(t);
    t = setTimeout(() => {
      Object.assign(st, {
        match: lines($("#match").value),
        exclude: lines($("#exclude").value),
        mode: $("#mode").value,
        stopAtOutside: $("#stopAtOutside").checked,
        maxScrolls: Math.max(1, parseInt($("#maxScrolls").value, 10) || MPF.DEFAULTS.maxScrolls),
      });
      chrome.storage.sync.set({ settings: st });
      $(".saved").textContent = "Saved ✓";
      setTimeout(() => ($(".saved").textContent = ""), 1200);
    }, 300);
  };
  document.querySelectorAll("#settings textarea, #settings input, #settings select").forEach((el) => {
    el.oninput = save;
    el.onchange = save;
  });
});
