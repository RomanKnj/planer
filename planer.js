/* Planer: Aktivitäten einer Gruppe Tag für Tag als Zeitleiste. Alle Daten liegen in Supabase (supabase.sql), die
   Seite spricht nur mit den Funktionen pl_*. Im Browser gemerkt werden nur Gruppen-Code und eigener Name.
   Andere Geräte sieht man beim Zurückkehren auf die Seite und alle 30 Sekunden.
   Alle Texte gehen über textContent, nie über innerHTML. */
(() => {
  "use strict";
  const $ = (sel) => document.querySelector(sel);
  const SUPA_URL = "https://wluqvllrnrcuiykquevi.supabase.co";
  const SUPA_KEY = "sb_publishable_V-r7ggXqjjDBbTXpgzAIeg_qL6IyAue"; // öffentlich, erlaubt nur die Funktionen pl_*
  const STORE_KEY = "planer-gruppe";
  const REFRESH = 30000;
  const MONTHS = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const DAYS = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const DAYS_LONG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
  // id, Name, Farbe, übliche Dauer in Minuten (wird beim Anlegen vorgeschlagen)
  const KINDS = [
    ["kino", "Kino", "#5fd9ff", 150],
    ["essen", "Essen", "#ffb62e", 90],
    ["bar", "Bar", "#c38bff", 120],
    ["konzert", "Konzert", "#ff6b9d", 180],
    ["sport", "Sport", "#34e0c0", 90],
    ["ausflug", "Ausflug", "#8ee26b", 180],
    ["fahrt", "Fahrt", "#8aa4b8", 30],
    ["sonstiges", "Sonstiges", "#d9f7ff", 60],
  ];
  const kindOf = (id) => KINDS.find((k) => k[0] === id) || KINDS[KINDS.length - 1];

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => iso(new Date());
  const dayNum = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
  const fromDayNum = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
  const weekday = (s) => new Date(dayNum(s) * 86400000).getUTCDay();
  const short = (s) => `${DAYS[weekday(s)]} ${s.slice(8)}.${s.slice(5, 7)}.`;
  const longName = (s) => `${DAYS_LONG[weekday(s)]}, ${Number(s.slice(8))}. ${MONTHS[Number(s.slice(5, 7)) - 1]}`;
  const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
  const clock = (min) => `${pad(Math.floor(min / 60) % 24)}:${pad(min % 60)}`;
  const endOf = (a) => toMin(a.start) + a.duration;
  const span = (min) => (min >= 60 ? `${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ""}` : `${min} min`);
  const euro = (cents) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(cents / 100);
  const make = (tag, cls, text) => {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text != null) el.textContent = text;
    return el;
  };

  let conn = null;   // code, group_name, name
  let acts = [];     // alle Aktivitäten der Gruppe, sortiert nach Tag und Beginn
  let loadError = "";
  let sel = todayIso();
  let calYear = Number(sel.slice(0, 4));
  let calMonth = Number(sel.slice(5, 7)) - 1;
  let editing = null; // Aktivität im Dialog, {} für eine neue
  let durTouched = false;
  let changes = 0;    // eigene Änderungen; ein Laden, das davor losging, ist veraltet und wird verworfen
  try { conn = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { conn = null; }

  function saveConn(c) {
    conn = c;
    try { if (c) localStorage.setItem(STORE_KEY, JSON.stringify(c)); else localStorage.removeItem(STORE_KEY); } catch (e) { /* nur für diese Sitzung */ }
  }

  async function rpc(fn, args) {
    let res;
    try {
      res = await fetch(`${SUPA_URL}/rest/v1/rpc/${fn}`, {
        method: "POST", headers: { apikey: SUPA_KEY, "Content-Type": "application/json" }, body: JSON.stringify(args),
      });
    } catch (err) {
      throw new Error("Keine Verbindung");
    }
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(res.status < 500 && body && body.message ? body.message : "Datenbank gerade nicht erreichbar");
    return body;
  }

  const banner = (text, level) => { $("#banner-text").textContent = text; $("#banner").dataset.level = level; };
  const actsOn = (day) => acts.filter((a) => a.day === day);

  // ---------- Laden ----------

  async function load() {
    if (!conn) return;
    const seen = changes;
    try {
      const plan = await rpc("pl_plan", { p_code: conn.code });
      if (seen !== changes) return;
      if (!plan) { loadError = "Diese Gruppe gibt es nicht mehr"; renderAll(); return; }
      acts = plan.activities;
      loadError = "";
      if (plan.group_name !== conn.group_name) saveConn({ ...conn, group_name: plan.group_name });
    } catch (err) {
      loadError = err.message;
    }
    renderAll();
  }

  // ---------- Anzeige ----------

  function renderBanner() {
    if (!conn) { banner("Gruppe wählen", "wait"); return; }
    if (loadError) { banner(loadError, "alarm"); return; }
    const list = actsOn(sel);
    const label = sel === todayIso() ? "Heute" : short(sel);
    if (!list.length) { banner(`${label}: nichts geplant`, "wait"); return; }
    const cost = list.reduce((s, a) => s + a.cost_cents, 0);
    banner(`${label}: ${list.length} ${list.length === 1 ? "Aktivität" : "Aktivitäten"}${cost ? ` · ${euro(cost)}` : ""}`, "ok");
  }

  function renderDay() {
    $("#day-name").textContent = sel === todayIso() ? `Heute, ${longName(sel).split(", ")[1]}` : longName(sel);
    const list = actsOn(sel);
    const items = [];
    let prevEnd = null;
    list.forEach((a) => {
      const start = toMin(a.start);
      if (prevEnd != null && start !== prevEnd) {
        const over = start < prevEnd;
        const gap = make("li", over ? "gap over" : "gap");
        gap.append(make("span", null, over ? `Überschneidung: ${span(prevEnd - start)}` : `${span(start - prevEnd)} frei`));
        items.push(gap);
      }
      prevEnd = Math.max(prevEnd ?? 0, endOf(a));
      items.push(activityItem(a));
    });
    $("#timeline").replaceChildren(...items);
    $("#day-empty").hidden = list.length > 0;

    const sum = $("#day-sum");
    sum.hidden = !list.length;
    if (list.length) {
      const first = toMin(list[0].start);
      const last = Math.max(...list.map(endOf));
      const cost = list.reduce((s, a) => s + a.cost_cents, 0);
      const left = make("span", null, "Zeitraum ");
      left.append(make("b", null, `${clock(first)}–${clock(last)}${last >= 1440 ? " (+1)" : ""}`));
      const right = make("span", null, "Kosten p. P. ");
      right.append(make("b", null, euro(cost)));
      sum.replaceChildren(left, right);
    }
  }

  function activityItem(a) {
    const k = kindOf(a.kind);
    const li = make("li", "act");
    li.style.setProperty("--k", k[2]);
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    const end = endOf(a);
    const time = make("div", "act-time");
    time.append(make("b", null, a.start), make("small", null, a.duration ? `${clock(end)}${end >= 1440 ? "+1" : ""}` : ""));
    const card = make("div", "act-card");
    card.append(make("span", "act-kind", k[1]), make("b", null, a.title));
    const meta = make("div", "act-meta");
    if (a.place) meta.append(make("span", null, a.place));
    if (a.duration) meta.append(make("span", null, span(a.duration)));
    if (a.cost_cents) meta.append(make("span", "cost", euro(a.cost_cents)));
    if (meta.childNodes.length) card.append(meta);
    if (a.note) card.append(make("p", "act-note", a.note));
    card.append(make("small", "act-by", a.created_by === a.updated_by ? `von ${a.created_by}` : `von ${a.created_by}, geändert von ${a.updated_by}`));
    li.append(time, make("div", "act-bar"), card);
    li.addEventListener("click", () => openEditor(a));
    li.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openEditor(a); } });
    return li;
  }

  function renderCalendar() {
    $("#cal-name").textContent = `${MONTHS[calMonth]} ${calYear}`;
    const today = todayIso();
    const first = `${calYear}-${pad(calMonth + 1)}-01`;
    const lead = (weekday(first) + 6) % 7; // Woche beginnt am Montag
    const days = new Date(Date.UTC(calYear, calMonth + 1, 0)).getUTCDate();
    const cells = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => make("span", "wd", d));
    for (let i = 0; i < lead; i++) cells.push(make("span"));
    for (let d = 1; d <= days; d++) {
      const day = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
      const list = actsOn(day);
      const b = make("button", null, String(d));
      b.type = "button";
      b.classList.toggle("has", list.length > 0);
      b.classList.toggle("today", day === today);
      b.classList.toggle("sel", day === sel);
      b.classList.toggle("past", day < today);
      if (list.length) {
        b.setAttribute("aria-label", `${d}. ${MONTHS[calMonth]}: ${list.map((a) => a.title).join(", ")}`);
        const dots = make("span", "dots");
        list.slice(0, 4).forEach((a) => { const i = make("i"); i.style.setProperty("--k", kindOf(a.kind)[2]); dots.append(i); });
        b.append(dots);
      }
      b.addEventListener("click", () => selectDay(day));
      cells.push(b);
    }
    $("#cal").replaceChildren(...cells);
  }

  function renderNext() {
    const today = todayIso();
    const byDay = new Map();
    acts.filter((a) => a.day >= today).forEach((a) => { if (!byDay.has(a.day)) byDay.set(a.day, []); byDay.get(a.day).push(a); });
    const rows = [...byDay].slice(0, 8).map(([day, list]) => {
      const li = make("li");
      li.append(make("time", null, day === today ? "Heute" : short(day)), make("span", null, list.map((a) => a.title).join(" › ")),
        make("small", null, list[0].start));
      li.addEventListener("click", () => selectDay(day));
      return li;
    });
    $("#next").replaceChildren(...rows);
    $("#next-empty").hidden = rows.length > 0;
  }

  function renderGroup() {
    $("#grp-name").textContent = conn.group_name;
    $("#grp-code").textContent = `Code ${conn.code}`;
    if (document.activeElement !== $("#me-name")) $("#me-name").value = conn.name;
    $("#brand-sub").textContent = conn.group_name;
  }

  function renderAll() {
    $("#join").hidden = Boolean(conn);
    ["#day", "#cal-panel", "#group"].forEach((s) => { $(s).hidden = !conn; });
    renderBanner();
    if (!conn) return;
    renderDay();
    renderCalendar();
    renderNext();
    renderGroup();
  }

  function selectDay(d) {
    sel = d;
    calYear = Number(d.slice(0, 4));
    calMonth = Number(d.slice(5, 7)) - 1;
    $("#day-note").textContent = "";
    renderAll();
    if (window.matchMedia("(max-width: 900px)").matches) $("#day").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- Bearbeiten ----------

  function renderKinds() {
    $("#kinds").replaceChildren(...KINDS.map(([id, name, color, dur]) => {
      const b = make("button", "chip", name);
      b.type = "button";
      b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", String(editing.kind === id));
      b.style.setProperty("--k", color);
      b.addEventListener("click", () => {
        editing.kind = id;
        if (!durTouched) { $("#f-dur").value = dur; syncEnd(); }
        renderKinds();
      });
      return b;
    }));
  }

  function syncEnd() {
    const start = $("#f-start").value;
    const dur = Number($("#f-dur").value);
    $("#f-end").value = start && Number.isFinite(dur) ? clock(toMin(start) + dur) : "";
  }

  function openEditor(a) {
    const isNew = !a;
    if (isNew) {
      // Neue Aktivität beginnt, wo die letzte des Tages aufhört (auf 15 min aufgerundet), sonst um 18 Uhr
      const list = actsOn(sel);
      const last = list.length ? Math.max(...list.map(endOf)) : null;
      const start = last == null ? 18 * 60 : Math.min(Math.ceil(last / 15) * 15, 23 * 60 + 45);
      a = { day: sel, start: clock(start), duration: kindOf("sonstiges")[3], kind: "sonstiges", title: "", place: "", note: "", cost_cents: 0 };
    }
    editing = { ...a };
    durTouched = !isNew;
    $("#edit-title").textContent = isNew ? "Neue Aktivität" : "Aktivität bearbeiten";
    $("#f-title").value = a.title;
    $("#f-day").value = a.day;
    $("#f-start").value = a.start;
    $("#f-dur").value = a.duration;
    $("#f-cost").value = a.cost_cents ? (a.cost_cents / 100).toFixed(2).replace(".", ",") : "";
    $("#f-place").value = a.place;
    $("#f-note").value = a.note;
    $("#edit-meta").textContent = isNew ? "" : `Angelegt von ${a.created_by}, zuletzt geändert von ${a.updated_by}`;
    $("#edit-note").textContent = "";
    $("#delete").hidden = isNew;
    syncEnd();
    renderKinds();
    $("#edit").showModal();
    if (isNew) $("#f-title").focus();
  }

  function closeEditor() {
    editing = null;
    $("#edit").close();
  }

  function parseCost(v) {
    const s = v.trim().replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    if (!s) return 0;
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
  }

  async function saveEditor() {
    const note = $("#edit-note");
    const cost = parseCost($("#f-cost").value);
    const dur = Number($("#f-dur").value);
    if (!$("#f-title").value.trim()) { note.textContent = "Titel fehlt."; $("#f-title").focus(); return; }
    if (!$("#f-day").value || !$("#f-start").value) { note.textContent = "Datum und Beginn fehlen."; return; }
    if (!Number.isInteger(dur) || dur < 0 || dur > 1440) { note.textContent = "Dauer: 0 bis 1440 Minuten."; return; }
    if (cost == null) { note.textContent = "Kosten: bitte als Zahl, z. B. 12,50."; return; }
    note.textContent = "Speichere …";
    $("#save").disabled = true;
    try {
      const saved = await rpc("pl_save", {
        p_code: conn.code, p_name: conn.name, p_id: editing.id || null, p_day: $("#f-day").value, p_start: $("#f-start").value,
        p_duration: dur, p_kind: editing.kind, p_title: $("#f-title").value, p_place: $("#f-place").value,
        p_note: $("#f-note").value, p_cost_cents: cost,
      });
      changes++;
      acts = acts.filter((x) => x.id !== saved.id).concat(saved)
        .sort((x, y) => x.day.localeCompare(y.day) || x.start.localeCompare(y.start) || x.updated_at.localeCompare(y.updated_at));
      closeEditor();
      selectDay(saved.day);
    } catch (err) {
      note.textContent = err.message;
    } finally {
      $("#save").disabled = false;
    }
  }

  async function deleteEditor() {
    const a = editing; // der Dialog kann während des Wartens geschlossen werden
    if (!confirm(`„${a.title}“ löschen? Das gilt für alle in der Gruppe.`)) return;
    try {
      await rpc("pl_delete", { p_code: conn.code, p_id: a.id });
      changes++;
      acts = acts.filter((x) => x.id !== a.id);
      closeEditor();
      renderAll();
    } catch (err) {
      $("#edit-note").textContent = err.message;
    }
  }

  $("#add").addEventListener("click", () => openEditor(null));
  $("#save").addEventListener("click", saveEditor);
  $("#cancel").addEventListener("click", closeEditor);
  $("#delete").addEventListener("click", deleteEditor);
  $("#edit").addEventListener("close", () => { editing = null; });
  $("#edit-form").addEventListener("submit", (e) => { e.preventDefault(); saveEditor(); });
  $("#f-start").addEventListener("input", syncEnd);
  $("#f-dur").addEventListener("input", () => { durTouched = true; syncEnd(); });
  $("#f-end").addEventListener("input", () => {
    const start = $("#f-start").value;
    const end = $("#f-end").value;
    if (!start || !end) return;
    durTouched = true;
    $("#f-dur").value = (toMin(end) - toMin(start) + 1440) % 1440; // Ende vor Beginn heißt: nach Mitternacht
  });

  // ---------- Teilen ----------

  async function share(text, noteEl, done) {
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text);
      noteEl.textContent = done;
    } catch (err) {
      if (err.name !== "AbortError") noteEl.textContent = "Teilen ging nicht";
    }
  }

  function dayText(day) {
    const list = actsOn(day);
    const lines = [`${longName(day)} ${day.slice(0, 4)}`];
    list.forEach((a) => {
      const end = endOf(a);
      let line = `${a.start}${a.duration ? `–${clock(end)}` : ""} ${kindOf(a.kind)[1]}: ${a.title}`;
      if (a.place) line += ` (${a.place})`;
      if (a.cost_cents) line += `, ${euro(a.cost_cents)}`;
      lines.push(line);
    });
    const cost = list.reduce((s, a) => s + a.cost_cents, 0);
    if (cost) lines.push(`Kosten p. P.: ${euro(cost)}`);
    return lines.join("\n");
  }

  $("#share-day").addEventListener("click", () => {
    if (!actsOn(sel).length) { $("#day-note").textContent = "Noch nichts zum Teilen"; return; }
    share(dayText(sel), $("#day-note"), "Plan kopiert");
  });

  const inviteLink = () => `${location.origin}${location.pathname}?code=${conn.code}`;
  $("#invite").addEventListener("click", () => share(`Plan mit mir in „${conn.group_name}“: ${inviteLink()}`, $("#grp-note"), "Einladungslink kopiert"));
  $("#grp-code").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(conn.code); $("#grp-note").textContent = "Code kopiert"; } catch (err) { $("#grp-note").textContent = `Code: ${conn.code}`; }
  });

  // ---------- Gruppe ----------

  async function joinOrCreate(create) {
    const note = $("#join-note");
    const name = $("#join-name").value.trim().replace(/\s+/g, " ");
    const value = (create ? $("#join-group") : $("#join-code")).value.trim();
    if (name.length < 2) { note.textContent = "Dein Name fehlt (mindestens 2 Zeichen)."; return; }
    if (!value) { note.textContent = create ? "Name der neuen Gruppe fehlt." : "Gruppen-Code fehlt."; return; }
    note.textContent = "Moment …";
    try {
      const g = create ? await rpc("pl_create_group", { p_group_name: value }) : await rpc("pl_plan", { p_code: value });
      if (!g) { note.textContent = "Diesen Gruppen-Code gibt es nicht."; return; }
      saveConn({ code: g.code, group_name: g.group_name, name });
      changes++;
      acts = g.activities || [];
      loadError = "";
      note.textContent = "";
      renderAll();
    } catch (err) {
      note.textContent = err.message;
    }
  }

  $("#join-form").addEventListener("submit", (e) => { e.preventDefault(); joinOrCreate(false); });
  $("#create-btn").addEventListener("click", () => joinOrCreate(true));
  $("#me-name").addEventListener("change", () => {
    const name = $("#me-name").value.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 24) { $("#grp-note").textContent = "Name: 2 bis 24 Zeichen"; $("#me-name").value = conn.name; return; }
    saveConn({ ...conn, name });
    $("#grp-note").textContent = "Name gespeichert";
  });
  $("#leave").addEventListener("click", () => {
    if (!confirm(`„${conn.group_name}“ auf diesem Gerät verlassen? Die Pläne bleiben für die anderen erhalten, mit dem Code ${conn.code} kommst du wieder rein.`)) return;
    $("#join-name").value = conn.name;
    saveConn(null);
    changes++;
    acts = [];
    loadError = "";
    renderAll();
  });

  // ---------- Bedienung ----------

  $("#day-prev").addEventListener("click", () => selectDay(fromDayNum(dayNum(sel) - 1)));
  $("#day-next").addEventListener("click", () => selectDay(fromDayNum(dayNum(sel) + 1)));
  $("#day-today").addEventListener("click", () => selectDay(todayIso()));
  const shiftCal = (n) => { const k = calYear * 12 + calMonth + n; calYear = Math.floor(k / 12); calMonth = k % 12; renderCalendar(); };
  $("#cal-prev").addEventListener("click", () => shiftCal(-1));
  $("#cal-next").addEventListener("click", () => shiftCal(1));

  // Einladungslink ?code=…: Code ins Beitreten-Feld, bei anderer Gruppe vorher fragen
  const params = new URLSearchParams(location.search);
  const invited = (params.get("code") || "").trim().toUpperCase();
  if (invited) {
    history.replaceState(null, "", location.pathname);
    if (conn && conn.code !== invited && confirm(`Einladung in eine andere Gruppe (${invited}). Wechseln? Deine bisherige Gruppe ist ${conn.group_name} (Code ${conn.code}).`)) {
      $("#join-name").value = conn.name;
      saveConn(null);
    }
    if (!conn) $("#join-code").value = invited;
  }

  // Andere Geräte: neu laden beim Zurückkehren und regelmäßig, aber nicht, während der Dialog offen ist
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !editing) load(); });
  setInterval(() => { if (!document.hidden && !editing) load(); }, REFRESH);

  renderAll();
  load();
})();
