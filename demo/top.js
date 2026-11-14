// Cuckoo demo page. Plain JS, no libraries. All figures come from ../results/metrics.json
// or from the live /api/analyze endpoint (src/app.py). Text is inserted with textContent only.
(function () {
  "use strict";
  var DASH = "–", CLASSES = [];
  var ICON = { invoice: "🧾", letter: "✉️", form: "📝", resume: "👤", report: "📊", memo: "📌" };

  // ---------- helpers ----------
  function isNum(v) { return typeof v === "number" && isFinite(v); }
  function d(v) { return v === null || v === undefined ? DASH : String(v); }
  function pct(v) { return isNum(v) ? Math.round(v * 100) + "%" : DASH; }
  function secs(ms) { return isNum(ms) ? (ms < 1000 ? Math.round(ms) + " ms" : (ms / 1000).toFixed(1) + " s") : DASH; }
  function n1(v) { return isNum(v) ? String(+v.toFixed(1)) : DASH; }
  function $(id) { return document.getElementById(id); }
  function clear(b) { while (b.firstChild) b.removeChild(b.firstChild); return b; }
  function el(tag, a, kids) {
    var e = document.createElement(tag);
    for (var k in a || {}) {
      if (k === "text") e.textContent = a[k];
      else if (k === "class") e.className = a[k];
      else if (k === "style") e.style.cssText = a[k];
      else e.setAttribute(k, a[k]);
    }
    (kids || []).forEach(function (c) { if (c !== null && c !== undefined && c !== false) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  function B(t, style) { return el("b", style ? { text: t, style: style } : { text: t }); }
  function bar(frac, color) {
    return el("div", { "class": "bar" }, [el("i", { style: "width:" + Math.max(2, Math.min(100, (frac || 0) * 100)).toFixed(1) + "%;background:" + color })]);
  }
  function svg(tag, a) { var e = document.createElementNS("http://www.w3.org/2000/svg", tag); for (var k in a || {}) e.setAttribute(k, a[k]); return e; }
  function aAn(w) { return /^[aeiou]/i.test(w || "") ? "an " + w : "a " + w; }

  // ---------- hero pills ----------
  function pills(m) {
    var A = m.overall_accuracy || {}, S = m.speed || {}, D = m.drex || {}, L = m.llm || {};
    var x = isNum(S.llm_mean_ms) && isNum(S.drex_mean_ms) && S.drex_mean_ms ? (S.llm_mean_ms / S.drex_mean_ms).toFixed(1) + "×" : DASH;
    var p = clear($("pills"));
    [[pct(A.drex), "vs " + pct(A.llm), "documents correctly identified: Drex vs the LLM"],
     [x, "faster", "Drex's average answer time (" + secs(S.drex_mean_ms) + " vs " + secs(S.llm_mean_ms) + ")"],
     [n1((D.budget_curve || {})["20"]), "vs " + n1((L.budget_curve || {})["20"]), "real mistakes found when checking only the top 20 warnings"]
    ].forEach(function (x) {
      p.appendChild(el("div", { "class": "pill" }, [el("div", { "class": "v" }, [x[0] + " ", el("span", { text: x[1] })]), el("div", { "class": "l", text: x[2] })]));
    });
  }

  // ---------- 1. try it ----------
  var queue = [], apiOk = false;
  function initTry(m) {
    $("classes").textContent = CLASSES.join(", ");
    var drop = $("drop"), picker = $("picker");
    drop.addEventListener("click", function (e) { if (e.target !== picker) picker.click(); });
    drop.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); picker.click(); } });
    picker.addEventListener("change", function () { add(picker.files); picker.value = ""; });
    ["dragenter", "dragover"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add("over"); }); });
    ["dragleave", "drop"].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.remove("over"); }); });
    drop.addEventListener("drop", function (e) { add(e.dataTransfer.files); });
    Array.prototype.forEach.call(document.querySelectorAll("[data-sample]"), function (b) {
      b.addEventListener("click", function () {
        fetch("../data/raw/scans/" + b.dataset.sample + ".png").then(function (r) { if (!r.ok) throw new Error(); return r.blob(); })
          .then(function (blob) { add([new File([blob], "sample-" + b.dataset.sample + ".png", { type: "image/png" })], b.dataset.filed); })
          .catch(function () { status("Sample scans aren't available here (data/raw is local only).", true); });
      });
    });
    $("go").addEventListener("click", run);
    fetch("/api/health").then(function (r) { return r.json(); }).then(function (h) { apiOk = !!(h && h.ok); render(); })
      .catch(function () { apiOk = false; render(); });
  }
  function status(msg, warn) {
    var s = clear($("status"));
    if (msg) s.appendChild(el("div", { "class": warn ? "offline" : "hint", text: msg }));
  }
  function add(files, filed) {
    Array.prototype.forEach.call(files || [], function (f) {
      if (!/\.(pdf|png|jpe?g|tiff?|webp)$/i.test(f.name)) { status("Skipped " + f.name + ": use PDF, PNG, JPG, TIFF or WEBP.", true); return; }
      if (f.size > 15 * 1024 * 1024) { status("Skipped " + f.name + ": larger than 15 MB.", true); return; }
      queue.push({ file: f, filed: filed || "", url: /^image\/(png|jpe?g|webp)/.test(f.type) ? URL.createObjectURL(f) : null });
    });
    render();
  }
  function render() {
    var box = clear($("files"));
    queue.forEach(function (q, i) {
      var sel = el("select", { "aria-label": "Filed as" }, [el("option", { value: "", text: "Filed as… (optional)" })]
        .concat(CLASSES.map(function (c) { var o = el("option", { value: c, text: "Filed as " + c }); if (c === q.filed) o.selected = true; return o; })));
      sel.addEventListener("change", function () { q.filed = sel.value; });
      var x = el("button", { "class": "x", "aria-label": "Remove", text: "×" });
      x.addEventListener("click", function () { queue.splice(i, 1); render(); });
      box.appendChild(el("div", { "class": "file" }, [el("div", { "class": "fi" }, [q.url ? el("img", { src: q.url, alt: "" }) : "📄"]),
        el("div", { "class": "nm", text: q.file.name }), sel, x]));
    });
    $("go").disabled = !queue.length || !apiOk;
    $("go").textContent = queue.length > 1 ? "Analyze " + queue.length + " documents" : "Analyze";
    if (!apiOk) {
      var s = clear($("status"));
      s.appendChild(el("div", { "class": "offline" }, ["Live analysis needs the Cuckoo app running. In the repo folder run ",
        el("code", { text: "python src/app.py" }), " and open ", el("code", { text: "http://localhost:8000/demo/" }), "."]));
    }
  }
  function b64(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(",")[1]); };
      r.onerror = rej; r.readAsDataURL(file);
    });
  }
  function run() {
    var items = queue.slice(); queue = []; render();
    var out = $("out"); if (out.querySelector(".placeholder")) clear(out);
    var flagged = 0, done = 0;
    status("Analyzing " + items.length + " document" + (items.length > 1 ? "s" : "") + "…");
    var chain = Promise.resolve();
    items.forEach(function (q) {
      var card = el("div", { "class": "res" }, [el("div", { "class": "top" }, [
        el("div", { "class": "fi" }, [q.url ? el("img", { src: q.url, alt: "" }) : "📄"]),
        el("div", { "class": "meta" }, [el("div", { text: q.file.name }), el("div", null, [el("span", { "class": "spinner" }), " reading the page with NDI, then asking both models…"])])])]);
      out.insertBefore(card, out.firstChild);
      chain = chain.then(function () {
        return b64(q.file).then(function (data) {
          return fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: q.file.name, data: data, filed_as: q.filed }) });
        }).then(function (r) { return r.json(); })
          .then(function (r) { if (showResult(card, q, r)) flagged++; })
          .catch(function (e) { showResult(card, q, { error: String(e) }); })
          .then(function () {
            done++;
            status(done < items.length ? "Analyzed " + done + " of " + items.length + "…"
              : "Done. " + items.length + " document" + (items.length > 1 ? "s" : "") + " analyzed" +
                (flagged ? "; " + flagged + " look" + (flagged > 1 ? "" : "s") + " mislabeled." : "."));
          });
      });
    });
  }
  function showResult(card, q, r) {
    var top = card.querySelector(".top"), meta = top.querySelector(".meta div:last-child");
    while (top.nextSibling) card.removeChild(top.nextSibling);
    if (r.error) { meta.textContent = "Couldn't analyze: " + r.error; return false; }
    if (r.empty_text) { meta.textContent = "NDI found no readable text on page 1, so neither model can judge it."; return false; }
    meta.textContent = "Page read by NDI in " + secs(r.ndi_ms) + (q.filed ? " · filed as " + q.filed : " · no label given");
    var D = r.drex || {}, L = r.llm || {};
    // verdict, in plain words
    var v, isFlag = false;
    if (q.filed && D.top) {
      var llmAgree = L.top ? (L.top === D.top ? " The LLM agrees." : " The LLM says " + L.top + ".") : "";
      if (D.top !== q.filed && D.confidence >= 0.95) {
        isFlag = true;
        v = ["bad", "⚠️", "Probably mislabeled. It's filed as " + aAn(q.filed) + ", but it reads like " + aAn(D.top) + ".",
             "Drex is " + pct(D.confidence) + " sure. Worth a human check." + llmAgree];
      } else if (D.top !== q.filed) {
        v = ["warn", "🤔", "Maybe mislabeled. Drex leans towards " + D.top + " (" + pct(D.confidence) + " sure), not " + q.filed + ".",
             "Not confident enough to raise a flag." + llmAgree];
      } else {
        v = ["good", "✅", "The label looks right. Drex agrees it's " + aAn(q.filed) + " (" + pct(D.confidence) + " sure).", llmAgree.trim()];
      }
    } else if (D.top) {
      v = ["info", "🔎", "Drex thinks this is " + aAn(D.top) + " (" + pct(D.confidence) + " sure).",
           (L.top ? "The LLM thinks it's " + aAn(L.top) + ". " : "") + "Pick a 'filed as' label to check a label."];
    } else {
      v = ["warn", "⚠️", "Drex couldn't answer: " + d(D.error), ""];
    }
    card.appendChild(el("div", { "class": "verdict " + v[0] }, [el("span", { "class": "e", text: v[1] }), el("div", null, [v[2], v[3] ? el("small", { text: v[3] }) : null])]));
    function side(cls, name, sw, R, color) {
      return el("div", { "class": cls }, [el("span", { "class": "who" }, [el("span", { "class": "sw " + sw }), name]),
        el("div", { "class": "ans", text: R.top || "no answer" }),
        el("div", { "class": "conf", text: R.error ? R.error : (isNum(R.confidence) ? pct(R.confidence) + " sure" : "") }),
        isNum(R.confidence) ? bar(R.confidence, color) : null]);
    }
    card.appendChild(el("div", { "class": "vs" }, [side("d", "Drex", "d", D, "var(--drex)"), side("l", "LLM (" + d(L.model) + ")", "l", L, "var(--llm)")]));
    if (isNum(D.latency_ms) && isNum(L.latency_ms)) {
      var mx = Math.max(D.latency_ms, L.latency_ms), faster = D.latency_ms <= L.latency_ms;
      var ratio = (faster ? L.latency_ms / Math.max(1, D.latency_ms) : D.latency_ms / Math.max(1, L.latency_ms)).toFixed(1);
      var lanes = [];
      var race = el("div", { "class": "race" }, [el("div", { "class": "head" }, ["⏱ Answer time: ", el("span", { text: (faster ? "Drex" : "The LLM") + " was " + ratio + "× faster" })])]);
      [["Drex", D.latency_ms, "var(--drex)"], ["LLM", L.latency_ms, "var(--llm)"]].forEach(function (x) {
        var i = el("i", { style: "background:" + x[2] }); lanes.push([i, x[1] / mx]);
        race.appendChild(el("div", { "class": "row" }, [el("span", { text: x[0] }), el("div", { "class": "lane" }, [i]), el("span", { "class": "t", text: secs(x[1]) })]));
      });
      card.appendChild(race);
      requestAnimationFrame(function () { requestAnimationFrame(function () { lanes.forEach(function (l) { l[0].style.width = (l[1] * 100).toFixed(1) + "%"; }); }); });
    }
    return isFlag;
  }

  // ---------- 2. head to head ----------
  function compare(m) {
    var D = m.drex || {}, L = m.llm || {}, A = m.overall_accuracy || {}, S = m.speed || {}, E = m.n_planted_errors_test;
    clear($("compare-intro")).append("Both models saw only the page, never the label. We had secretly given ", B(d(m.n_planted_errors_total) + " documents the wrong label"),
      " to see who would catch them. Six ways to compare:");
    var g = clear($("scores"));
    function card(c, cs, ic, title, ask, a, b, fmt, higher, max, take) {
      var win = isNum(a) && isNum(b) && a !== b ? ((a > b) === higher ? "Drex" : "LLM") : null;
      var mx = max || Math.max(a || 0, b || 0) || 1;
      g.appendChild(el("div", { "class": "card sc", style: "--c:" + c + ";--cs:" + cs }, [
        win ? el("span", { "class": "win", text: win + " wins" }) : null,
        el("div", { "class": "q" }, [el("div", { "class": "ic", text: ic }), el("h3", { text: title })]),
        el("p", { "class": "ask", text: ask }),
        el("div", { "class": "line" }, [el("span", { "class": "who" }, [el("span", { "class": "sw d" }), "Drex"]), bar(a / mx, "var(--drex)"), el("span", { "class": "n", text: fmt(a) })]),
        el("div", { "class": "line" }, [el("span", { "class": "who" }, [el("span", { "class": "sw l" }), "LLM"]), bar(b / mx, "var(--llm)"), el("span", { "class": "n", text: fmt(b) })]),
        el("p", { "class": "take" }, take)
      ]));
    }
    var tot = m.n_docs;
    card("var(--drex)", "var(--drex-soft)", "🎯", "Gets the document type right", "Out of " + d(tot) + " documents, how many did it identify correctly?",
      A.drex, A.llm, pct, true, 1, [B(pct(A.drex)), " vs ", B(pct(A.llm)), ". Drex misidentifies about 1 in " + (isNum(A.drex) ? Math.round(1 / (1 - A.drex)) : DASH) + ", the LLM about 1 in " + (isNum(A.llm) ? Math.round(1 / (1 - A.llm)) : DASH) + "."]);
    card("var(--violet)", "#ede9fe", "🕵️", "Finds the hidden mistakes", "Of the " + d(E) + " wrong labels in the test set, how many did it catch?",
      D.errors_found, L.errors_found, function (v) { return d(v) + " / " + d(E); }, true, E, ["Both catch most of them: ", B(d(D.errors_found)), " vs ", B(d(L.errors_found)), "."]);
    card("var(--good)", "var(--good-soft)", "🤝", "Its warnings can be trusted", "When it says “this label is wrong”, how often is it right?",
      D.precision, L.precision, pct, true, 1, ["Drex is right ", B(pct(D.precision)), " of the time. The LLM only ", B(pct(L.precision)), ": most of its warnings are false."]);
    card("var(--bad)", "var(--bad-soft)", "🗑️", "Wasted checks", "How many correct documents did it wrongly flag?",
      D.false_alarms, L.false_alarms, d, false, null, ["The LLM sends a reviewer to check ", B(d(L.false_alarms)), " fine documents. Drex: ", B(d(D.false_alarms)), "."]);
    card("var(--teal)", "#ccfbf1", "📋", "Best use of 20 minutes", "If a person checks only the top 20 warnings, how many real mistakes do they find?",
      (D.budget_curve || {})["20"], (L.budget_curve || {})["20"], n1, true, E, [B(n1((D.budget_curve || {})["20"])), " real mistakes with Drex, about ", B(n1((L.budget_curve || {})["20"])), " with the LLM."]);
    card("var(--llm)", "var(--llm-soft)", "⚡", "Speed per document", "Average time to answer one document.",
      S.drex_mean_ms, S.llm_mean_ms, secs, false, null, ["Drex answers in ", B(secs(S.drex_mean_ms)), " on average, the LLM in ", B(secs(S.llm_mean_ms)), "."]);
    speed(m);
  }

  function speed(m) {
    var S = m.speed || {}, dl = (S.drex_ms || []).slice().sort(function (a, b) { return a - b; }), ll = (S.llm_ms || []).slice().sort(function (a, b) { return a - b; });
    var box = clear($("strip"));
    if (dl.length && ll.length) {
      var W = 640, H = 170, P = { l: 58, r: 16, t: 14, b: 36 };
      var lo = 100, hi = Math.max(dl[dl.length - 1], ll[ll.length - 1]) * 1.1;
      function X(v) { return P.l + (Math.log(Math.max(v, lo)) - Math.log(lo)) / (Math.log(hi) - Math.log(lo)) * (W - P.l - P.r); }
      var s = svg("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Answer time for every document, Drex vs LLM" });
      [100, 200, 500, 1000, 2000, 5000, 10000].filter(function (t) { return t <= hi; }).forEach(function (t) {
        s.appendChild(svg("line", { x1: X(t), x2: X(t), y1: P.t, y2: H - P.b, stroke: "var(--line)" }));
        var tx = svg("text", { x: X(t), y: H - P.b + 16, "text-anchor": "middle", "font-size": 11, fill: "var(--ink-3)" }); tx.textContent = secs(t); s.appendChild(tx);
      });
      var lab = svg("text", { x: (P.l + W - P.r) / 2, y: H - 4, "text-anchor": "middle", "font-size": 11.5, fill: "var(--ink-2)" }); lab.textContent = "time to answer one document (log scale)"; s.appendChild(lab);
      [[dl, 52, "var(--drex)", "Drex"], [ll, 112, "var(--llm)", "LLM"]].forEach(function (row) {
        var t = svg("text", { x: 4, y: row[1] + 4, "font-size": 12.5, "font-weight": 700, fill: row[2] }); t.textContent = row[3]; s.appendChild(t);
        row[0].forEach(function (v, i) {
          s.appendChild(svg("circle", { cx: X(v).toFixed(1), cy: (row[1] + ((i * 7919) % 23) - 11).toFixed(1), r: 3, fill: row[2], opacity: .55 }));
        });
        var med = row[0][Math.floor(row[0].length / 2)];
        s.appendChild(svg("line", { x1: X(med), x2: X(med), y1: row[1] - 18, y2: row[1] + 18, stroke: "var(--ink)", "stroke-width": 2 }));
      });
      box.appendChild(s);
      box.appendChild(el("p", { style: "font-size:12.5px;color:var(--ink-3);margin:6px 0 0", text: "Black tick = the typical (median) document." }));
    }
    function q(arr, p) { return arr.length ? arr[Math.min(arr.length - 1, Math.round(p * (arr.length - 1)))] : null; }
    var f = clear($("speedfacts"));
    function fact(e, bg, kids) { f.appendChild(el("li", null, [el("span", { "class": "e", style: "background:" + bg, text: e }), el("div", null, kids)])); }
    fact("🏁", "var(--good-soft)", ["Drex answered faster on ", B(d(S.drex_faster_count) + " of " + d(S.n)), " documents."]);
    fact("🐢", "var(--llm-soft)", ["The LLM's slowest 10% took over ", B(secs(q(ll, 0.9))), " each. Drex's slowest 10%: over ", B(secs(q(dl, 0.9))), "."]);
    fact("⏳", "var(--drex-soft)", ["For 1,000 documents, one at a time: about ", B(Math.round(S.drex_mean_ms * 1000 / 60000) + " min"), " with Drex vs ", B(Math.round(S.llm_mean_ms * 1000 / 60000) + " min"), " with the LLM."]);
    var sp = S.short_pages || {}, lp = S.long_pages || {};
    fact("📈", "#ede9fe", ["Longer pages slow the LLM down: its typical time goes from ", B(secs(sp.llm_median_ms)), " on shorter pages to ",
      B(secs(lp.llm_median_ms)), " on longer ones. Drex barely changes (", B(secs(sp.drex_median_ms)), " → ", B(secs(lp.drex_median_ms)), ")."]);
    $("fair").textContent = "Fairness note: " + (S.note || "") + " Timings exclude NDI reading time, which is the same for both.";
  }

  // ---------- 3. categories ----------
  function categories(m) {
    var pc = m.per_class || {}, g = clear($("cats"));
    var mx = 0;
    Object.keys(pc).forEach(function (c) { mx = Math.max(mx, pc[c].n_true, pc[c].drex_pred, pc[c].llm_pred); });
    CLASSES.forEach(function (c) {
      var x = pc[c]; if (!x) return;
      function line(name, v, color) { return el("div", { "class": "line" }, [el("span", { text: name }), bar(v / mx, color), el("span", { "class": "n", text: d(v) })]); }
      g.appendChild(el("div", { "class": "card cat" }, [
        el("h4", null, [el("span", { text: ICON[c] || "📄" }), c + "s"]),
        line("Really", x.n_true, "#94a3b8"), line("Drex said", x.drex_pred, "var(--drex)"), line("LLM said", x.llm_pred, "var(--llm)"),
        el("div", { "class": "right" }, ["Got right: ", B("Drex " + x.drex_correct, null), "/" + x.n_true + " · ", B("LLM " + x.llm_correct), "/" + x.n_true])
      ]));
      var bs = g.lastChild.querySelectorAll(".right b"); bs[0].className = "d"; bs[1].className = "l";
    });
    function bias(key) {
      var best = null;
      CLASSES.forEach(function (c) { var x = pc[c]; if (x && (!best || x[key] - x.n_true > pc[best][key] - pc[best].n_true)) best = c; });
      return best;
    }
    function weakest(key) {
      var w = null;
      CLASSES.forEach(function (c) { var x = pc[c]; if (x && (!w || x[key] < pc[w][key])) w = c; });
      return w;
    }
    var co = clear($("callouts")), bl = bias("llm_pred"), bd = bias("drex_pred"), wl = weakest("llm_correct"), wd = weakest("drex_correct");
    if (bl) co.appendChild(el("div", { "class": "callout l" }, ["🟠 ", B("The LLM over-uses “" + bl + "”: "), "it called " + pc[bl].llm_pred + " documents " + bl + "s when there were only " + pc[bl].n_true + ". It struggled most with " + wl + "s (" + pc[wl].llm_correct + " of " + pc[wl].n_true + " right)."]));
    if (bd) co.appendChild(el("div", { "class": "callout d" }, ["🔵 ", B("Drex is more even: "), "its biggest lean is towards " + bd + " (" + pc[bd].drex_pred + " vs " + pc[bd].n_true + "), and its hardest type was " + wd + "s (" + pc[wd].drex_correct + " of " + pc[wd].n_true + " right)."]));
  }

  // ---------- 4. verdict ----------
  function verdict(m) {
    var D = m.drex || {}, L = m.llm || {}, A = m.overall_accuracy || {}, S = m.speed || {}, E = m.n_planted_errors_test;
    var v = clear($("verdicts"));
    function vc(e, bg, title, kids) { v.appendChild(el("div", { "class": "card vcard" }, [el("div", { "class": "e", style: "background:" + bg, text: e }), el("div", null, [el("h3", { text: title }), el("p", null, kids)])])); }
    vc("🏆", "var(--good-soft)", "Drex is the better label checker", ["It knows what documents are more often (", B(pct(A.drex)), " vs ", B(pct(A.llm)), ") and its warnings are trustworthy (", B(pct(D.precision)), " right vs ", B(pct(L.precision)), ")."]);
    vc("⚡", "var(--drex-soft)", "And it's about twice as fast", ["Typical answer in ", B(secs(S.drex_median_ms)), " vs ", B(secs(S.llm_median_ms)), ". Faster on ", B(d(S.drex_faster_count) + " of " + d(S.n)), " documents."]);
    vc("🧹", "var(--llm-soft)", "The LLM wastes reviewers' time", ["To find ", B(d(L.errors_found) + " mistakes"), " it raises ", B(d(L.n_flagged) + " warnings"), ": ", B(d(L.false_alarms) + " are false"), ". Drex needs ", B(d(D.n_flagged)), " warnings to find ", B(d(D.errors_found)), "."]);
    vc("⚖️", "#ede9fe", "Honest limits", ["Drex still misreads some pages (", B(d(D.false_alarms) + " false alarms"), "). The mistakes were planted on purpose, the test had ", B(d(m.n_test) + " documents"), ", and the LLM is a small local model, not a frontier one."]);
    var flags = (m.top_flags || []).slice(0, 10), hits = flags.filter(function (f) { return f && f.flipped; }).length;
    $("queue-intro").textContent = "Drex's top " + flags.length + " warnings. " + hits + " of " + flags.length + " really were mislabeled. Click one to see the page.";
    var qb = clear($("queue"));
    flags.forEach(function (f, i) {
      var row = el("div", { "class": "q-row", tabindex: "0", role: "button" }, [
        el("span", { style: "color:var(--ink-3);font-weight:700", text: String(i + 1) }),
        el("div", { style: "display:flex;gap:6px;align-items:center;flex-wrap:wrap" }, [
          el("span", { "class": "chip old", text: d(f.given_label) }), el("span", { style: "color:var(--ink-3)", text: "→" }),
          el("span", { "class": "chip new", text: d(f.drex_top) }),
          el("span", { style: "color:var(--ink-3);font-size:13px", text: "Drex " + pct((f.drex_probs || {})[f.drex_top]) + " sure" })]),
        f.flipped ? el("span", { "class": "badge ok", text: "✓ Really mislabeled" }) : el("span", { "class": "badge no", text: "✗ False alarm" })
      ]);
      function open() {
        var inn = clear($("dlg-in"));
        inn.appendChild(el("p", { style: "margin:0 0 10px;font-weight:600" }, ["Filed as ", B(d(f.given_label)), ". Drex says ", B(d(f.drex_top), "color:var(--drex)"), ". " +
          (f.flipped ? "It really is " + aAn(f.true_label) + ": the label was wrong." : "It really is " + aAn(f.true_label) + ": the label was right, Drex misread it.")]));
        var img = el("img", { src: "../data/raw/scans/" + encodeURIComponent(f.doc_id) + ".png", alt: "Scanned page" });
        img.addEventListener("error", function () { img.replaceWith(el("p", { text: "Scan not available here (data/raw is local only)." })); });
        inn.appendChild(img);
        var close = el("button", { "class": "btn ghost", style: "margin-top:12px;width:100%", text: "Close" });
        close.addEventListener("click", function () { $("dlg").close(); });
        inn.appendChild(close);
        if ($("dlg").showModal) $("dlg").showModal();
      }
      row.addEventListener("click", open);
      row.addEventListener("keydown", function (e) { if (e.key === "Enter") open(); });
      qb.appendChild(row);
    });
    $("foot").textContent = "Data: " + d(m.n_docs) + " real scans from RVL-CDIP; " + d(m.n_planted_errors_total) + " labels deliberately flipped. " +
      "Mistake-finding numbers use the " + d(m.n_test) + "-document test split (threshold set on a separate " + d(m.n_dev) + "-document split). " +
      "Every figure on this page is read from results/metrics.json.";
  }

  function navSpy() {
    if (!("IntersectionObserver" in window)) return;
    var links = {};
    Array.prototype.forEach.call(document.querySelectorAll("nav a"), function (a) { links[a.getAttribute("href").slice(1)] = a; });
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { for (var k in links) links[k].classList.remove("on"); if (links[e.target.id]) links[e.target.id].classList.add("on"); } });
    }, { rootMargin: "-40% 0px -55% 0px" });
    for (var id in links) { var s = $(id); if (s) io.observe(s); }
  }

  function load() {
    fetch("../results/metrics.json").then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (m) {
        CLASSES = m.classes || ["invoice", "letter", "form", "resume", "report", "memo"];
        [pills, initTry, compare, categories, verdict].forEach(function (f) { try { f(m); } catch (e) { console.error(f.name, e); } });
        navSpy();
      })
      .catch(function (e) {
        clear($("pills")).appendChild(el("div", { "class": "pill", text: "Could not load results/metrics.json (" + e.message + "). Run python src/app.py and open http://localhost:8000/demo/." }));
      });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load); else load();
})();
