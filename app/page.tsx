"use client";

import { FormEvent, useMemo, useRef, useState } from "react";

type CalendarEvent = { id: number; title: string; startSlot: number; endSlot: number; color: number };
type DragAction = { id: number; mode: "move" | "start" | "end"; duration: number };

const COLORS = ["#ff3b30", "#ff8500", "#ffc400", "#31a24c", "#00a98f", "#00a6cf", "#2979ff", "#6847e8", "#a83bc1", "#ed3981"];
const DEFAULT_NAMES = ["Urgent", "Build", "Planning", "Personal", "Review", "Research", "Work", "Publish", "Admin", "Ideas"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (value: string) => { const [year, month, day] = value.split("-").map(Number); return new Date(year, month - 1, day); };
const dayIndex = (value: string) => { const [year, month, day] = value.split("-").map(Number); return Math.floor(Date.UTC(year, month - 1, day) / 86400000); };
const slot = (value: string, half = 0) => dayIndex(value) * 2 + half;
const slotDate = (value: number) => { const d = new Date(Math.floor(value / 2) * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const makeEvent = (id: number, title: string, start: string, end: string, color: number): CalendarEvent => ({ id, title, startSlot: slot(start), endSlot: slot(end, 2), color });

const today = new Date();
const baseYear = today.getFullYear();
const baseMonth = today.getMonth();
const seed = (day: number) => `${baseYear}-${pad(baseMonth + 1)}-${pad(day)}`;
const INITIAL_EVENTS = [
  makeEvent(1, "Build garden wall", seed(4), seed(6), 0),
  makeEvent(2, "Electrical rough-in", seed(10), seed(12), 6),
  makeEvent(3, "Order timber", seed(8), seed(8), 2),
  makeEvent(4, "Kitchen install", seed(17), seed(21), 4),
  makeEvent(5, "Client walkthrough", seed(25), seed(25), 7),
];

export default function Home() {
  const [halfStep, setHalfStep] = useState(0);
  const [selectedYear, setSelectedYear] = useState(baseYear);
  const [events, setEvents] = useState<CalendarEvent[]>(INITIAL_EVENTS);
  const [colorNames, setColorNames] = useState(DEFAULT_NAMES);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [dragAction, setDragAction] = useState<DragAction | null>(null);
  const wheelLock = useRef(0);

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
  const openNew = (date = iso(new Date(view.year, view.month, view.half ? 15 : 1))) => setEditing({ id: Date.now(), title: "", startSlot: slot(date), endSlot: slot(date, 2), color: 6 });
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing?.title.trim()) return;
    const fixed = { ...editing, title: editing.title.trim(), endSlot: Math.max(editing.startSlot + 1, editing.endSlot) };
    setEvents(current => current.some(item => item.id === fixed.id) ? current.map(item => item.id === fixed.id ? fixed : item) : [...current, fixed]);
    setEditing(null);
  };
  const remove = () => { if (editing) setEvents(current => current.filter(item => item.id !== editing.id)); setEditing(null); };
  const beginDrag = (event: React.DragEvent, item: CalendarEvent, mode: DragAction["mode"]) => {
    event.stopPropagation();
    setDragAction({ id: item.id, mode, duration: item.endSlot - item.startSlot });
    event.dataTransfer.effectAllowed = "move";
  };
  const dropAt = (event: React.DragEvent, date: string) => {
    event.preventDefault();
    if (!dragAction) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const targetSlot = slot(date, event.clientX - rect.left >= rect.width / 2 ? 1 : 0);
    setEvents(current => current.map(item => {
      if (item.id !== dragAction.id) return item;
      if (dragAction.mode === "move") return { ...item, startSlot: targetSlot, endSlot: targetSlot + dragAction.duration };
      if (dragAction.mode === "start") return { ...item, startSlot: Math.min(targetSlot, item.endSlot - 1) };
      return { ...item, endSlot: Math.max(targetSlot + 1, item.startSlot + 1) };
    }));
    setDragAction(null);
  };
  const renameColor = (index: number, name: string) => setColorNames(current => current.map((value, i) => i === index ? name : value));

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
        <div className="actions"><button className="today-button" onClick={jumpToday}>Today</button><button className="add-button" onClick={() => openNew()}>＋ Add event</button></div>
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
                  return <div className="event-lane" key={item.id}><div draggable onDragStart={e => beginDrag(e, item, "move")} onDragEnd={() => setDragAction(null)} onDoubleClick={e => { e.stopPropagation(); setEditing({ ...item }); }} className={`event ${starts ? "event-start" : ""} ${ends ? "event-end" : ""}`} style={{ "--event-color": COLORS[item.color], left: `${left}%`, right: `${right}%` } as React.CSSProperties} title={`${item.title} · double-click to edit`}>
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

      <div className="legend" onWheel={e => e.stopPropagation()}>{COLORS.map((color, i) => <label key={color} title="Click to rename"><i style={{ background: color }} /><input value={colorNames[i]} onChange={e => renameColor(i, e.target.value)} aria-label={`Rename ${colorNames[i]} category`} /></label>)}</div>

      {editing && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setEditing(null)} onWheel={e => e.stopPropagation()}>
        <form className="modal" onSubmit={save}>
          <div className="modal-heading"><div><p>EVENT DETAILS</p><h2>{events.some(item => item.id === editing.id) ? "Edit event" : "New event"}</h2></div><button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close">×</button></div>
          <label>Event name<input autoFocus required value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Build wall" /></label>
          <div className="date-fields"><label>Starts<input type="date" required value={slotDate(editing.startSlot)} onChange={e => setEditing({ ...editing, startSlot: slot(e.target.value) })} /></label><label>Ends<input type="date" required min={slotDate(editing.startSlot)} value={slotDate(editing.endSlot - 1)} onChange={e => setEditing({ ...editing, endSlot: slot(e.target.value, 2) })} /></label></div>
          <fieldset><legend>Category</legend><div className="color-grid">{COLORS.map((color, i) => <button type="button" key={color} className={`color-dot ${editing.color === i ? "selected" : ""}`} style={{ background: color }} onClick={() => setEditing({ ...editing, color: i })} aria-label={colorNames[i]} title={colorNames[i]} />)}</div></fieldset>
          <div className="modal-actions">{events.some(item => item.id === editing.id) && <button type="button" className="delete" onClick={remove}>Delete</button>}<span /><button type="button" className="cancel" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="save">Save event</button></div>
        </form>
      </div>}
    </main>
  );
}
