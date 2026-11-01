(() => {
  const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const norm = (s) => String(s).toLowerCase().replace(/ё/g, "е").replace(/[\s\-–.]/g, "");

  // Хранилище загруженных расписаний; файлы групп вызывают addSchedule(id, weeks)
  const store = {};
  window.addSchedule = (id, weeks) => { store[id] = [...weeks].sort((a, b) => a.start.localeCompare(b.start)); };

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
  const fmt = (t) => t.replace(/\./g, ":").replace("-", "–");

  const now = moscowNow();
  let group = null, weeks = [], wi = 0, di = 0;

  // ---------- загрузка группы ----------
  function loadGroup(id) {
    const g = GROUPS.find((x) => x.id === id);
    if (!g) return openSheet();
    group = g;
    localStorage.setItem("vit-group", id);
    if (location.hash.slice(1) !== id) history.replaceState(null, "", "#" + id);
    $("groupName").textContent = `${g.name} · ${g.course} курс`;
    document.title = `${g.name} · Расписание ВИТ`;
    if (store[id]) return start();
    $("day").innerHTML = `<p class="empty-msg">Загрузка…</p>`;
    const s = document.createElement("script");
    s.src = `groups/${id}.js?v=${Date.now().toString().slice(0, -5)}`; // свежая версия ~ раз в 100 с
    s.onload = start;
    s.onerror = () => { $("day").innerHTML = `<p class="empty-msg">Не удалось загрузить расписание группы.</p>`; };
    document.body.appendChild(s);
  }

  function start() {
    weeks = store[group.id] || [];
    wi = weeks.findIndex((w) => now.date >= w.start && now.date <= addDays(w.start, 6));
    if (wi < 0) wi = weeks.findIndex((w) => w.start > now.date);
    if (wi < 0) wi = weeks.length - 1;
    di = pickDefaultDay();
    render();
  }

  function pickDefaultDay() {
    const w = weeks[wi]; if (!w) return 0;
    for (let i = 0; i < 6; i++) {
      if (addDays(w.start, i) === now.date) {
        const pairs = (w.days[i] || []).filter((p) => p.subject);
        const end = pairs.length ? span(pairs[pairs.length - 1].time)[1] : 0;
        return now.min > end && i < 5 ? i + 1 : i;
      }
    }
    return 0;
  }

  // ---------- отрисовка ----------
  function render() {
    $("note").textContent = DAILY_NOTE || "";
    $("note").hidden = !DAILY_NOTE;
    const w = weeks[wi];
    if (!w) {
      $("weekBar").hidden = true; $("tabs").innerHTML = "";
      $("day").innerHTML = `<div class="free"><b>Расписания пока нет</b>Скоро появится</div>`;
      return;
    }
    $("weekBar").hidden = false;
    $("weekLabel").textContent = `${human(w.start)} — ${human(addDays(w.start, 5))}`;
    $("prev").disabled = wi === 0;
    $("next").disabled = wi === weeks.length - 1;

    $("tabs").innerHTML = SHORT.map((s, i) => {
      const date = addDays(w.start, i);
      const cls = ["tab", date === now.date && "today", (w.days[i] || []).some((p) => p.exam) && "has-exam"].filter(Boolean).join(" ");
      return `<button class="${cls}" role="tab" aria-selected="${i === di}" data-i="${i}"><span class="dw">${s}</span><span class="dd">${+date.slice(8)}</span><span class="dot"></span></button>`;
    }).join("");

    const date = addDays(w.start, di);
    const pairs = w.days[di] || [];
    const isToday = date === now.date;
    let html = `<div class="dayhead"><h2>${DAYS[di]}</h2><span>${human(date)}${isToday ? " · сегодня" : ""}</span></div>`;

    if (!pairs.some((p) => p.subject)) {
      html += `<div class="free"><b>Пар нет</b>Свободный день</div>`;
    } else {
      let nextMarked = false;
      html += `<ol class="list">` + pairs.map((p) => {
        const cls = ["pair"]; let badge = "";
        if (!p.subject) cls.push("empty");
        if (p.exam) { cls.push("exam"); if (!/экзамен/i.test(p.subject)) badge = `<span class="badge exam">Важно</span>`; }
        if (isToday && p.subject) {
          const [a, b] = span(p.time);
          if (now.min >= a && now.min <= b) { cls.push("now"); badge = `<span class="badge now">Сейчас</span>`; }
          else if (now.min > b) cls.push("past");
          else if (!nextMarked) { nextMarked = true; badge += ` <span class="badge next">Далее</span>`; }
        }
        const meta = p.subject
          ? `<div class="meta">${p.room ? `<span class="room">каб. ${esc(p.room)}</span>` : ""}${p.teacher ? `<span>${esc(p.teacher)}</span>` : ""}</div>` : "";
        return `<li class="${cls.join(" ")}">
          <div class="time"><span class="num">${p.n !== "" && p.n != null ? esc(p.n) : "·"}</span>${p.time.map((t) => `<span class="t">${fmt(t)}</span>`).join("")}</div>
          <div>${badge}<div class="subj">${p.subject ? esc(p.subject) : "Окно"}</div>${meta}</div>
        </li>`;
      }).join("") + `</ol>`;
    }
    $("day").innerHTML = html;
  }

  // ---------- выбор группы ----------
  function renderList(q = "") {
    const list = GROUPS.filter((g) => !q || norm(g.name).includes(norm(q)));
    if (!list.length) { $("groupList").innerHTML = `<p class="empty-msg">Группа не найдена</p>`; return; }
    const courses = [...new Set(list.map((g) => g.course))].sort((a, b) => a - b);
    $("groupList").innerHTML = courses.map((c) =>
      `<h3>${c} курс</h3><div class="grid">` +
      list.filter((g) => g.course === c).sort((a, b) => a.name.localeCompare(b.name, "ru", { numeric: true }))
        .map((g) => `<button class="gitem${group && group.id === g.id ? " on" : ""}" data-id="${g.id}">${esc(g.name)}</button>`).join("") +
      `</div>`).join("");
  }
  function openSheet() {
    $("search").value = ""; renderList(); $("sheet").hidden = false;
    if (window.matchMedia("(min-width:600px)").matches) $("search").focus();
  }
  const closeSheet = () => { if (group) $("sheet").hidden = true; };

  $("groupBtn").onclick = openSheet;
  $("search").oninput = (e) => renderList(e.target.value);
  $("search").onkeydown = (e) => { if (e.key === "Enter") { const b = $("groupList").querySelector(".gitem"); if (b) b.click(); } };
  $("sheet").addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) return closeSheet();
    const b = e.target.closest(".gitem");
    if (b) { $("sheet").hidden = true; loadGroup(b.dataset.id); }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

  // ---------- навигация ----------
  $("tabs").addEventListener("click", (e) => { const b = e.target.closest(".tab"); if (b) { di = +b.dataset.i; render(); } });
  $("prev").onclick = () => { if (wi > 0) { wi--; di = 0; render(); } };
  $("next").onclick = () => { if (wi < weeks.length - 1) { wi++; di = 0; render(); } };
  let x0 = null, y0 = null;
  const main = document.querySelector("main");
  main.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  main.addEventListener("touchend", (e) => {
    if (x0 === null || !weeks.length) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0 && di < 5) di++; else if (dx > 0 && di > 0) di--;
      render();
    }
    x0 = null;
  });
  window.addEventListener("hashchange", () => { const id = location.hash.slice(1); if (id && (!group || id !== group.id)) loadGroup(id); });

  // ---------- старт ----------
  const initial = location.hash.slice(1) || localStorage.getItem("vit-group");
  if (initial && GROUPS.some((g) => g.id === initial)) loadGroup(initial);
  else if (GROUPS.length === 1) loadGroup(GROUPS[0].id);
  else { $("note").hidden = true; $("weekBar").hidden = true; openSheet(); }

  setInterval(() => { Object.assign(now, moscowNow()); if (group && weeks.length) render(); }, 60000);
})();
