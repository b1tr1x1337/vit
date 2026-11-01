(() => {
  const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = (s) => String(s ?? "").toLowerCase().replace(/ё/g, "е").replace(/[\s\-–.,«»"]/g, "");
  const CHEV = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;

  // ---------- данные ----------
  const store = {};
  window.addSchedule = (id, weeks) => { store[id] = [...weeks].sort((a, b) => a.start.localeCompare(b.start)); };
  const VER = Math.floor(Date.now() / 3e5); // обновление кэша раз в 5 минут
  const loading = {};
  const loadGroup = (id) => store[id] ? Promise.resolve() : (loading[id] ||= new Promise((res) => {
    const s = document.createElement("script");
    s.src = `groups/${id}.js?v=${VER}`; s.onload = s.onerror = () => res();
    document.body.appendChild(s);
  }));
  const loadAll = () => Promise.all(GROUPS.map((g) => loadGroup(g.id)));
  const teachersOf = (t) => String(t || "").split(/\s*[\/;,]\s*/).map((s) => s.trim()).filter(Boolean);

  // ---------- время ----------
  function moscowNow() {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute };
  }
  const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const human = (iso) => { const [, m, d] = iso.split("-"); return `${+d} ${MONTHS[+m - 1]}`; };
  const toMin = (t) => { const [h, m] = t.trim().split(/[.:]/); return +h * 60 + +(m || 0); };
  const span = (times) => [toMin(times[0].split("-")[0]), toMin(times[times.length - 1].split("-")[1])];
  const hm = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
  const fmt = (t) => t.replace(/\./g, ":").replace("-", "–");
  const dur = (m) => m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60 ? (m % 60) + " мин" : ""}`.trim();
  const weekday = (iso) => (new Date(iso + "T12:00:00Z").getUTCDay() + 6) % 7; // 0 = Пн … 6 = Вс
  const rangeLabel = (start) => {
    const a = start.split("-"), b = addDays(start, 5).split("-");
    return a[1] === b[1] ? `${+a[2]}–${+b[2]} ${MONTHS[+a[1] - 1]}` : `${+a[2]} ${MONTHS[+a[1] - 1].slice(0, 3)} – ${+b[2]} ${MONTHS[+b[1] - 1].slice(0, 3)}`;
  };

  let now = moscowNow();
  const S = { ent: null, weeks: [], wi: 0, di: 0, mode: localStorage.getItem("vit-mode") || "week", filter: "all" };

  // ---------- сущности: группа / преподаватель / кабинет ----------
  const hashOf = (e) => e.type === "group" ? e.id : (e.type === "teacher" ? "t=" : "r=") + e.name;
  function parseHash(h) {
    h = decodeURIComponent(String(h || "").replace(/^#/, ""));
    if (!h) return null;
    if (h.startsWith("t=")) return { type: "teacher", name: h.slice(2) };
    if (h.startsWith("r=")) return { type: "room", name: h.slice(2) };
    return GROUPS.some((g) => g.id === h) ? { type: "group", id: h } : null;
  }
  const groupOf = (id) => GROUPS.find((g) => g.id === id);

  function buildWeeks(e) {
    if (e.type === "group") return store[e.id] || [];
    const map = new Map();
    for (const g of GROUPS) for (const w of store[g.id] || []) {
      if (!map.has(w.start)) map.set(w.start, [[], [], [], [], [], []]);
      const days = map.get(w.start);
      (w.days || []).forEach((d, i) => (d || []).forEach((p) => {
        if (!p.subject || i > 5) return;
        const hit = e.type === "teacher" ? teachersOf(p.teacher).includes(e.name) : String(p.room ?? "").trim() === e.name;
        if (hit) days[i].push({ ...p, groups: [g.name] });
      }));
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([start, days]) => ({
      start,
      days: days.map((d) => d.sort((a, b) => span(a.time)[0] - span(b.time)[0]).reduce((acc, p) => {
        const q = acc[acc.length - 1];
        if (q && q.time.join() === p.time.join() && q.subject === p.subject && q.room === p.room && q.teacher === p.teacher) q.groups.push(...p.groups);
        else acc.push(p);
        return acc;
      }, [])),
    }));
  }

  async function setEntity(e) {
    S.ent = e;
    const h = hashOf(e);
    if (decodeURIComponent(location.hash.slice(1)) !== h) history.replaceState(null, "", "#" + encodeURIComponent(h));
    localStorage.setItem("vit-last", h);
    renderTitle();
    $("view").innerHTML = `<p class="empty-msg">Загрузка…</p>`;
    await (e.type === "group" ? loadGroup(e.id) : loadAll());
    if (S.ent !== e) return;
    S.weeks = buildWeeks(e);
    S.wi = S.weeks.findIndex((w) => now.date >= w.start && now.date <= addDays(w.start, 6));
    if (S.wi < 0) S.wi = S.weeks.findIndex((w) => w.start > now.date);
    if (S.wi < 0) S.wi = S.weeks.length - 1;
    S.di = defaultDay();
    render();
  }

  function defaultDay() {
    const w = S.weeks[S.wi]; if (!w) return 0;
    const i = S.weeks[S.wi] && addDays(w.start, weekday(now.date)) === now.date ? weekday(now.date) : -1;
    if (i < 0 || i > 5) return 0;
    const real = (w.days[i] || []).filter((p) => p.subject);
    const end = real.length ? span(real[real.length - 1].time)[1] : 0;
    return now.min > end && i < 5 ? i + 1 : i;
  }

  // ---------- отрисовка ----------
  function renderTitle() {
    const e = S.ent;
    let kicker = "Расписание", title = "Выберите группу";
    if (e?.type === "group") { const g = groupOf(e.id); kicker = `${g.course} курс · группа`; title = g.name; }
    if (e?.type === "teacher") { kicker = "Преподаватель"; title = e.name; }
    if (e?.type === "room") { kicker = "Кабинет"; title = `Кабинет ${e.name}`; }
    $("kicker").textContent = kicker; $("titleText").textContent = title;
    document.title = e ? `${title} · Расписание ВИТ` : "Расписание · ОГАПОУ «ВИТ»";
  }

  function metaParts(p) {
    const t = S.ent.type, g = (p.groups || []).join(", ");
    if (t === "group") return [p.room && `каб. ${p.room}`, p.teacher];
    if (t === "teacher") return [p.room && `каб. ${p.room}`, g];
    return [g, p.teacher];
  }
  function metaHtml(p) {
    const [a, b] = metaParts(p);
    const first = a ? (S.ent.type === "room" ? `<span class="room">${esc(a)}</span>` : `<span class="room">${esc(a)}</span>`) : "";
    return `<div class="meta">${first}${b ? `<span>${esc(b)}</span>` : ""}</div>`;
  }
  const status = (p, isToday) => {
    if (!isToday || !p.subject) return {};
    const [a, b] = span(p.time);
    if (now.min >= a && now.min < b) return { now: true, left: b - now.min };
    if (now.min >= b) return { past: true };
    return { future: true, in: a - now.min };
  };

  function render() {
    $("note").textContent = DAILY_NOTE || "";
    $("note").hidden = !DAILY_NOTE || !S.ent;
    const w = S.weeks[S.wi];
    $("bar").hidden = !w;
    if (!S.ent) { $("view").innerHTML = ""; return; }
    if (!w) { $("view").innerHTML = `<div class="free glass"><b>Расписания пока нет</b>Скоро появится</div>`; return; }

    $("weekLabel").textContent = rangeLabel(w.start);
    $("prev").disabled = S.wi === 0;
    $("next").disabled = S.wi === S.weeks.length - 1;
    $("modeSeg").dataset.mode = S.mode;
    $("tabs").hidden = S.mode !== "day";
    $("tabs").innerHTML = SHORT.map((s, i) => {
      const date = addDays(w.start, i);
      const cls = ["tab", date === now.date && "today", (w.days[i] || []).some((p) => p.exam) && "has-exam"].filter(Boolean).join(" ");
      return `<button class="${cls}" role="tab" aria-selected="${i === S.di}" data-i="${i}"><span class="dw">${s}</span><span class="dd">${+date.slice(8)}</span><span class="dot"></span></button>`;
    }).join("");
    $("view").innerHTML = S.mode === "week" ? weekHtml(w) : dayHtml(w);
  }

  function heroHtml(w) {
    const i = weekday(now.date);
    if (i > 5 || addDays(w.start, i) !== now.date) return "";
    const real = (w.days[i] || []).filter((p) => p.subject);
    const cur = real.find((p) => status(p, true).now);
    const nxt = !cur && real.find((p) => status(p, true).future);
    const p = cur || nxt; if (!p) return "";
    const st = status(p, true), [a] = span(p.time);
    const label = cur ? "Сейчас" : `Далее · в ${hm(a)}`;
    return `<div class="hero glass"><div class="hero-l">
      <span class="eyebrow">${cur ? '<span class="pulse"></span>' : ""}${label}${p.n ? ` · ${esc(p.n)} пара` : ""}</span>
      <b>${esc(p.subject)}</b>${metaHtml(p)}</div>
      <div class="hero-r"><strong>${dur(cur ? st.left : st.in)}</strong><span>${cur ? "до конца" : "до начала"}</span></div></div>`;
  }

  function weekHtml(w) {
    return heroHtml(w) + `<div class="weekgrid">` + DAYS.map((name, i) => {
      const date = addDays(w.start, i), pairs = w.days[i] || [], isToday = date === now.date;
      const body = pairs.some((p) => p.subject)
        ? `<ul class="rows">${pairs.map((p) => {
            const st = status(p, isToday), [a, b] = span(p.time);
            const cls = ["row", p.exam && "exam", !p.subject && "empty", st.now && "now", st.past && "past"].filter(Boolean).join(" ");
            const m = metaParts(p).filter(Boolean).join(" · ");
            return `<li class="${cls}"><span class="rn">${p.n !== "" && p.n != null ? esc(p.n) : "·"}</span>
              <span class="rt"><b>${hm(a)}</b><small>${hm(b)}</small></span>
              <div class="rs"><span class="subj">${p.subject ? esc(p.subject) : "Окно"}</span>${p.subject && m ? `<span class="rm">${esc(m)}</span>` : ""}</div></li>`;
          }).join("")}</ul>`
        : `<p class="nopairs">Пар нет</p>`;
      return `<article class="glass daycard${isToday ? " today" : ""}" data-i="${i}" tabindex="0" role="button" aria-label="${name}, открыть подробно">
        <header class="dc-head"><div><h3>${name}</h3><span>${human(date)}</span></div>${isToday ? '<span class="badge now">Сегодня</span>' : ""}${CHEV}</header>${body}</article>`;
    }).join("") + `</div>`;
  }

  function dayHtml(w) {
    const date = addDays(w.start, S.di), pairs = w.days[S.di] || [], isToday = date === now.date;
    let html = `<div class="dayview"><div class="dayhead"><h2>${DAYS[S.di]}</h2><span>${human(date)}${isToday ? " · сегодня" : ""}</span></div>`;
    if (!pairs.some((p) => p.subject)) return html + `<div class="free glass"><b>Пар нет</b>Свободный день</div></div>`;
    let nextMarked = false;
    html += `<ol class="list">` + pairs.map((p) => {
      const st = status(p, isToday);
      const cls = ["pair", "glass", p.exam && "exam", !p.subject && "empty", st.now && "now", st.past && "past"].filter(Boolean).join(" ");
      let badge = "";
      if (p.exam && !/экзамен/i.test(p.subject)) badge = `<span class="badge exam">Важно</span>`;
      if (st.now) badge = `<span class="badge now">Сейчас · ещё ${dur(st.left)}</span>`;
      else if (st.future && !nextMarked) { nextMarked = true; badge += ` <span class="badge next">Далее</span>`; }
      return `<li class="${cls}">
        <div class="time"><span class="num">${p.n !== "" && p.n != null ? esc(p.n) : "·"}</span>${p.time.map((t) => `<span class="t">${fmt(t)}</span>`).join("")}</div>
        <div>${badge ? `<div>${badge}</div>` : ""}<div class="subj-l">${p.subject ? esc(p.subject) : "Окно"}</div>${p.subject ? metaHtml(p) : ""}</div>
      </li>`;
    }).join("") + `</ol></div>`;
    return html;
  }

  // ---------- шторки ----------
  function openSheet(id) { $(id).hidden = false; document.body.classList.add("lock"); }
  function closeSheets() { if (!S.ent) return; ["findSheet", "bellSheet"].forEach((id) => $(id).hidden = true); document.body.classList.remove("lock"); }
  document.querySelectorAll(".sheet").forEach((s) => s.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeSheets(); }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheets(); });

  // ---------- поиск ----------
  let index = null;
  function buildIndex() {
    const t = new Map(), r = new Map();
    for (const g of GROUPS) for (const w of store[g.id] || []) for (const d of w.days || []) for (const p of d || []) {
      if (!p.subject) continue;
      const room = String(p.room ?? "").trim();
      for (const name of teachersOf(p.teacher)) {
        if (!t.has(name)) t.set(name, new Set());
        if (room) t.get(name).add(room);
      }
      if (room) { if (!r.has(room)) r.set(room, new Set()); r.get(room).add(g.name); }
    }
    index = {
      teachers: [...t.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru")),
      rooms: [...r.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru", { numeric: true })),
    };
  }
  async function openFind(filter) {
    S.filter = filter; $("q").value = "";
    $("findTitle").textContent = filter === "group" ? "Ваша группа" : "Поиск";
    openSheet("findSheet"); renderResults();
    if (window.matchMedia("(min-width:600px)").matches || filter !== "group") setTimeout(() => $("q").focus(), 50);
    await loadAll(); buildIndex(); renderResults();
  }
  function renderResults() {
    const q = norm($("q").value), f = S.filter;
    document.querySelectorAll("#filters button").forEach((b) => b.classList.toggle("on", b.dataset.f === f));
    const cur = S.ent ? hashOf(S.ent) : "";
    let html = "";
    if (f === "all" || f === "group") {
      const list = GROUPS.filter((g) => !q || norm(g.name).includes(q));
      const courses = [...new Set(list.map((g) => g.course))].sort((a, b) => a - b);
      html += courses.map((c) => `<h3>Группы · ${c} курс</h3><div class="ggrid">` + list.filter((g) => g.course === c)
        .sort((a, b) => a.name.localeCompare(b.name, "ru", { numeric: true }))
        .map((g) => `<button class="gitem${cur === g.id ? " on" : ""}" data-h="${esc(g.id)}">${esc(g.name)}</button>`).join("") + `</div>`).join("");
    }
    if (f === "all" || f === "teacher") {
      if (!index) html += `<h3>Преподаватели</h3><p class="empty-msg">Загрузка…</p>`;
      else {
        const list = index.teachers.filter(([n]) => !q || norm(n).includes(q));
        if (list.length) html += `<h3>Преподаватели</h3><div class="tlist">` + list.map(([n, rooms]) =>
          `<button class="titem${cur === "t=" + n ? " on" : ""}" data-h="${esc("t=" + n)}"><span class="ava">${esc(n[0])}</span><span><b>${esc(n)}</b><small>${rooms.size ? "каб. " + esc([...rooms].join(", ")) : ""}</small></span></button>`).join("") + `</div>`;
      }
    }
    if (f === "all" || f === "room") {
      if (!index) html += f === "room" ? `<p class="empty-msg">Загрузка…</p>` : "";
      else {
        const list = index.rooms.filter(([n]) => !q || norm(n).includes(q) || norm("каб" + n).includes(q));
        if (list.length) html += `<h3>Кабинеты</h3><div class="ggrid">` + list.map(([n, gs]) =>
          `<button class="gitem${cur === "r=" + n ? " on" : ""}" data-h="${esc("r=" + n)}">${esc(n)}<small>${gs.size} ${gs.size === 1 ? "группа" : gs.size < 5 ? "группы" : "групп"}</small></button>`).join("") + `</div>`;
      }
    }
    $("results").innerHTML = html || `<p class="empty-msg">Ничего не найдено</p>`;
  }
  $("q").addEventListener("input", renderResults);
  $("q").addEventListener("keydown", (e) => { if (e.key === "Enter") $("results").querySelector("[data-h]")?.click(); });
  $("filters").addEventListener("click", (e) => { const b = e.target.closest("[data-f]"); if (b) { S.filter = b.dataset.f; renderResults(); } });
  $("results").addEventListener("click", (e) => {
    const b = e.target.closest("[data-h]"); if (!b) return;
    const ent = parseHash(b.dataset.h);
    if (ent) { $("findSheet").hidden = true; document.body.classList.remove("lock"); setEntity(ent); window.scrollTo({ top: 0 }); }
  });

  // ---------- звонки ----------
  function renderBells() {
    const course = S.ent?.type === "group" ? groupOf(S.ent.id).course : null;
    const wd = weekday(now.date), workday = wd <= 5;
    const myLunch = course && BELLS.find((b) => b.lunch && b.lunch.includes(course));
    $("bellSub").textContent = (workday ? "" : "Сегодня выходной · ") + (myLunch ? `Обед для ${course} курса: ${fmt(myLunch.time)}` : "Одно для всех групп");
    const items = [...BELLS].sort((a, b) => toMin(a.time) - toMin(b.time));
    let html = "", lastEnd = null, lastPair = null;
    for (const it of items) {
      const [a, b] = span([it.time]);
      if (lastEnd !== null && a > lastEnd) {
        const isNow = workday && now.min >= lastEnd && now.min < a;
        html += `<div class="brk${isNow ? " now" : ""}">${isNow ? `Перемена · ещё ${dur(a - now.min)}` : `перемена ${a - lastEnd} мин`}</div>`;
      }
      if (it.pair && it.pair !== lastPair) {
        const ps = items.filter((x) => x.pair === it.pair).map((x) => span([x.time]));
        html += `<div class="bp">${it.pair} пара<span>${hm(ps[0][0])}–${hm(ps[ps.length - 1][1])}</span></div>`;
        lastPair = it.pair;
      }
      const isNow = workday && now.min >= a && now.min < b;
      const cls = ["bi", it.lunch && "lunch", it.lunch && course && !it.lunch.includes(course) && "other", !it.pair && !it.lunch && "special", isNow && "now"].filter(Boolean).join(" ");
      const tag = isNow ? `<span class="tag">ещё ${dur(b - now.min)}</span>` : (it.lunch && course && it.lunch.includes(course) ? `<span class="tag">ваш</span>` : "");
      html += `<div class="${cls}"><div><b>${esc(it.name)}</b>${tag}${it.note ? `<small>${esc(it.note)}</small>` : ""}</div><span class="bt">${fmt(it.time)}</span></div>`;
      if (!it.lunch) lastEnd = b; else lastEnd = Math.max(lastEnd ?? 0, b);
    }
    $("bellList").innerHTML = `<div class="bells">${html}</div>`;
  }

  // ---------- события ----------
  $("titleBtn").onclick = () => openFind("group");
  $("searchBtn").onclick = () => openFind("all");
  $("bellBtn").onclick = () => { renderBells(); openSheet("bellSheet"); };
  $("modeSeg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]"); if (!b) return;
    S.mode = b.dataset.mode; localStorage.setItem("vit-mode", S.mode); render();
  });
  $("tabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (b) { S.di = +b.dataset.i; render(); } });
  $("view").addEventListener("click", (e) => {
    const c = e.target.closest(".daycard"); if (!c) return;
    S.di = +c.dataset.i; S.mode = "day"; localStorage.setItem("vit-mode", "day"); render(); window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("view").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.closest(".daycard")) e.target.click(); });
  $("prev").onclick = () => { if (S.wi > 0) { S.wi--; S.di = 0; render(); } };
  $("next").onclick = () => { if (S.wi < S.weeks.length - 1) { S.wi++; S.di = 0; render(); } };

  let x0 = null, y0 = null;
  $("main").addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  $("main").addEventListener("touchend", (e) => {
    if (x0 === null || S.mode !== "day" || !S.weeks.length) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && S.di < 5) S.di++; else if (dx > 0 && S.di > 0) S.di--;
      render();
    }
    x0 = null;
  });
  window.addEventListener("hashchange", () => { const e = parseHash(location.hash); if (e && hashOf(e) !== (S.ent && hashOf(S.ent))) setEntity(e); });

  // ---------- старт ----------
  const first = parseHash(location.hash) || parseHash(localStorage.getItem("vit-last")) || (GROUPS.length === 1 ? { type: "group", id: GROUPS[0].id } : null);
  if (first) setEntity(first);
  else { renderTitle(); render(); openFind("group"); }

  setInterval(() => {
    now = moscowNow();
    if (S.ent && S.weeks.length) render();
    if (!$("bellSheet").hidden) renderBells();
  }, 30000);
})();
