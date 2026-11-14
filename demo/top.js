// Cuckoo demo: fills the page from ../results/metrics.json. Plain JS, no libraries.
// All text is inserted with textContent (OCR text is untrusted), never innerHTML.
(function () {
  "use strict";
  var DASH = "–";

  // ---------- helpers ----------
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function dash(v) { return v === null || v === undefined || (typeof v === "number" && !isFinite(v)) ? DASH : v; }
  function num(v, d) { return isNum(v) ? (d === undefined ? String(v) : v.toFixed(d)) : DASH; }
  function pct(v) { return isNum(v) ? Math.round(v * 100) + "%" : DASH; }
  function ms(v) { return isNum(v) ? Math.round(v) + " ms" : DASH; }
  function usd(v) {
    if (!isNum(v)) return DASH;
    if (v === 0) return "$0";
    return "$" + (Math.abs(v) < 0.01 ? Number(v.toPrecision(2)).toString() : v.toFixed(2));
  }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "style") e.style.cssText = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(c); });
    return e;
  }
  function svg(tag, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    return e;
  }
  function get(o, k) { return o && o[k] !== undefined ? o[k] : null; }
  function box(id) { return document.getElementById(id); }
  function clear(b) { while (b.firstChild) b.removeChild(b.firstChild); }

  // ---------- headline ----------
  function renderHeadline(m) {
    var b = box("headline"); if (!b) return; clear(b);
    var k = "20", n = m.n_planted_errors_test;
    function big(cls, color, who, v) {
      return el("div", { "class": "big " + cls }, [
        el("div", { "class": "who" }, [el("span", { "class": "dot", style: "background:" + color }), el("span", { text: who })]),
        el("div", { "class": "num" }, [document.createTextNode(isNum(v) ? String(+v.toFixed(1)) : DASH),
                                     el("small", { text: isNum(n) ? " / " + n : "" })]),
        el("div", { "class": "sub", text: "real errors in the first 20 docs reviewed" })
      ]);
    }
    b.appendChild(el("p", { "class": "eyebrow", text: "If a reviewer checks only the top 20 flags" }));
    b.appendChild(el("div", { "class": "vs" }, [
      big("drex", "var(--drex)", "Drex", get(get(get(m, "drex"), "budget_curve"), k)),
      big("llm", "var(--llm)", "Local LLM baseline", get(get(get(m, "llm"), "budget_curve"), k))
    ]));
  }

  function renderContext(m) {
    var b = box("context"); if (!b) return; clear(b);
    [["Documents in dataset", dash(m.n_docs)],
     ["Held-out test documents", dash(m.n_test)],
     ["Planted label errors in test", dash(m.n_planted_errors_test)],
     ["Drex precision on flags", pct(get(m.drex, "precision"))]
    ].forEach(function (s) {
      b.appendChild(el("div", { "class": "stat" }, [el("span", { text: s[0] }), el("b", { text: String(s[1]) })]));
    });
  }

  // ---------- comparison ----------
  function renderTotals(m) {
    var b = box("totals"); if (!b) return; clear(b);
    var n = m.n_planted_errors_test;
    // [label, key, formatter, higherIsBetter, scaleMax]
    var rows = [
      ["Planted errors flagged", "errors_found", function (v) { return isNum(v) ? v + (isNum(n) ? " / " + n : "") : DASH; }, true, n],
      ["False alarms", "false_alarms", function (v) { return dash(v); }, false],
      ["Precision", "precision", pct, true, 1],
      ["Recall", "recall", pct, true, 1],
      ["Median latency", "latency_p50_ms", ms, false],
      ["95th percentile latency", "latency_p95_ms", ms, false],
      ["Cost per 1,000 docs", "cost_per_1k_docs", usd, null]
    ];
    var head = el("tr", null, [el("th", { text: "" }),
      el("th", null, [el("span", { "class": "dot", style: "background:var(--drex);margin-right:6px" }), document.createTextNode("Drex")]),
      el("th", null, [el("span", { "class": "dot", style: "background:var(--llm);margin-right:6px" }), document.createTextNode("Local LLM")])]);
    var body = rows.map(function (r) {
      var a = get(m.drex, r[1]), c = get(m.llm, r[1]);
      var max = r[4] || Math.max(isNum(a) ? a : 0, isNum(c) ? c : 0) || 1;
      var better = (r[3] === null || !isNum(a) || !isNum(c) || a === c) ? null : ((a > c) === r[3] ? "a" : "c");
      function cell(v, color, wins) {
        var kids = [el("b", { text: String(r[2](v)) })];
        if (r[1] !== "cost_per_1k_docs" && isNum(v)) {
          kids.push(el("div", { "class": "track" }, [el("div", { "class": "fill",
            style: "width:" + Math.max(2, Math.min(100, v / max * 100)).toFixed(1) + "%;background:" + color })]));
        }
        if (wins) kids.push(el("span", { "class": "win", text: "better" }));
        return el("td", { "class": "val" }, [el("div", { "class": "cell" }, kids)]);
      }
      return el("tr", null, [el("td", { "class": "metric", text: r[0] }),
        cell(a, "var(--drex)", better === "a"), cell(c, "var(--llm)", better === "c")]);
    });
    b.appendChild(el("table", { "class": "cmp" }, [el("thead", null, [head]), el("tbody", null, body)]));
    if (!isNum(get(m.drex, "cost_per_1k_docs"))) {
      b.appendChild(el("p", { style: "font-size:12px;color:var(--ink-3);margin:6px 8px 10px",
        text: "Drex cost not shown: the per-token price isn't set in config.py." }));
    }
  }

  // ---------- review queue ----------
  var CLASSES_ORDER = null;

  function renderFlags(m) {
    var b = box("flags"); if (!b) return; clear(b);
    var flags = (m.top_flags || []).slice(0, 20);
    b.appendChild(el("div", { "class": "row head", role: "row" }, ["#", "Doc", "Filed as → Drex says", "Flag score", "Result"].map(function (h) {
      return el("div", { text: h });
    })));
    flags.forEach(function (f, i) {
      f = f || {};
      var score = isNum(f.flag_score) ? f.flag_score : null;
      var badge = f.flipped === true ? el("span", { "class": "badge hit", text: "✓ Planted error" })
                : f.flipped === false ? el("span", { "class": "badge miss", text: "False alarm" })
                : el("span", { text: DASH });
      var row = el("div", { "class": "row", tabindex: "0", role: "button",
                            "aria-label": "Flag " + (i + 1) + ": " + dash(f.doc_id) }, [
        el("div", { "class": "rank", text: String(i + 1) }),
        el("div", { "class": "mono", style: "font-size:13px", text: String(dash(f.doc_id)) }),
        el("div", { "class": "labels" }, [
          el("span", { "class": "chip given", text: String(dash(f.given_label)) }),
          el("span", { style: "color:var(--ink-3)", text: "→" }),
          el("span", { "class": "chip top", text: String(dash(f.drex_top)) })
        ]),
        el("div", { "class": "score" }, [
          el("span", { text: num(score, 3) }),
          el("div", { "class": "track", style: "max-width:none" }, [el("div", { "class": "fill",
            style: "width:" + (score === null ? 0 : (score * 100).toFixed(1)) + "%;background:var(--drex)" })])
        ]),
        badge
      ]);
      function open() {
        Array.prototype.forEach.call(b.querySelectorAll(".row.active"), function (r) { r.classList.remove("active"); });
        row.classList.add("active");
        showDetail(f);
      }
      row.addEventListener("click", open);
      row.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      b.appendChild(row);
      if (i === 0) setTimeout(open, 0);  // pre-select the top flag for the demo
    });
    if (!flags.length) b.appendChild(el("p", { style: "padding:16px", text: "No flags." }));
  }

  function showDetail(f) {
    var b = box("detail"); if (!b) return; clear(b);
    var id = String(dash(f.doc_id));
    b.appendChild(el("div", { "class": "dhead" }, [
      el("h3", { "class": "mono", text: id }),
      f.flipped === true ? el("span", { "class": "badge hit", text: "✓ Planted error" })
        : f.flipped === false ? el("span", { "class": "badge miss", text: "False alarm" }) : null
    ]));
    b.appendChild(el("p", { style: "margin:0 0 12px;color:var(--ink-2);font-size:14px" }, [
      document.createTextNode("Filed as "), el("b", { text: String(dash(f.given_label)) }),
      document.createTextNode(", Drex says "), el("b", { style: "color:var(--drex)", text: String(dash(f.drex_top)) }),
      document.createTextNode(".")
    ]));

    var img = el("img", { "class": "scan", alt: "Scanned page " + id, loading: "lazy",
                          src: "../data/raw/scans/" + encodeURIComponent(id) + ".png" });
    img.addEventListener("error", function () {
      img.replaceWith(el("div", { style: "font-size:13px;color:var(--ink-3);padding:12px;background:var(--surface-2);border-radius:8px",
        text: "Scan image not available here (data/raw is local only). Run src/make_noise.py to rebuild it." }));
    });
    b.appendChild(img);

    var probs = f.drex_probs;
    if (probs && typeof probs === "object") {
      var grid = el("div", { "class": "probs" });
      Object.keys(probs).sort(function (x, y) { return (probs[y] || 0) - (probs[x] || 0); }).forEach(function (c) {
        var p = probs[c], isGiven = c === f.given_label;
        grid.appendChild(el("span", { "class": "lab" + (isGiven ? " is-given" : ""), text: c + (isGiven ? " (filed)" : "") }));
        grid.appendChild(el("div", { "class": "ptrack" }, [el("div", { "class": "pfill" + (isGiven ? " given" : ""),
          style: "width:" + (isNum(p) ? Math.max(0, Math.min(1, p)) * 100 : 0).toFixed(1) + "%" })]));
        grid.appendChild(el("span", { "class": "pv", text: isNum(p) ? (p * 100).toFixed(p < 0.1 ? 1 : 0) + "%" : DASH }));
      });
      b.appendChild(el("p", { "class": "eyebrow", style: "margin:16px 0 0", text: "Drex probabilities (label never shown to Drex)" }));
      b.appendChild(grid);
    }

    var det = el("details", null, [el("summary", { text: "Text NDI read from the scan" })]);
    var pre = el("pre", { "class": "ocr", text: "Loading…" });
    det.appendChild(pre);
    b.appendChild(det);
    fetch("../data/parsed/" + encodeURIComponent(id) + ".json")
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (d) { pre.textContent = (d && d.text) ? d.text.slice(0, 4000) : "(no text)"; })
      .catch(function () { pre.textContent = "Parsed text not available."; });
  }

  // ---------- chart ----------
  function renderChart(m) {
    var b = box("chart"); if (!b) return; clear(b);
    var d = get(m.drex, "curve"), l = get(m.llm, "curve"), n = m.n_planted_errors_test;
    if (!Array.isArray(d) || !Array.isArray(l)) {
      b.appendChild(el("img", { src: "../results/charts/budget_curve.png", alt: "Budget curve", style: "width:100%" }));
      return;
    }
    b.appendChild(el("div", { "class": "legend" }, [
      el("span", null, [el("span", { "class": "dot", style: "background:var(--drex)" }), document.createTextNode("Drex")]),
      el("span", null, [el("span", { "class": "dot", style: "background:var(--llm)" }), document.createTextNode("Local LLM baseline")]),
      el("span", null, [el("span", { style: "width:14px;border-top:1.5px dashed var(--ink-3);display:inline-block" }),
                        document.createTextNode((isNum(n) ? n : "") + " planted errors")])
    ]));
    var W = 900, H = 320, P = { l: 44, r: 70, t: 14, b: 40 };
    var kMax = Math.max(d.length, l.length) - 1, yMax = Math.max(isNum(n) ? n : 0, d[kMax] || 0) + 2;
    function X(k) { return P.l + k / kMax * (W - P.l - P.r); }
    function Y(v) { return H - P.b - v / yMax * (H - P.t - P.b); }
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img",
      "aria-label": "Planted errors found versus documents reviewed, Drex versus local LLM" });
    for (var g = 0; g <= yMax; g += 5) {
      s.appendChild(svg("line", { x1: P.l, x2: W - P.r, y1: Y(g), y2: Y(g), stroke: "var(--line)", "stroke-width": 1 }));
      var t = svg("text", { x: P.l - 8, y: Y(g) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--ink-3)" });
      t.textContent = g; s.appendChild(t);
    }
    for (var k = 0; k <= kMax; k += 10) {
      var tx = svg("text", { x: X(k), y: H - P.b + 18, "text-anchor": "middle", "font-size": 11, fill: "var(--ink-3)" });
      tx.textContent = k; s.appendChild(tx);
    }
    var xl = svg("text", { x: (P.l + W - P.r) / 2, y: H - 4, "text-anchor": "middle", "font-size": 12, fill: "var(--ink-2)" });
    xl.textContent = "Documents reviewed, highest flag score first"; s.appendChild(xl);
    if (isNum(n)) s.appendChild(svg("line", { x1: P.l, x2: W - P.r, y1: Y(n), y2: Y(n), stroke: "var(--ink-3)",
      "stroke-dasharray": "5 4", "stroke-width": 1.2 }));
    function path(arr) { return arr.map(function (v, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); }).join(" "); }
    [[l, "var(--llm)", "Local LLM"], [d, "var(--drex)", "Drex"]].forEach(function (sr) {
      s.appendChild(svg("path", { d: path(sr[0]), fill: "none", stroke: sr[1], "stroke-width": 2.5,
        "stroke-linejoin": "round", "stroke-linecap": "round" }));
      var last = sr[0].length - 1, lab = svg("text", { x: X(last) + 8, y: Y(sr[0][last]) + 4, "font-size": 12,
        "font-weight": 600, fill: "var(--ink)" });
      lab.textContent = sr[2] + " " + (+sr[0][last].toFixed(1));
      s.appendChild(lab);
    });
    var cross = svg("line", { y1: P.t, y2: H - P.b, stroke: "var(--ink-3)", "stroke-width": 1, opacity: 0 });
    var md = svg("circle", { r: 5, fill: "var(--drex)", stroke: "var(--surface)", "stroke-width": 2, opacity: 0 });
    var ml = svg("circle", { r: 5, fill: "var(--llm)", stroke: "var(--surface)", "stroke-width": 2, opacity: 0 });
    s.appendChild(cross); s.appendChild(ml); s.appendChild(md);
    var hit = svg("rect", { x: P.l, y: P.t, width: W - P.l - P.r, height: H - P.t - P.b, fill: "transparent" });
    s.appendChild(hit);
    b.appendChild(s);
    var tip = el("div", { "class": "tip" });
    b.appendChild(tip);
    function move(ev) {
      var r = s.getBoundingClientRect(), sx = (ev.clientX - r.left) / r.width * W;
      var k = Math.max(0, Math.min(kMax, Math.round((sx - P.l) / (W - P.l - P.r) * kMax)));
      [cross, md, ml].forEach(function (e) { e.setAttribute("opacity", 1); });
      cross.setAttribute("x1", X(k)); cross.setAttribute("x2", X(k));
      md.setAttribute("cx", X(k)); md.setAttribute("cy", Y(d[k]));
      ml.setAttribute("cx", X(k)); ml.setAttribute("cy", Y(l[k]));
      tip.textContent = "Top " + k + ": Drex " + (+d[k].toFixed(1)) + " · LLM " + (+l[k].toFixed(1));
      tip.style.left = (X(k) / W * r.width + (r.left - b.getBoundingClientRect().left)) + "px";
      tip.style.top = (Y(Math.max(d[k], l[k])) / H * r.height + (r.top - b.getBoundingClientRect().top)) + "px";
      tip.style.opacity = 1;
    }
    hit.addEventListener("mousemove", move);
    hit.addEventListener("mouseleave", function () {
      [cross, md, ml].forEach(function (e) { e.setAttribute("opacity", 0); }); tip.style.opacity = 0;
    });
  }

  function renderFoot(m) {
    var b = box("foot"); if (!b) return;
    b.textContent = "Data: " + dash(m.n_docs) + " RVL-CDIP scans (invoice, letter, form, resume, report, memo), 10% of labels " +
      "deliberately flipped. Drex flag score = 1 − P(filed label); flag threshold " + num(m.threshold, 2) +
      " chosen on a " + dash(m.n_dev) + "-doc dev split, results on the " + dash(m.n_test) + "-doc test split. " +
      "Top-K counts break score ties at random. All figures are read live from results/metrics.json.";
  }

  function load() {
    fetch("../results/metrics.json")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (m) {
        m = m || {};
        [renderHeadline, renderContext, renderTotals, renderFlags, renderChart, renderFoot].forEach(function (f) {
          try { f(m); } catch (e) { console.error(f.name, e); }
        });
      })
      .catch(function (e) {
        var hint = location.protocol === "file:" ?
          " Open via a server: python3 -m http.server from the repo root, then /demo/." : "";
        ["headline", "totals", "flags"].forEach(function (id) {
          var b = box(id);
          if (b) { clear(b); b.appendChild(el("div", { "class": "err", text: "Could not load metrics.json: " + e.message + "." + hint })); }
        });
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})();
