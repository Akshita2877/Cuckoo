// Fills #totals and #flags in demo/index.html from ../results/metrics.json. No libraries.
(function () {
  "use strict";

  function dash(v) { return v === null || v === undefined || Number.isNaN(v) ? "–" : v; }
  function num(v, digits) {
    if (v === null || v === undefined || typeof v !== "number" || !isFinite(v)) return "–";
    return digits === undefined ? String(v) : v.toFixed(digits);
  }
  function ms(v) { return v === null || v === undefined ? "–" : num(Math.round(v)) + " ms"; }
  function usd(v) { return v === null || v === undefined ? "–" : "$" + num(v, 2); }
  function el(tag, attrs, children) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "style") e.style.cssText = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) { e.appendChild(c); });
    return e;
  }
  function get(obj, key) { return obj && obj[key] !== undefined ? obj[key] : null; }

  function renderTotals(m) {
    var box = document.getElementById("totals");
    if (!box) return;
    box.textContent = "";
    box.appendChild(el("p", { text: "Documents tested: " + dash(m.n_test) +
      "  ·  Planted errors: " + dash(m.n_planted_errors_test) }));
    var rows = [
      ["Errors found", "errors_found", dash],
      ["False alarms", "false_alarms", dash],
      ["Median latency", "latency_p50_ms", ms],
      ["Cost per 1k documents", "cost_per_1k_docs", usd]
    ];
    var thead = el("tr", null, [el("th", { text: "" }), el("th", { text: "Drex" }), el("th", { text: "LLM" })]);
    var body = rows.map(function (r) {
      return el("tr", null, [
        el("td", { text: r[0] }),
        el("td", { text: String(r[2](get(m.drex, r[1]))) }),
        el("td", { text: String(r[2](get(m.llm, r[1]))) })
      ]);
    });
    box.appendChild(el("table", { "class": "totals" }, [el("thead", null, [thead]), el("tbody", null, body)]));
  }

  function probBars(probs) {
    var wrap = el("div", { style: "display:grid;grid-template-columns:auto 80px auto;gap:2px 6px;align-items:center;font-size:12px" });
    if (!probs) { wrap.appendChild(el("span", { text: "–" })); return wrap; }
    Object.keys(probs).forEach(function (c) {
      var p = probs[c];
      var w = typeof p === "number" ? Math.max(0, Math.min(1, p)) * 100 : 0;
      wrap.appendChild(el("span", { text: c }));
      wrap.appendChild(el("div", { style: "background:#e5e7eb;height:8px;border-radius:2px" }, [
        el("div", { style: "background:#2563eb;height:8px;border-radius:2px;width:" + w.toFixed(1) + "%" })
      ]));
      wrap.appendChild(el("span", { text: num(p, 2) }));
    });
    return wrap;
  }

  function renderFlags(m) {
    var box = document.getElementById("flags");
    if (!box) return;
    box.textContent = "";
    var head = el("tr", null, ["doc_id", "given_label", "drex_top", "flag_score", "drex_probs"].map(function (h) {
      return el("th", { text: h });
    }));
    var rows = (m.top_flags || []).slice(0, 20).map(function (f) {
      return el("tr", null, [
        el("td", { text: String(dash(f.doc_id)) }),
        el("td", { text: String(dash(f.given_label)) }),
        el("td", { text: String(dash(f.drex_top)) }),
        el("td", { text: num(f.flag_score, 3) }),
        el("td", null, [probBars(f.drex_probs)])
      ]);
    });
    box.appendChild(el("table", { "class": "flags" }, [el("thead", null, [head]), el("tbody", null, rows)]));
  }

  fetch("../results/metrics.json")
    .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
    .then(function (m) { renderTotals(m); renderFlags(m); })
    .catch(function (e) {
      ["totals", "flags"].forEach(function (id) {
        var b = document.getElementById(id);
        if (b) b.textContent = "Could not load metrics.json: " + e.message;
      });
    });
})();
