// Shared by the content script and the popup.
var MPF = (() => {
  const DEFAULTS = {
    match: ["5800x3d"],
    exclude: ["wanted", "looking for", "recherche", "wtb", "iso"],
    mode: "dim", // "dim" | "hide" | "off"
    stopAtOutside: true,
    maxScrolls: 40,
    outsideMarkers: [
      "results from outside your search",
      "résultats en dehors de votre recherche",
      "résultats hors de votre recherche",
    ],
  };

  // "Ryzen 7 5800 X3D" -> "ryzen75800x3d"
  const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]/g, "");
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Match terms ignore case/spaces/punctuation. "re:" entries are regexes.
  function matcher(terms) {
    const tests = terms.filter(Boolean).map((t) => {
      if (t.startsWith("re:")) {
        try {
          const rx = new RegExp(t.slice(3), "i");
          return [t, (s) => rx.test(s)];
        } catch {
          return [t, () => false];
        }
      }
      const n = normalize(t);
      return [t, (s) => n.length > 0 && normalize(s).includes(n)];
    });
    return (s) => (tests.find(([, fn]) => fn(s)) || [null])[0];
  }

  // Exclude terms are whole words/phrases, so "iso" doesn't hit "comparison".
  function excluder(terms) {
    const tests = terms.filter(Boolean).map((t) => {
      if (t.startsWith("re:")) {
        try {
          return new RegExp(t.slice(3), "i");
        } catch {
          return /$^/;
        }
      }
      return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(t.toLowerCase())}($|[^\\p{L}\\p{N}])`, "iu");
    });
    return (s) => tests.some((rx) => rx.test(s));
  }

  const PRICE_RE = /(\d[\d\s,.]*\s*[$€£]|[$€£]\s*\d|^(free|gratuit)$)/i;

  // Card text is "price\n[old price]\ntitle\nlocation[\nextra]".
  function parseCard(text) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const prices = lines.filter((l) => PRICE_RE.test(l));
    const rest = lines.filter((l) => !PRICE_RE.test(l));
    return { price: prices[0] || "", title: rest[0] || "", location: rest[1] || "" };
  }

  return { DEFAULTS, normalize, matcher, excluder, parseCard };
})();
