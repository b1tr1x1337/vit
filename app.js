/* Расписание ОГАПОУ «ВИТ» · by b1tr1x
   Этот файл менять не нужно. Расписания групп — в папке groups, список групп и звонки — в groups.js */
(function () {
  "use strict";
  if (typeof GROUPS === "undefined") { window.__showError("Файл <b>groups.js</b> устарел или повреждён."); return; }
  var BELLS_LIST = (typeof BELLS !== "undefined" && BELLS) || [];
  var NOTE = (typeof DAILY_NOTE !== "undefined" && DAILY_NOTE) || "";

  var DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  var SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  var WD = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  var MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  var CHEV = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>';

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function norm(s) { return String(s == null ? "" : s).toLowerCase().replace(/ё/g, "е").replace(/[\s\-–.,«»"]/g, ""); }
  function has(v) { return v !== "" && v != null; }
  var LS = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };

  // ---------- время (Москва = UTC+3, без перевода часов) ----------
  function moscowNow() {
    var d = new Date(Date.now() + 3 * 3600 * 1000);
    var p2 = function (n) { return (n < 10 ? "0" : "") + n; };
    return {
      date: d.getUTCFullYear() + "-" + p2(d.getUTCMonth() + 1) + "-" + p2(d.getUTCDate()),
      min: d.getUTCHours() * 60 + d.getUTCMinutes(),
      h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds(),
    };
  }
  function getNow() { return window.FAKE_NOW || moscowNow(); }
  function addDays(iso, n) { var d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function human(iso) { var a = iso.split("-"); return +a[2] + " " + MONTHS[+a[1] - 1]; }
  function toMin(t) { var a = String(t).trim().split(/[.:]/); return +a[0] * 60 + +(a[1] || 0); }
  function span(times) { return [toMin(times[0].split("-")[0]), toMin(times[times.length - 1].split("-")[1])]; }
  function hm(m) { var mm = m % 60; return Math.floor(m / 60) + ":" + (mm < 10 ? "0" : "") + mm; }
  function fmt(t) { return String(t).replace(/\./g, ":").replace("-", "–"); }
  function dur(m) { if (m < 60) return m + " мин"; var r = m % 60; return Math.floor(m / 60) + " ч" + (r ? " " + r + " мин" : ""); }
  function weekday(iso) { return (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7; }
  function rangeLabel(start) {
    var a = start.split("-"), b = addDays(start, 5).split("-");
    return a[1] === b[1] ? +a[2] + "–" + +b[2] + " " + MONTHS[+a[1] - 1]
      : +a[2] + " " + MONTHS[+a[1] - 1].slice(0, 3) + " – " + +b[2] + " " + MONTHS[+b[1] - 1].slice(0, 3);
  }

  var now = getNow();
  var S = { ent: null, weeks: [], wi: 0, di: 0, mode: LS.get("vit-mode") === "day" ? "day" : "week", filter: "all" };

  // ---------- данные групп ----------
  var store = {}, loading = {};
  window.addSchedule = function (id, weeks) {
    store[id] = (weeks || []).slice().sort(function (a, b) { return a.start < b.start ? -1 : a.start > b.start ? 1 : 0; });
  };
  var VER = Math.floor(Date.now() / 3e5);
  function loadGroup(id) {
    if (store[id]) return Promise.resolve();
    if (!loading[id]) loading[id] = new Promise(function (res) {
      var s = document.createElement("script");
      s.src = "groups/" + id + ".js?v=" + VER;
      s.onload = s.onerror = function () { res(); };
      document.body.appendChild(s);
    });
    return loading[id];
  }
  function loadAll() { return Promise.all(GROUPS.map(function (g) { return loadGroup(g.id); })); }
  function teachersOf(t) { return String(t || "").split(/\s*[\/;,]\s*/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function groupOf(id) { for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i].id === id) return GROUPS[i]; return null; }

  // ---------- что показываем: группа / преподаватель / кабинет ----------
  function hashOf(e) { return e.type === "group" ? e.id : (e.type === "teacher" ? "t=" : "r=") + e.name; }
  function parseHash(h) {
    try { h = decodeURIComponent(String(h || "").replace(/^#/, "")); } catch (err) { return null; }
    if (!h) return null;
    if (h.indexOf("t=") === 0) return { type: "teacher", name: h.slice(2) };
    if (h.indexOf("r=") === 0) return { type: "room", name: h.slice(2) };
    return groupOf(h) ? { type: "group", id: h } : null;
  }
  function myGroup() { var id = LS.get("vit-group"); return groupOf(id) ? id : (GROUPS.length === 1 ? GROUPS[0].id : null); }

  function buildWeeks(e) {
    if (e.type === "group") return store[e.id] || [];
    var map = {};
    GROUPS.forEach(function (g) {
      (store[g.id] || []).forEach(function (w) {
        if (!map[w.start]) map[w.start] = [[], [], [], [], [], []];
        var days = map[w.start];
        (w.days || []).forEach(function (d, i) {
          if (i > 5) return;
          (d || []).forEach(function (p) {
            if (!p.subject) return;
            var hit = e.type === "teacher" ? teachersOf(p.teacher).indexOf(e.name) >= 0 : String(p.room == null ? "" : p.room).trim() === e.name;
            if (hit) days[i].push(Object.assign({}, p, { groups: [g.name] }));
          });
        });
      });
    });
    return Object.keys(map).sort().map(function (start) {
      return {
        start: start,
        days: map[start].map(function (d) {
          d.sort(function (a, b) { return span(a.time)[0] - span(b.time)[0]; });
          var out = [];
          d.forEach(function (p) {
            var q = out[out.length - 1];
            if (q && q.time.join() === p.time.join() && q.subject === p.subject && q.room === p.room && q.teacher === p.teacher) q.groups = q.groups.concat(p.groups);
            else out.push(p);
          });
          return out;
        }),
      };
    });
  }

  function currentWeekIndex() {
    var i, w = S.weeks;
    for (i = 0; i < w.length; i++) if (now.date >= w[i].start && now.date <= addDays(w[i].start, 6)) return i;
    for (i = 0; i < w.length; i++) if (w[i].start > now.date) return i;
    return w.length - 1;
  }
  function defaultDay() {
    var w = S.weeks[S.wi]; if (!w) return 0;
    var i = weekday(now.date);
    if (i > 5 || addDays(w.start, i) !== now.date) return 0;
    var real = (w.days[i] || []).filter(function (p) { return p.subject; });
    var end = real.length ? span(real[real.length - 1].time)[1] : 0;
    return now.min >= end && i < 5 ? i + 1 : i;
  }

  var token = 0;
  function setEntity(e, opts) {
    opts = opts || {};
    S.ent = e;
    var my = ++token;
    var h = hashOf(e);
    if (parseHashRaw() !== h) { try { history.replaceState(null, "", "#" + encodeURIComponent(h)); } catch (err) { location.hash = h; } }
    if (e.type === "group") LS.set("vit-group", e.id);
    if (opts.mode) { S.mode = opts.mode; LS.set("vit-mode", S.mode); }
    renderTitle();
    $("view").innerHTML = '<p class="empty-msg">Загрузка…</p>';
    return (e.type === "group" ? loadGroup(e.id) : loadAll()).then(function () {
      if (my !== token) return;
      S.weeks = buildWeeks(e);
      S.wi = currentWeekIndex();
      S.di = defaultDay();
      render();
    });
  }
  function parseHashRaw() { try { return decodeURIComponent(location.hash.slice(1)); } catch (e) { return ""; } }

  // ---------- шапка и часы ----------
  function renderTitle() {
    var e = S.ent, kicker = "Расписание", title = "Выберите группу";
    if (e && e.type === "group") { var g = groupOf(e.id); kicker = g.course + " курс · группа"; title = g.name; }
    if (e && e.type === "teacher") { kicker = "Преподаватель"; title = e.name; }
    if (e && e.type === "room") { kicker = "Кабинет"; title = "Кабинет " + e.name; }
    $("kicker").textContent = kicker;
    $("titleText").textContent = title;
    document.title = e ? title + " · Расписание ВИТ" : "Расписание · ОГАПОУ «ВИТ»";
  }
  var lastMin = -1;
  function tick() {
    var real = moscowNow();
    var t = window.FAKE_NOW ? { h: Math.floor(window.FAKE_NOW.min / 60), m: window.FAKE_NOW.min % 60, s: real.s, date: window.FAKE_NOW.date } : real;
    $("clockHM").textContent = t.h + ":" + (t.m < 10 ? "0" : "") + t.m;
    $("clockS").textContent = ":" + (t.s < 10 ? "0" : "") + t.s;
    var wdi = weekday(t.date), a = t.date.split("-");
    $("clockD").textContent = WD[wdi] + ", " + +a[2] + " " + MONTHS[+a[1] - 1];
    var key = t.date + t.h * 60 + t.m;
    if (key !== lastMin) {
      var first = lastMin === -1;
      lastMin = key; now = getNow();
      if (!first && S.ent && S.weeks.length) render();
      if (!$("bellSheet").hidden) renderBells();
    }
  }

  // ---------- расписание ----------
  function metaParts(p) {
    var t = S.ent.type, g = (p.groups || []).join(", ");
    if (t === "group") return [has(p.room) ? "каб. " + p.room : "", p.teacher];
    if (t === "teacher") return [has(p.room) ? "каб. " + p.room : "", g];
    return [g, p.teacher];
  }
  function metaHtml(p) {
    var m = metaParts(p);
    return '<div class="meta">' + (m[0] ? '<span class="room">' + esc(m[0]) + "</span>" : "") + (m[1] ? "<span>" + esc(m[1]) + "</span>" : "") + "</div>";
  }
  function status(p, isToday) {
    if (!isToday || !p.subject) return {};
    var s = span(p.time);
    if (now.min >= s[0] && now.min < s[1]) return { now: true, left: s[1] - now.min, done: (now.min - s[0]) / (s[1] - s[0]) };
    if (now.min >= s[1]) return { past: true };
    return { future: true, inMin: s[0] - now.min };
  }
  function cls(list) { return list.filter(Boolean).join(" "); }
  function num(p) { return has(p.n) ? esc(p.n) : "·"; }

  function render() {
    var w = S.weeks[S.wi];
    $("note").textContent = NOTE;
    $("note").hidden = !NOTE || !S.ent;
    $("bar").hidden = !w;
    if (!S.ent) { $("view").innerHTML = ""; return; }
    if (!w) { $("view").innerHTML = '<div class="free glass"><b>Расписания пока нет</b>Скоро появится</div>'; return; }
    $("weekLabel").textContent = rangeLabel(w.start);
    $("prev").disabled = S.wi === 0;
    $("next").disabled = S.wi === S.weeks.length - 1;
    $("modeSeg").setAttribute("data-mode", S.mode);
    $("tabs").hidden = S.mode !== "day";
    $("tabs").innerHTML = SHORT.map(function (s, i) {
      var date = addDays(w.start, i);
      var exam = (w.days[i] || []).some(function (p) { return p.exam; });
      return '<button type="button" class="' + cls(["tab", date === now.date && "today", exam && "has-exam"]) + '" role="tab" aria-selected="' + (i === S.di) + '" data-i="' + i + '">' +
        '<span class="dw">' + s + '</span><span class="dd">' + +date.slice(8) + '</span><span class="dot"></span></button>';
    }).join("");
    $("view").innerHTML = S.mode === "week" ? weekHtml(w) : dayHtml(w);
  }

  function heroHtml(w) {
    var i = weekday(now.date);
    if (i > 5 || addDays(w.start, i) !== now.date) return "";
    var real = (w.days[i] || []).filter(function (p) { return p.subject; });
    var cur = null, nxt = null;
    real.forEach(function (p) { var st = status(p, true); if (st.now && !cur) cur = p; if (st.future && !nxt) nxt = p; });
    var p = cur || nxt; if (!p) return "";
    var st = status(p, true);
    var label = cur ? "Сейчас" : "Далее · в " + hm(span(p.time)[0]);
    return '<div class="hero glass"><div class="hero-top"><span class="eyebrow">' + (cur ? '<span class="pulse"></span>' : "") + label + (has(p.n) ? " · " + esc(p.n) + " пара" : "") + "</span>" +
      '<span class="left">' + (cur ? "ещё " + dur(st.left) : "через " + dur(st.inMin)) + "</span></div>" +
      "<b>" + esc(p.subject) + "</b>" + metaHtml(p) +
      (cur ? '<div class="prog"><span style="width:' + Math.round(st.done * 100) + '%"></span></div>' : "") + "</div>";
  }

  function weekHtml(w) {
    return heroHtml(w) + '<div class="weekgrid">' + DAYS.map(function (name, i) {
      var date = addDays(w.start, i), pairs = w.days[i] || [], isToday = date === now.date;
      var any = pairs.some(function (p) { return p.subject; });
      var body = any ? '<ul class="rows">' + pairs.map(function (p) {
        var st = status(p, isToday), s = span(p.time);
        var m = metaParts(p).filter(Boolean).join(" · ");
        return '<li class="' + cls(["row", p.exam && "exam", !p.subject && "empty", st.now && "now", st.past && "past"]) + '">' +
          '<span class="rn">' + num(p) + '</span><span class="rt"><b>' + hm(s[0]) + "</b><small>" + hm(s[1]) + "</small></span>" +
          '<div class="rs"><span class="subj">' + (p.subject ? esc(p.subject) : "Окно") + "</span>" + (p.subject && m ? '<span class="rm">' + esc(m) + "</span>" : "") + "</div></li>";
      }).join("") + "</ul>" : '<p class="nopairs">Пар нет</p>';
      return '<article class="' + cls(["glass daycard", isToday && "today"]) + '" data-i="' + i + '" tabindex="0" role="button" aria-label="' + name + ', открыть подробно">' +
        '<header class="dc-head"><div><h3>' + name + "</h3><span>" + human(date) + "</span></div>" + (isToday ? '<span class="badge now">Сегодня</span>' : "") + CHEV + "</header>" + body + "</article>";
    }).join("") + "</div>";
  }

  function dayHtml(w) {
    var date = addDays(w.start, S.di), pairs = w.days[S.di] || [], isToday = date === now.date;
    var html = '<div class="dayview"><div class="dayhead"><h2>' + DAYS[S.di] + "</h2><span>" + human(date) + (isToday ? " · сегодня" : "") + "</span></div>";
    if (!pairs.some(function (p) { return p.subject; })) return html + '<div class="free glass"><b>Пар нет</b>Свободный день</div></div>';
    var nextMarked = false;
    html += '<ol class="list">' + pairs.map(function (p) {
      var st = status(p, isToday), badge = "";
      if (p.exam && !/экзамен/i.test(p.subject)) badge = '<span class="badge exam">Важно</span>';
      if (st.now) badge = '<span class="badge now">Сейчас · ещё ' + dur(st.left) + "</span>";
      else if (st.future && !nextMarked) { nextMarked = true; badge += '<span class="badge next">Далее</span>'; }
      return '<li class="' + cls(["pair glass", p.exam && "exam", !p.subject && "empty", st.now && "now", st.past && "past"]) + '">' +
        '<div class="time"><span class="num">' + num(p) + "</span>" + p.time.map(function (t) { return '<span class="t">' + fmt(t) + "</span>"; }).join("") + "</div>" +
        "<div>" + (badge ? "<div>" + badge + "</div>" : "") + '<div class="subj-l">' + (p.subject ? esc(p.subject) : "Окно") + "</div>" + (p.subject ? metaHtml(p) : "") + "</div></li>";
    }).join("") + "</ol></div>";
    return html;
  }

  // ---------- шторки ----------
  function openSheet(id) { closeSheets(true); $(id).hidden = false; document.body.classList.add("lock"); }
  function closeSheets(force) {
    if (!force && !S.ent) return;
    if (document.activeElement === $("q")) $("q").blur();
    $("findSheet").hidden = true; $("bellSheet").hidden = true;
    document.body.classList.remove("lock", "kb");
  }
  [].forEach.call(document.querySelectorAll(".sheet"), function (s) {
    s.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) closeSheets(); });
  });

  // ---------- окна над клавиатурой (телефоны) ----------
  // Окно занимает только видимую часть экрана, поэтому клавиатура его не закрывает.
  var VV = window.visualViewport, rootEl = document.documentElement;
  var fullH = 0, fullW = 0; // высота экрана без клавиатуры
  function fitViewport() {
    var h = VV ? VV.height : window.innerHeight, top = VV ? VV.offsetTop : 0;
    rootEl.style.setProperty("--vv-h", Math.round(h) + "px");
    rootEl.style.setProperty("--vv-top", Math.round(top) + "px");
    var typing = document.activeElement === $("q");
    if (window.innerWidth !== fullW) { fullW = window.innerWidth; fullH = 0; }
    if (!typing || !fullH) fullH = Math.max(fullH, window.innerHeight, rootEl.clientHeight);
    var visible = VV ? VV.height * (VV.scale || 1) : window.innerHeight;
    document.body.classList.toggle("kb", typing && fullH - visible > 150);
  }
  if (VV) { VV.addEventListener("resize", fitViewport); VV.addEventListener("scroll", fitViewport); }
  window.addEventListener("resize", fitViewport);
  window.addEventListener("orientationchange", function () { setTimeout(fitViewport, 300); });
  $("q").addEventListener("focus", function () { fitViewport(); setTimeout(fitViewport, 350); });
  $("q").addEventListener("blur", function () { setTimeout(fitViewport, 50); });
  // Листаешь результаты — клавиатура убирается, чтобы было видно больше
  var ry = null;
  $("results").addEventListener("touchstart", function (e) { ry = e.touches[0].clientY; }, { passive: true });
  $("results").addEventListener("touchmove", function (e) {
    if (ry !== null && Math.abs(e.touches[0].clientY - ry) > 12 && document.activeElement === $("q")) { $("q").blur(); ry = null; }
  }, { passive: true });
  fitViewport();

  // ---------- тема (по умолчанию тёмная) ----------
  function curTheme() { return rootEl.getAttribute("data-theme") === "light" ? "light" : "dark"; }
  function applyTheme(t, animate) {
    var go = function () {
      rootEl.setAttribute("data-theme", t);
      var m = $("themeColor"); if (m) m.setAttribute("content", t === "light" ? "#EDF1F8" : "#0D1015");
      $("themeBtn").setAttribute("aria-label", t === "light" ? "Включить тёмную тему" : "Включить светлую тему");
    };
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    if (animate && !calm && document.startViewTransition) document.startViewTransition(go); else go();
  }
  $("themeBtn").addEventListener("click", function () {
    var t = curTheme() === "dark" ? "light" : "dark";
    LS.set("vit-theme", t); applyTheme(t, true);
  });
  applyTheme(LS.get("vit-theme") === "light" ? "light" : "dark", false);

  // ---------- поиск и выбор группы ----------
  var index = null;
  function buildIndex() {
    var t = {}, r = {};
    GROUPS.forEach(function (g) {
      (store[g.id] || []).forEach(function (w) { (w.days || []).forEach(function (d) { (d || []).forEach(function (p) {
        if (!p.subject) return;
        var room = String(p.room == null ? "" : p.room).trim();
        teachersOf(p.teacher).forEach(function (n) { t[n] = t[n] || {}; if (room) t[n][room] = 1; });
        if (room) { r[room] = r[room] || {}; r[room][g.name] = 1; }
      }); }); });
    });
    index = {
      teachers: Object.keys(t).sort(function (a, b) { return a.localeCompare(b, "ru"); }).map(function (n) { return [n, Object.keys(t[n])]; }),
      rooms: Object.keys(r).sort(function (a, b) { return a.localeCompare(b, "ru", { numeric: true }); }).map(function (n) { return [n, Object.keys(r[n])]; }),
    };
  }
  function openFind(filter) {
    S.filter = filter;
    S.picker = filter === "group";
    $("q").value = "";
    $("findTitle").textContent = filter === "group" ? "Выбор группы" : "Поиск";
    $("q").placeholder = filter === "group" ? "Номер группы, например 12 Э" : "Группа, преподаватель или кабинет";
    openSheet("findSheet");
    fitViewport();
    renderResults();
    if (filter !== "group" || window.matchMedia("(hover:hover)").matches) setTimeout(function () { $("q").focus(); }, 60);
    if (filter !== "group") loadAll().then(function () { buildIndex(); renderResults(); });
  }
  function plural(n, a, b, c) { var m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; }
  function renderResults() {
    var q = norm($("q").value), f = S.filter, cur = S.ent ? hashOf(S.ent) : "", html = "";
    [].forEach.call(document.querySelectorAll("#filters button"), function (b) { b.classList.toggle("on", b.getAttribute("data-f") === f); });
    $("filters").hidden = S.picker;
    if (f === "all" || f === "group") {
      var list = GROUPS.filter(function (g) { return !q || norm(g.name).indexOf(q) >= 0 || norm(g.course + "курс").indexOf(q) >= 0; });
      var courses = list.map(function (g) { return g.course; }).filter(function (c, i, a) { return a.indexOf(c) === i; }).sort(function (a, b) { return a - b; });
      html += courses.map(function (c) {
        return "<h3>" + c + " курс</h3><div class=\"ggrid\">" + list.filter(function (g) { return g.course === c; })
          .sort(function (a, b) { return a.name.localeCompare(b.name, "ru", { numeric: true }); })
          .map(function (g) { return '<button type="button" class="' + cls(["gitem", cur === g.id && "on"]) + '" data-h="' + esc(g.id) + '">' + esc(g.name) + "</button>"; }).join("") + "</div>";
      }).join("");
    }
    if (f === "all" || f === "teacher") {
      if (!index) html += "<h3>Преподаватели</h3><p class=\"empty-msg\">Загрузка…</p>";
      else {
        var tl = index.teachers.filter(function (x) { return !q || norm(x[0]).indexOf(q) >= 0; });
        if (tl.length) html += '<h3>Преподаватели</h3><div class="tlist">' + tl.map(function (x) {
          return '<button type="button" class="' + cls(["titem", cur === "t=" + x[0] && "on"]) + '" data-h="' + esc("t=" + x[0]) + '"><span class="ava">' + esc(x[0].charAt(0)) + "</span><span><b>" + esc(x[0]) + "</b><small>" + (x[1].length ? "каб. " + esc(x[1].join(", ")) : "") + "</small></span></button>";
        }).join("") + "</div>";
      }
    }
    if (f === "all" || f === "room") {
      if (!index) html += f === "room" ? '<p class="empty-msg">Загрузка…</p>' : "";
      else {
        var rl = index.rooms.filter(function (x) { return !q || norm(x[0]).indexOf(q) >= 0 || norm("каб" + x[0]).indexOf(q) >= 0 || norm("кабинет" + x[0]).indexOf(q) >= 0; });
        if (rl.length) html += '<h3>Кабинеты</h3><div class="ggrid">' + rl.map(function (x) {
          var n = x[1].length;
          return '<button type="button" class="' + cls(["gitem", cur === "r=" + x[0] && "on"]) + '" data-h="' + esc("r=" + x[0]) + '">' + esc(x[0]) + "<small>" + n + " " + plural(n, "группа", "группы", "групп") + "</small></button>";
        }).join("") + "</div>";
      }
    }
    $("results").innerHTML = html || '<p class="empty-msg">Ничего не найдено</p>';
    $("results").scrollTop = 0;
  }
  $("q").addEventListener("input", renderResults);
  $("q").addEventListener("keydown", function (e) { if (e.key === "Enter") { var b = $("results").querySelector("[data-h]"); if (b) b.click(); } });
  $("filters").addEventListener("click", function (e) {
    var b = e.target.closest("[data-f]"); if (!b) return;
    S.filter = b.getAttribute("data-f"); renderResults();
    if (S.filter !== "group" && !index) loadAll().then(function () { buildIndex(); renderResults(); });
  });
  $("results").addEventListener("click", function (e) {
    var b = e.target.closest("[data-h]"); if (!b) return;
    var ent = parseHash(b.getAttribute("data-h")); if (!ent) return;
    closeSheets(true);
    setEntity(ent, ent.type === "group" && S.filter === "group" ? { mode: "week" } : {});
    window.scrollTo(0, 0);
  });

  // ---------- звонки ----------
  function renderBells() {
    var gid = S.ent && S.ent.type === "group" ? S.ent.id : myGroup();
    var g = gid ? groupOf(gid) : null, course = g ? g.course : null;
    var wd = weekday(now.date), workday = wd <= 5;
    var mine = null;
    BELLS_LIST.forEach(function (b) { if (b.lunch && course && b.lunch.indexOf(course) >= 0) mine = b; });
    $("bellSub").textContent = (workday ? "" : "Сегодня выходной · ") + (mine ? "Обед для " + course + " курса: " + fmt(mine.time) : "Одно для всех групп");
    var items = BELLS_LIST.slice().sort(function (a, b) { return toMin(a.time) - toMin(b.time); });
    var html = "", lastEnd = null, lastPair = null;
    items.forEach(function (it) {
      var s = span([it.time]), a = s[0], b = s[1];
      if (lastEnd !== null && a > lastEnd) {
        var bn = workday && now.min >= lastEnd && now.min < a;
        html += '<div class="' + cls(["brk", bn && "now"]) + '">' + (bn ? "Перемена · ещё " + dur(a - now.min) : "перемена " + (a - lastEnd) + " мин") + "</div>";
      }
      if (it.pair && it.pair !== lastPair) {
        var ps = items.filter(function (x) { return x.pair === it.pair; }).map(function (x) { return span([x.time]); });
        html += '<div class="bp">' + it.pair + " пара<span>" + hm(ps[0][0]) + "–" + hm(ps[ps.length - 1][1]) + "</span></div>";
        lastPair = it.pair;
      }
      var isNow = workday && now.min >= a && now.min < b;
      var mineLunch = it.lunch && course && it.lunch.indexOf(course) >= 0;
      var tag = isNow ? '<span class="tag">ещё ' + dur(b - now.min) + "</span>" : (mineLunch ? '<span class="tag">ваш</span>' : "");
      html += '<div class="' + cls(["bi", it.lunch && "lunch", it.lunch && course && !mineLunch && "other", !it.pair && !it.lunch && "special", isNow && "now"]) + '"><div><b>' + esc(it.name) + "</b>" + tag + (it.note ? "<small>" + esc(it.note) + "</small>" : "") + '</div><span class="bt">' + fmt(it.time) + "</span></div>";
      lastEnd = lastEnd === null ? b : Math.max(lastEnd, b);
    });
    $("bellList").innerHTML = '<div class="bells">' + (html || '<p class="empty-msg">Расписание звонков не заполнено</p>') + "</div>";
  }

  // ---------- кнопки ----------
  function goHome() {
    closeSheets(true);
    var id = myGroup();
    if (!id) { openFind("group"); return; }
    if (S.ent && S.ent.type === "group" && S.ent.id === id && S.weeks.length) {
      S.mode = "week"; LS.set("vit-mode", "week"); S.wi = currentWeekIndex(); S.di = defaultDay(); render();
    } else setEntity({ type: "group", id: id }, { mode: "week" });
    window.scrollTo(0, 0);
  }
  $("brandBtn").addEventListener("click", goHome);
  $("titleBtn").addEventListener("click", function () { openFind("group"); });
  $("groupBtn").addEventListener("click", function () { openFind("group"); });
  $("searchBtn").addEventListener("click", function () { openFind("all"); });
  if (!BELLS_LIST.length) $("bellBtn").hidden = true;
  $("bellBtn").addEventListener("click", function () { renderBells(); openSheet("bellSheet"); });

  $("modeSeg").addEventListener("click", function (e) {
    var b = e.target.closest("[data-mode]"); if (!b || b.tagName !== "BUTTON") return;
    S.mode = b.getAttribute("data-mode"); LS.set("vit-mode", S.mode); render();
  });
  $("tabs").addEventListener("click", function (e) { var b = e.target.closest(".tab"); if (b) { S.di = +b.getAttribute("data-i"); render(); } });
  function openDay(i) { S.di = i; S.mode = "day"; LS.set("vit-mode", "day"); render(); window.scrollTo(0, 0); }
  $("view").addEventListener("click", function (e) { var c = e.target.closest(".daycard"); if (c) openDay(+c.getAttribute("data-i")); });
  $("view").addEventListener("keydown", function (e) { var c = e.target.closest(".daycard"); if (c && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openDay(+c.getAttribute("data-i")); } });
  $("prev").addEventListener("click", function () { if (S.wi > 0) { S.wi--; S.di = 0; render(); } });
  $("next").addEventListener("click", function () { if (S.wi < S.weeks.length - 1) { S.wi++; S.di = 0; render(); } });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") return closeSheets();
    var tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || !$("findSheet").hidden || !$("bellSheet").hidden || S.mode !== "day" || !S.weeks.length) return;
    if (e.key === "ArrowRight" && S.di < 5) { S.di++; render(); }
    if (e.key === "ArrowLeft" && S.di > 0) { S.di--; render(); }
  });

  // свайп по дням (на телефоне, в режиме «День»)
  var x0 = null, y0 = null;
  $("main").addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  $("main").addEventListener("touchend", function (e) {
    if (x0 === null || S.mode !== "day" || !S.weeks.length) { x0 = null; return; }
    var dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && S.di < 5) S.di++; else if (dx > 0 && S.di > 0) S.di--; else return;
      render();
    }
  }, { passive: true });

  window.addEventListener("hashchange", function () {
    var e = parseHash(location.hash);
    if (e && (!S.ent || hashOf(e) !== hashOf(S.ent))) setEntity(e);
  });

  // ---------- старт ----------
  tick();
  setInterval(tick, 1000);
  var first = parseHash(location.hash) || (myGroup() ? { type: "group", id: myGroup() } : null);
  if (first) setEntity(first);
  else { renderTitle(); render(); openFind("group"); }
})();
