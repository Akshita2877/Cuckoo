// Cuckoo demo: a guided walkthrough built entirely from ../results/metrics.json.
// Plain JS, no libraries. All text goes in via textContent (OCR text is untrusted).
(function () {
  "use strict";
  var DASH = "–";

  // ---------- helpers ----------
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function d(v) { return v === null || v === undefined || (typeof v === "number" && !isFinite(v)) ? DASH : String(v); }
  function pct(v, dp) { return isNum(v) ? (v * 100).toFixed(dp || 0) + "%" : DASH; }
  function ms(v) { return isNum(v) ? Math.round(v) + " ms" : DASH; }
  function n1(v) { return isNum(v) ? String(+v.toFixed(1)) : DASH; }
  function get(o, k) { return o && o[k] !== undefined ? o[k] : null; }
  function $(id) { return document.getElementById(id); }
  function clear(b) { while (b.firstChild) b.removeChild(b.firstChild); return b; }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "text") e.textContent = attrs[k];
      else if (k === "class") e.className = attrs[k];
      else if (k === "style") e.style.cssText = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  // Rich sentence: parts are strings or ["b", text] / ["drex"|"llm"|"good"|"bad", text]
  function say(tag, parts, attrs) {
    return el(tag, attrs, parts.map(function (p) {
      if (typeof p === "string") return p;
      var style = { drex: "color:var(--drex)", llm: "color:var(--llm)", good: "color:var(--good)", bad: "color:var(--bad)" }[p[0]];
      return el("b", style ? { style: style, text: p[1] } : { text: p[1] });
    }));
  }
  function svg(tag, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    return e;
  }
  function probBars(probs, filed) {
    var g = el("div", { "class": "probs" });
    Object.keys(probs || {}).sort(function (a, b) { return (probs[b] || 0) - (probs[a] || 0); }).forEach(function (c) {
      var p = probs[c], f = c === filed;
      g.appendChild(el("span", { "class": "lab" + (f ? " filed" : ""), text: c + (f ? " (filed)" : "") }));
      g.appendChild(el("div", { "class": "ptrack" }, [el("div", { "class": "pfill" + (f ? " filed" : ""),
        style: "width:" + (isNum(p) ? Math.max(0, Math.min(1, p)) * 100 : 0).toFixed(1) + "%" })]));
      g.appendChild(el("span", { "class": "pv", text: isNum(p) ? (p * 100).toFixed(p < 0.1 ? 1 : 0) + "%" : DASH }));
    });
    return g;
  }
  function scanImg(id, cls) {
    var img = el("img", { "class": cls || "scan", alt: "Scanned page " + id, src: "../data/raw/scans/" + encodeURIComponent(id) + ".png" });
    img.addEventListener("error", function () {
      img.replaceWith(el("div", { "class": "note", style: "margin:0",
        text: "Scan image not available here (data/raw is local only; rebuild it with src/make_noise.py)." }));
    });
    return img;
  }
  function ocrInto(pre, id) {
    fetch("../data/parsed/" + encodeURIComponent(id) + ".json")
      .then(function (r) { if (!r.ok) throw new Error(); return r.json(); })
      .then(function (x) { pre.textContent = (x && x.text) ? x.text.replace(/^--- Page 1 ---\n/, "").slice(0, 3000) : "(no text)"; })
      .catch(function () { pre.textContent = "Parsed text not available."; });
  }
  function verdict(f) {
    if (f.flipped === true) return el("div", { "class": "verdict hit", text: "✓ Planted error: it really is a " + d(f.true_label || f.drex_top) + "." });
    if (f.flipped === false) return el("div", { "class": "verdict miss", text: "✗ False alarm: it really is a " + d(f.true_label || f.given_label) + ", so the label was right." });
    return null;
  }

  // ---------- 0. hero ----------
  function hero(m) {
    var D = m.drex || {}, L = m.llm || {}, E = m.n_planted_errors_test;
    clear($("answer")).appendChild(say("span", [
      "Yes, mostly. We hid ", ["b", d(E) + " wrong labels"], " among ", ["b", d(m.n_test) + " test documents"], ". ",
      ["drex", "Drex"], " raised ", ["b", d(D.n_flagged) + " flags"], " and ", ["b", d(D.errors_found)], " of them were real errors. ",
      "A local LLM baseline needed ", ["b", d(L.n_flagged) + " flags"], " to find ", ["b", d(L.errors_found)], ", so a reviewer would wade through ",
      ["b", d(L.false_alarms) + " false alarms"], " instead of ", ["b", d(D.false_alarms)], "."
    ]));
    var k = clear($("kpis"));
    [[d(D.errors_found), "/ " + d(E), "hidden errors Drex found"],
     [pct(D.precision), "", "of Drex's flags were real errors (baseline: " + pct(L.precision) + ")"],
     [n1(get(D.budget_curve, "20")), "vs " + n1(get(L.budget_curve, "20")), "real errors in the top 20 flags, Drex vs baseline"],
     [ms(D.latency_p50_ms), "", "median time per document for Drex (baseline: " + ms(L.latency_p50_ms) + ")"]
    ].forEach(function (x) {
      k.appendChild(el("div", { "class": "kpi" }, [el("div", { "class": "v" }, [x[0], x[1] ? el("small", { text: " " + x[1] }) : null]),
                                                el("div", { "class": "l", text: x[2] })]));
    });
  }

  // ---------- 2. setup ----------
  function setup(m) {
    var classes = m.classes || [], per = isNum(m.n_docs) && classes.length ? m.n_docs / classes.length : null;
    clear($("setup-lead")).appendChild(say("span", [
      "We took ", ["b", d(m.n_docs) + " real scanned documents"], " from the public RVL-CDIP dataset (", d(per), " each of ",
      classes.join(", ") + "). Then we secretly changed ", ["b", d(m.n_planted_errors_total) + " labels"], " (",
      pct(m.noise_rate) + ") to a wrong class. Because we planted them, we know exactly which labels are wrong, so we can score anyone who tries to find them."
    ]));
    var f = clear($("flow"));
    f.appendChild(el("div", { "class": "fbox" }, [el("div", { "class": "big", text: d(m.n_docs) }),
      el("p", { text: "real scanned pages, " + classes.length + " document types" })]));
    f.appendChild(el("div", { "class": "farrow", text: "→" }));
    f.appendChild(el("div", { "class": "fbox" }, [el("div", { "class": "big", style: "color:var(--bad)", text: d(m.n_planted_errors_total) }),
      el("p", { text: "labels flipped to a random wrong class (fixed seed, so it's reproducible)" })]));
    f.appendChild(el("div", { "class": "farrow", text: "→" }));
    f.appendChild(el("div", { "class": "fbox" }, [el("p", { text: "Split into two groups:" }),
      el("div", { "class": "split" }, [
        el("div", { "class": "dev" }, [el("b", { text: d(m.n_dev) + " dev" }), d(m.n_planted_errors_dev) + " errors · used only to choose the flag threshold"]),
        el("div", { "class": "test" }, [el("b", { text: d(m.n_test) + " test" }), d(m.n_planted_errors_test) + " errors · never used for tuning; every number on this page comes from here"])
      ])]));
  }

  // ---------- 3. one document ----------
  function example(m) {
    var flags = m.top_flags || [], f = flags.filter(function (x) { return x && x.flipped; })[0] || flags[0];
    var w = clear($("walk"));
    if (!f) { w.appendChild(el("p", { text: "No flags to show." })); return; }
    var pf = get(f.drex_probs, f.given_label), pt = get(f.drex_probs, f.drex_top);
    clear($("example-lead")).appendChild(say("span", ["This is Drex's most suspicious test document, ",
      ["b", d(f.doc_id)], ", from scanned page to flag. It is filed as a ", ["b", d(f.given_label)], "."]));
    function step(n, title, kids) {
      return el("div", { "class": "wstep" }, [el("div", { "class": "wt" }, [el("span", { text: n }), title])].concat(kids));
    }
    var pre = el("pre", { "class": "ocr", text: "Loading…" });
    ocrInto(pre, f.doc_id);
    w.appendChild(step("1", "The scan", [scanImg(f.doc_id),
      say("p", ["The page as it sits in the dataset, filed as ", ["b", d(f.given_label)], "."])]));
    w.appendChild(step("2", "NDI reads it", [pre,
      say("p", ["NDI turns the scan into text. ", ["b", "Only this text"], " goes to Drex; the label does not."])]));
    w.appendChild(step("3", "Drex answers", [probBars(f.drex_probs, f.given_label),
      say("p", ["Asked “What type of document is this?”, Drex puts ", ["drex", pct(pt, 1)], " on ", ["b", d(f.drex_top)],
        " and only ", ["b", pct(pf, 1)], " on ", ["b", d(f.given_label)], "."])]));
    w.appendChild(step("4", "The check", [
      el("div", { "class": "calc" }, [
        say("div", ["flag score = 1 − P(", ["b", d(f.given_label)], ")"]),
        say("div", ["= 1 − " + (isNum(pf) ? pf.toFixed(4) : DASH) + " = ", ["b", isNum(f.flag_score) ? f.flag_score.toFixed(4) : DASH]]),
        say("div", ["threshold ", ["b", d(m.threshold)], " → ", ["drex", isNum(f.flag_score) && isNum(m.threshold) && f.flag_score >= m.threshold ? "FLAGGED" : "not flagged"]])
      ]),
      verdict(f)]));
  }

  // ---------- 4. results ----------
  function results(m) {
    var E = m.n_planted_errors_test;
    clear($("results-lead")).appendChild(say("span", ["Each square is one flag a model raised on the ", ["b", d(m.n_test) + " test documents"],
      ". ", ["good", "Green"], " = a real planted error. ", ["bad", "Red"], " = a false alarm (the label was fine). A dashed square is a hidden error it missed."]));
    var duo = clear($("duo"));
    [["drex", "Drex", "var(--drex)"], ["llm", "Local LLM baseline (llama3.2)", "var(--llm)"]].forEach(function (s) {
      var M = m[s[0]] || {}, tp = M.errors_found, fp = M.false_alarms, nf = M.n_flagged;
      var waffle = el("div", { "class": "waffle", "aria-label": d(tp) + " real errors, " + d(fp) + " false alarms, " + (isNum(E) && isNum(tp) ? E - tp : DASH) + " missed" });
      var i;
      for (i = 0; i < (tp || 0); i++) waffle.appendChild(el("i", { "class": "hit" }));
      for (i = 0; i < (fp || 0); i++) waffle.appendChild(el("i", { "class": "fa" }));
      for (i = 0; i < (isNum(E) && isNum(tp) ? E - tp : 0); i++) waffle.appendChild(el("i", { "class": "missed" }));
      var ratio = isNum(nf) && isNum(tp) && tp > 0 ? nf / tp : null;
      var facts = el("ul", { "class": "facts" }, [
        say("li", ["Caught ", ["b", d(tp) + " of " + d(E)], " hidden errors (recall ", ["b", pct(M.recall)], ")."], { "class": "good" }),
        say("li", [["b", pct(M.precision)], " of its ", d(nf), " flags were real; ", ["b", d(fp) + " were false alarms"],
          ratio ? ". A reviewer checks about " + ratio.toFixed(1) + " documents per real error found." : "."],
          { "class": isNum(M.precision) && M.precision >= 0.5 ? "good" : "bad" }),
        say("li", ["It labels ", ["b", pct(M.accuracy_vs_true, 1)], " of test pages correctly, with a median of ", ["b", ms(M.latency_p50_ms)], " per document."])
      ]);
      duo.appendChild(el("div", { "class": "card side" }, [
        el("h3", null, [el("span", { "class": "dot", style: "background:" + s[2] }), s[1]]),
        el("p", { "class": "sub", text: d(nf) + " flags raised (threshold " + d(M.threshold) + ", chosen on dev)" }),
        waffle,
        el("div", { "class": "wlegend" }, [
          el("span", null, [el("i", { style: "background:var(--good)" }), "real error (" + d(tp) + ")"]),
          el("span", null, [el("i", { style: "background:var(--bad)" }), "false alarm (" + d(fp) + ")"]),
          el("span", null, [el("i", { style: "border:2px dashed var(--miss)" }), "missed (" + (isNum(E) && isNum(tp) ? E - tp : DASH) + ")"])
        ]),
        facts
      ]));
    });
    var D = m.drex || {}, L = m.llm || {};
    var x = isNum(L.n_flagged) && isNum(D.n_flagged) && D.n_flagged ? (L.n_flagged / D.n_flagged).toFixed(1) : null;
    clear($("bottomline")).appendChild(say("p", [["b", "Bottom line: "], "both models find most of the hidden errors (",
      ["drex", "Drex " + d(D.errors_found) + "/" + d(E)], ", ", ["llm", "baseline " + d(L.errors_found) + "/" + d(E)],
      "). The difference is the reviewer's time: the baseline asks them to check ", ["b", d(L.n_flagged) + " documents"],
      ", Drex asks for ", ["b", d(D.n_flagged)], x ? ", " + x + "× fewer, while finding more." : "."], { style: "margin:0" }));
  }

  // ---------- 5. budget ----------
  function budget(m) {
    var D = m.drex || {}, L = m.llm || {};
    clear($("budget-lead")).appendChild(say("span", ["Sort the documents by flag score and check them from the top. After K documents, how many hidden errors have you found? ",
      "With time for 20: ", ["drex", "Drex " + n1(get(D.budget_curve, "20"))], " vs ", ["llm", "baseline " + n1(get(L.budget_curve, "20"))], "."]));
    var w = clear($("why-llm"));
    w.appendChild(el("h4", { text: "Why is the baseline's line almost straight?" }));
    w.appendChild(say("p", ["It said it was ", ["b", "100% confident on " + d(m.llm_conf_100_count) + " of " + d(m.n_docs)],
      " documents. When nearly every answer is “100% sure”, its flags can't be put in a useful order, so its top 20 is close to a random 20 of its flags."]));
    w.appendChild(say("p", [["drex", "Drex"], " returns a probability for every class, so its scores spread out and the clearest mistakes rise to the top: ",
      ["b", n1(get(D.budget_curve, "5")) + " of its top 5"], " and ", ["b", n1(get(D.budget_curve, "10")) + " of its top 10"], " are real errors."]));
    w.appendChild(el("p", { style: "font-size:12px;color:var(--ink-3);margin:0", text: "Tied scores are counted as if broken at random (expected value), which is why the baseline can show fractions." }));
    chart(m);
  }

  function chart(m) {
    var b = clear($("chart")), D = get(m.drex, "curve"), L = get(m.llm, "curve"), n = m.n_planted_errors_test;
    if (!Array.isArray(D) || !Array.isArray(L)) {
      b.appendChild(el("img", { src: "../results/charts/budget_curve.png", alt: "Budget curve", style: "width:100%" }));
      return;
    }
    b.appendChild(el("div", { "class": "legend" }, [
      el("span", null, [el("span", { "class": "dot", style: "background:var(--drex)" }), "Drex"]),
      el("span", null, [el("span", { "class": "dot", style: "background:var(--llm)" }), "Local LLM baseline"]),
      el("span", null, [el("span", { style: "width:14px;border-top:1.5px dashed var(--ink-3);display:inline-block" }), d(n) + " hidden errors in test"])
    ]));
    var W = 760, H = 330, P = { l: 40, r: 64, t: 14, b: 44 };
    var kMax = Math.max(D.length, L.length) - 1, yMax = Math.max(isNum(n) ? n : 0, D[kMax] || 0) + 2;
    function X(k) { return P.l + k / kMax * (W - P.l - P.r); }
    function Y(v) { return H - P.b - v / yMax * (H - P.t - P.b); }
    var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Hidden errors found versus documents checked, Drex versus baseline" });
    for (var g = 0; g <= yMax; g += 5) {
      s.appendChild(svg("line", { x1: P.l, x2: W - P.r, y1: Y(g), y2: Y(g), stroke: "var(--line)" }));
      var t = svg("text", { x: P.l - 8, y: Y(g) + 4, "text-anchor": "end", "font-size": 11, fill: "var(--ink-3)" }); t.textContent = g; s.appendChild(t);
    }
    for (var k = 0; k <= kMax; k += 10) {
      var tx = svg("text", { x: X(k), y: H - P.b + 18, "text-anchor": "middle", "font-size": 11, fill: "var(--ink-3)" }); tx.textContent = k; s.appendChild(tx);
    }
    var xl = svg("text", { x: (P.l + W - P.r) / 2, y: H - 6, "text-anchor": "middle", "font-size": 12, fill: "var(--ink-2)" });
    xl.textContent = "Documents checked, most suspicious first"; s.appendChild(xl);
    if (isNum(n)) s.appendChild(svg("line", { x1: P.l, x2: W - P.r, y1: Y(n), y2: Y(n), stroke: "var(--ink-3)", "stroke-dasharray": "5 4" }));
    s.appendChild(svg("line", { x1: X(20), x2: X(20), y1: P.t, y2: H - P.b, stroke: "var(--ink-3)", "stroke-width": 1, opacity: .35 }));
    var lb = svg("text", { x: X(20) + 4, y: P.t + 10, "font-size": 11, fill: "var(--ink-3)" }); lb.textContent = "budget of 20"; s.appendChild(lb);
    function path(a) { return a.map(function (v, i) { return (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); }).join(" "); }
    [[L, "var(--llm)", "Baseline"], [D, "var(--drex)", "Drex"]].forEach(function (sr) {
      s.appendChild(svg("path", { d: path(sr[0]), fill: "none", stroke: sr[1], "stroke-width": 2.5, "stroke-linejoin": "round", "stroke-linecap": "round" }));
      var last = sr[0].length - 1, lab = svg("text", { x: X(last) + 6, y: Y(sr[0][last]) + 4, "font-size": 12, "font-weight": 600, fill: "var(--ink)" });
      lab.textContent = n1(sr[0][last]); s.appendChild(lab);
    });
    var cross = svg("line", { y1: P.t, y2: H - P.b, stroke: "var(--ink-3)", opacity: 0 });
    var md = svg("circle", { r: 5, fill: "var(--drex)", stroke: "var(--surface)", "stroke-width": 2, opacity: 0 });
    var ml = svg("circle", { r: 5, fill: "var(--llm)", stroke: "var(--surface)", "stroke-width": 2, opacity: 0 });
    s.appendChild(cross); s.appendChild(ml); s.appendChild(md);
    var hit = svg("rect", { x: P.l, y: P.t, width: W - P.l - P.r, height: H - P.t - P.b, fill: "transparent" });
    s.appendChild(hit); b.appendChild(s);
    var tip = el("div", { "class": "tip" }); b.appendChild(tip);
    hit.addEventListener("mousemove", function (ev) {
      var r = s.getBoundingClientRect(), br = b.getBoundingClientRect();
      var k = Math.max(0, Math.min(kMax, Math.round(((ev.clientX - r.left) / r.width * W - P.l) / (W - P.l - P.r) * kMax)));
      [cross, md, ml].forEach(function (e) { e.setAttribute("opacity", 1); });
      cross.setAttribute("x1", X(k)); cross.setAttribute("x2", X(k));
      md.setAttribute("cx", X(k)); md.setAttribute("cy", Y(D[k])); ml.setAttribute("cx", X(k)); ml.setAttribute("cy", Y(L[k]));
      tip.textContent = "After " + k + " checked: Drex " + n1(D[k]) + " · baseline " + n1(L[k]);
      tip.style.left = (X(k) / W * r.width + r.left - br.left) + "px";
      tip.style.top = (Y(Math.max(D[k], L[k])) / H * r.height + r.top - br.top) + "px";
      tip.style.opacity = 1;
    });
    hit.addEventListener("mouseleave", function () { [cross, md, ml].forEach(function (e) { e.setAttribute("opacity", 0); }); tip.style.opacity = 0; });
  }

  // ---------- 6. queue ----------
  function queue(m) {
    var b = clear($("flags")), flags = (m.top_flags || []).slice(0, 20);
    b.appendChild(el("div", { "class": "row head" }, ["#", "Doc", "Filed as → Drex says", "Score", "Truth"].map(function (h) { return el("div", { text: h }); })));
    flags.forEach(function (f, i) {
      f = f || {};
      var row = el("div", { "class": "row", tabindex: "0", role: "button", "aria-label": "Flag " + (i + 1) + ", " + d(f.doc_id) }, [
        el("div", { "class": "rank", text: String(i + 1) }),
        el("div", { "class": "mono", style: "font-size:13px", text: d(f.doc_id) }),
        el("div", { "class": "labels" }, [el("span", { "class": "chip given", text: d(f.given_label) }),
          el("span", { style: "color:var(--ink-3)", text: "→" }), el("span", { "class": "chip top", text: d(f.drex_top) })]),
        el("div", { style: "font-variant-numeric:tabular-nums;font-size:13px", text: isNum(f.flag_score) ? f.flag_score.toFixed(3) : DASH }),
        f.flipped === true ? el("span", { "class": "badge hit", text: "✓ Planted error" })
          : f.flipped === false ? el("span", { "class": "badge miss", text: "False alarm" }) : el("span", { text: DASH })
      ]);
      function open() {
        Array.prototype.forEach.call(b.querySelectorAll(".row.active"), function (r) { r.classList.remove("active"); });
        row.classList.add("active"); detail(f);
      }
      row.addEventListener("click", open);
      row.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
      b.appendChild(row);
      if (i === 0) open();
    });
    var hits = flags.filter(function (f) { return f && f.flipped === true; }).length;
    b.appendChild(el("div", { style: "padding:12px 16px;font-size:13px;color:var(--ink-2);border-top:1px solid var(--line)",
      text: hits + " of these " + flags.length + " flags are planted errors; " + (flags.length - hits) + " are false alarms." }));
  }

  function detail(f) {
    var b = clear($("detail")), pre = el("pre", { "class": "ocr", style: "height:auto;max-height:200px;-webkit-mask-image:none;mask-image:none" , text: "Loading…" });
    b.appendChild(el("div", { "class": "dhead" }, [el("h3", { "class": "mono", text: d(f.doc_id) }),
      f.flipped === true ? el("span", { "class": "badge hit", text: "✓ Planted error" })
        : f.flipped === false ? el("span", { "class": "badge miss", text: "False alarm" }) : null]));
    b.appendChild(say("p", ["Filed as ", ["b", d(f.given_label)], "; Drex says ", ["drex", d(f.drex_top)],
      " (flag score " + (isNum(f.flag_score) ? f.flag_score.toFixed(4) : DASH) + ")."]));
    b.appendChild(scanImg(f.doc_id));
    b.appendChild(probBars(f.drex_probs, f.given_label));
    var v = verdict(f); if (v) { v.style.marginTop = "12px"; b.appendChild(v); }
    var det = el("details", { style: "margin-top:10px" }, [el("summary", { style: "cursor:pointer;font-size:13px;color:var(--ink-2)", text: "Text NDI read from this scan" }), pre]);
    b.appendChild(det);
    ocrInto(pre, f.doc_id);
  }

  // ---------- 7. limits ----------
  function limits(m) {
    var D = m.drex || {}, L = m.llm || {}, E = m.n_planted_errors_test;
    var fa = (m.top_flags || []).filter(function (f) { return f && f.flipped === false; })[0];
    var c = clear($("limit-cards"));
    function card(t, parts) { c.appendChild(el("div", { "class": "card" }, [el("h4", { text: t }), say("p", parts)])); }
    card("Drex makes its own mistakes", ["Drex labels ", ["b", pct(D.accuracy_vs_true, 1)], " of test pages correctly. Its ",
      ["b", d(D.false_alarms) + " false alarms"], " are pages it misread", fa ? ": for example " : ".",
      fa ? ["b", d(fa.doc_id)] : "", fa ? " is correctly filed as a " + d(fa.given_label) + ", but Drex said " + d(fa.drex_top) + " (" + pct(get(fa.drex_probs, fa.drex_top)) + ")." : ""]);
    card("The errors are planted", ["We flipped labels at random. Real-world label mistakes are often subtler (a report filed as a memo by a tired annotator), so these numbers show the method works on clear-cut errors, not how often real errors occur."]);
    card("A small sample", ["The test split has ", ["b", d(m.n_test) + " documents and " + d(E) + " errors"],
      ", so each error is worth about " + (isNum(E) && E ? (100 / E).toFixed(0) : DASH) + " points of recall. Treat the percentages as rough."]);
    card("A modest baseline", ["The baseline is a small open model (llama3.2) running on a laptop, not a frontier LLM. It labels ",
      ["b", pct(L.accuracy_vs_true, 1)], " of pages correctly. A stronger LLM would likely do better."]);
    card("Old, narrow data", ["RVL-CDIP is 1990s scans from tobacco-industry archives, in six document types. Modern documents may behave differently."]);
    card("Cost not reported", [isNum(D.cost_per_1k_docs) ? "Drex costs about $" + D.cost_per_1k_docs + " per 1,000 documents."
      : "Drex is billed per input token, but the per-token price isn't set in config.py yet, so this page doesn't quote a cost."]);
  }

  function foot(m) {
    $("foot").textContent = "Every number on this page is read live from results/metrics.json (test split, " + d(m.n_test) +
      " documents; threshold chosen on " + d(m.n_dev) + " dev documents). Pipeline: RVL-CDIP scans → NDI parse → Drex / local LLM → src/score.py.";
  }

  function navSpy() {
    if (!("IntersectionObserver" in window)) return;
    var links = {};
    Array.prototype.forEach.call(document.querySelectorAll("nav a"), function (a) { links[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (e.isIntersecting) {
          Object.keys(links).forEach(function (k) { links[k].classList.remove("on"); });
          if (links[e.target.id]) links[e.target.id].classList.add("on");
        }
      });
    }, { rootMargin: "-40% 0px -55% 0px" });
    Object.keys(links).forEach(function (id) { var s = $(id); if (s) io.observe(s); });
  }

  function load() {
    fetch("../results/metrics.json")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (m) {
        m = m || {};
        [hero, setup, example, results, budget, queue, limits, foot].forEach(function (f) {
          try { f(m); } catch (e) { console.error(f.name, e); }
        });
        navSpy();
      })
      .catch(function (e) {
        var hint = location.protocol === "file:" ? " Open via a server: run python3 -m http.server in the repo root, then go to /demo/." : "";
        clear($("answer")).appendChild(el("span", { "class": "err", text: "Could not load results/metrics.json (" + e.message + ")." + hint }));
      });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})();
