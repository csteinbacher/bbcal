"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabase";

type CalendarEvent = { id: number; title: string; startSlot: number; endSlot: number; color: number };
type DragAction = { id: number; mode: "move" | "start" | "end"; duration: number };
type CategoryRow = { id: number; name: string; color: string; sort_order: number };
type EventRow = { id: number; title: string; start_slot: number; end_slot: number; category_id: number };

const DEFAULT_COLORS = ["#ff3b30", "#ff8500", "#ffc400", "#00a98f", "#00a6cf", "#2979ff", "#6847e8", "#a83bc1", "#ed3981"];
const DEFAULT_NAMES = ["Urgent", "Build", "Planning", "Review", "Research", "Work", "Publish", "Admin", "Ideas"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); };
const dayIndex = (value: string) => { const [year, month, day] = value.split("-").map(Number); return Math.floor(Date.UTC(year, month - 1, day) / 86400000); };
const slot = (value: string, half = 0) => dayIndex(value) * 2 + half;
const slotDate = (value: number) => { const d = new Date(Math.floor(value / 2) * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const today = new Date();
const baseYear = today.getFullYear();
const baseMonth = today.getMonth();
const toEvent = (row: EventRow): CalendarEvent => ({ id: Number(row.id), title: row.title, startSlot: row.start_slot, endSlot: row.end_slot, color: row.category_id });

export default function Home() {
  const [halfStep, setHalfStep] = useState(0);
  const [selectedYear, setSelectedYear] = useState(baseYear);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [colorNames, setColorNames] = useState(DEFAULT_NAMES);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [dragAction, setDragAction] = useState<DragAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState("");
  const wheelLock = useRef(0);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      const [categoriesResult, eventsResult] = await Promise.all([
        supabase.from("categories").select("id,name,color,sort_order").order("sort_order"),
        supabase.from("events").select("id,title,start_slot,end_slot,category_id").order("start_slot"),
      ]);
      if (!active) return;
      if (categoriesResult.error || eventsResult.error) {
        setSyncError(categoriesResult.error?.message || eventsResult.error?.message || "Could not load calendar data.");
      } else {
        const categories = (categoriesResult.data || []) as CategoryRow[];
        if (categories.length) {
          const nextColors = [...DEFAULT_COLORS]; const nextNames = [...DEFAULT_NAMES];
          categories.forEach(category => { nextColors[category.id] = category.color; nextNames[category.id] = category.name; });
          setColors(nextColors); setColorNames(nextNames);
        }
        setEvents(((eventsResult.data || []) as EventRow[]).map(toEvent));
      }
      setLoading(false);
    };
    loadData();
    return () => { active = false; };
  }, []);

  const view = useMemo(() => {
    const offsetMonths = Math.floor(halfStep / 2);
    const half = ((halfStep % 2) + 2) % 2;
    const monthStart = new Date(selectedYear, baseMonth + offsetMonths, 1);
    const rangeStart = half ? new Date(monthStart.getFullYear(), monthStart.getMonth(), 15) : monthStart;
    const rangeEnd = half ? new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 14) : new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const leading = rangeStart.getDay();
    const count = Math.round((rangeEnd.getTime() - rangeStart.getTime()) / 86400000) + 1;
    const cells: Array<Date | null> = Array.from({ length: leading }, () => null);
    for (let i = 0; i < count; i++) { const d = new Date(rangeStart); d.setDate(rangeStart.getDate() + i); cells.push(d); }
    while (cells.length % 7) cells.push(null);
    const title = half ? `${MONTHS[monthStart.getMonth()]} / ${MONTHS[(monthStart.getMonth() + 1) % 12]}` : MONTHS[monthStart.getMonth()];
    return { cells, title, year: monthStart.getFullYear(), month: monthStart.getMonth(), half };
  }, [halfStep, selectedYear]);

  const shift = (amount: number) => setHalfStep(current => current + amount);
  const jumpToday = () => { setSelectedYear(baseYear); setHalfStep(0); };
  const handleWheel = (event: React.WheelEvent) => {
    if (Math.abs(event.deltaY) < 8) return;
    const time = Date.now();
    if (time - wheelLock.current < 350) return;
    wheelLock.current = time;
    shift(event.deltaY > 0 ? 1 : -1);
  };
  const openNew = (date = iso(new Date(view.year, view.month, view.half ? 15 : 1))) => setEditing({ id: Date.now(), title: "", startSlot: slot(date), endSlot: slot(date, 2), color: 5 });
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing?.title.trim()) return;
    const fixed = { ...editing, title: editing.title.trim(), endSlot: Math.max(editing.startSlot + 1, editing.endSlot) };
    const exists = events.some(item => item.id === fixed.id);
    const values = { title: fixed.title, start_slot: fixed.startSlot, end_slot: fixed.endSlot, category_id: fixed.color };
    const result = exists
      ? await supabase.from("events").update(values).eq("id", fixed.id).select("id,title,start_slot,end_slot,category_id").single()
      : await supabase.from("events").insert(values).select("id,title,start_slot,end_slot,category_id").single();
    if (result.error) { setSyncError(result.error.message); return; }
    const saved = toEvent(result.data as EventRow);
    setEvents(current => exists ? current.map(item => item.id === saved.id ? saved : item) : [...current, saved]);
    setSyncError(""); setEditing(null);
  };
  const remove = async () => {
    if (!editing) return;
    const result = await supabase.from("events").delete().eq("id", editing.id);
    if (result.error) { setSyncError(result.error.message); return; }
    setEvents(current => current.filter(item => item.id !== editing.id)); setSyncError(""); setEditing(null);
  };
  const beginDrag = (event: React.DragEvent, item: CalendarEvent, mode: DragAction["mode"]) => {
    event.stopPropagation();
    setDragAction({ id: item.id, mode, duration: item.endSlot - item.startSlot });
    event.dataTransfer.effectAllowed = "move";
  };
  const dropAt = async (event: React.DragEvent, date: string) => {
    event.preventDefault();
    if (!dragAction) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const targetSlot = slot(date, event.clientX - rect.left >= rect.width / 2 ? 1 : 0);
    const original = events.find(item => item.id === dragAction.id);
    if (!original) return;
    let changed = original;
    if (dragAction.mode === "move") changed = { ...original, startSlot: targetSlot, endSlot: targetSlot + dragAction.duration };
    if (dragAction.mode === "start") changed = { ...original, startSlot: Math.min(targetSlot, original.endSlot - 1) };
    if (dragAction.mode === "end") changed = { ...original, endSlot: Math.max(targetSlot + 1, original.startSlot + 1) };
    setEvents(current => current.map(item => item.id === changed.id ? changed : item));
    setDragAction(null);
    const result = await supabase.from("events").update({ start_slot: changed.startSlot, end_slot: changed.endSlot }).eq("id", changed.id);
    if (result.error) {
      setEvents(current => current.map(item => item.id === original.id ? original : item));
      setSyncError(result.error.message);
    } else setSyncError("");
  };
  const renameColor = (index: number, name: string) => setColorNames(current => current.map((value, i) => i === index ? name : value));
  const persistColorName = async (index: number) => {
    const name = colorNames[index].trim();
    if (!name) { setColorNames(current => current.map((value, i) => i === index ? DEFAULT_NAMES[index] : value)); return; }
    const result = await supabase.from("categories").update({ name }).eq("id", index);
    if (result.error) setSyncError(result.error.message); else setSyncError("");
  };

  return (
    <main className="calendar-shell" onWheel={handleWheel}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">BB</span><span>BBCal</span></div>
        <div className="month-nav">
          <button className="icon-button" onClick={() => shift(-1)} aria-label="Previous half month">‹</button>
          <h1>{view.title}</h1>
          <select aria-label="Select year" value={selectedYear} onChange={e => { setSelectedYear(Number(e.target.value)); setHalfStep(0); }}>
            {Array.from({ length: 11 }, (_, i) => baseYear - 5 + i).map(year => <option key={year}>{year}</option>)}
          </select>
          <button className="icon-button" onClick={() => shift(1)} aria-label="Next half month">›</button>
        </div>
        <div className="actions"><span className={`sync-status ${syncError ? "sync-error" : ""}`} title={syncError || "Connected to Supabase"}>{loading ? "Loading…" : syncError ? "Sync error" : "● Saved"}</span><button className="today-button" onClick={jumpToday}>Today</button><button className="add-button" onClick={() => openNew()}>＋ Add event</button></div>
      </header>

      <section className="calendar" aria-label={`${view.title} calendar`}>
        <div className="weekdays">{WEEKDAYS.map(day => <div key={day}>{day}</div>)}</div>
        <div className="month-grid" style={{ "--rows": view.cells.length / 7 } as React.CSSProperties}>
          {view.cells.map((date, cellIndex) => {
            if (!date) return <div className="day empty" key={`empty-${cellIndex}`} />;
            const dateIso = iso(date); const dayStart = slot(dateIso); const dayEnd = dayStart + 2;
            const dayEvents = events.filter(item => item.startSlot < dayEnd && item.endSlot > dayStart).sort((a, b) => a.startSlot - b.startSlot || a.id - b.id);
            const isToday = dateIso === iso(today);
            return <div className="day" data-date={dateIso} key={dateIso} onDoubleClick={e => { if (e.target === e.currentTarget) openNew(dateIso); }} onDragOver={e => e.preventDefault()} onDrop={e => dropAt(e, dateIso)}>
              <div className="date-label">{isToday && <strong>TODAY</strong>}<button className={isToday ? "is-today" : ""} onClick={() => openNew(dateIso)} aria-label={`Add event on ${dateIso}`}>{date.getDate()}</button></div>
              <div className="event-stack">
                {dayEvents.map(item => {
                  const starts = item.startSlot >= dayStart; const ends = item.endSlot <= dayEnd;
                  const left = Math.max(0, item.startSlot - dayStart) * 50;
                  const right = Math.max(0, dayEnd - item.endSlot) * 50;
                  return <div className="event-lane" key={item.id}><div draggable onDragStart={e => beginDrag(e, item, "move")} onDragEnd={() => setDragAction(null)} onDoubleClick={e => { e.stopPropagation(); setEditing({ ...item }); }} className={`event ${starts ? "event-start" : ""} ${ends ? "event-end" : ""}`} style={{ "--event-color": colors[item.color] || DEFAULT_COLORS[5], left: `${left}%`, right: `${right}%` } as React.CSSProperties} title={`${item.title} · double-click to edit`}>
                    {starts && <span draggable className="resize-handle resize-left" onDragStart={e => beginDrag(e, item, "start")} aria-label="Resize event start" />}
                    {starts ? item.title : null}
                    {ends && <span draggable className="resize-handle resize-right" onDragStart={e => beginDrag(e, item, "end")} aria-label="Resize event end" />}
                  </div></div>;
                })}
              </div>
            </div>;
          })}
        </div>
      </section>

      <div className="legend" onWheel={e => e.stopPropagation()}>{colors.map((color, i) => <label key={i} title="Click to rename"><i style={{ background: color }} /><input value={colorNames[i]} onChange={e => renameColor(i, e.target.value)} onBlur={() => persistColorName(i)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label={`Rename ${colorNames[i]} category`} /></label>)}</div>

      {editing && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setEditing(null)} onWheel={e => e.stopPropagation()}>
        <form className="modal" onSubmit={save}>
          <div className="modal-heading"><div><p>EVENT DETAILS</p><h2>{events.some(item => item.id === editing.id) ? "Edit event" : "New event"}</h2></div><button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close">×</button></div>
          <label>Event name<input autoFocus required value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Build wall" /></label>
          <div className="date-fields"><label>Starts<input type="date" required value={slotDate(editing.startSlot)} onChange={e => setEditing({ ...editing, startSlot: slot(e.target.value) })} /></label><label>Ends<input type="date" required min={slotDate(editing.startSlot)} value={slotDate(editing.endSlot - 1)} onChange={e => setEditing({ ...editing, endSlot: slot(e.target.value, 2) })} /></label></div>
          <fieldset><legend>Category</legend><div className="color-grid">{colors.map((color, i) => <button type="button" key={i} className={`color-dot ${editing.color === i ? "selected" : ""}`} style={{ background: color }} onClick={() => setEditing({ ...editing, color: i })} aria-label={colorNames[i]} title={colorNames[i]} />)}</div></fieldset>
          <div className="modal-actions">{events.some(item => item.id === editing.id) && <button type="button" className="delete" onClick={remove}>Delete</button>}<span /><button type="button" className="cancel" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="save">Save event</button></div>
        </form>
      </div>}
    </main>
  );
}
