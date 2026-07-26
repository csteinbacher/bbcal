"use client";

import { FormEvent, useMemo, useState } from "react";

type CalendarEvent = {
  id: number;
  title: string;
  start: string;
  end: string;
  color: number;
};

const COLORS = ["#e95d4f", "#ee8a3d", "#e1ae36", "#75a65b", "#35a78c", "#369bb0", "#4f7fc4", "#7768c7", "#aa62b2", "#d76591"];
const COLOR_NAMES = ["Coral", "Orange", "Gold", "Green", "Teal", "Aqua", "Blue", "Indigo", "Plum", "Pink"];
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (value: string) => { const [y, m, d] = value.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (value: string, days: number) => { const d = parseDate(value); d.setDate(d.getDate() + days); return iso(d); };
const daysBetween = (a: string, b: string) => Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);

const now = new Date();
const y = now.getFullYear();
const m = now.getMonth();
const seed = (day: number) => `${y}-${pad(m + 1)}-${pad(day)}`;

const INITIAL_EVENTS: CalendarEvent[] = [
  { id: 1, title: "Build garden wall", start: seed(4), end: seed(6), color: 0 },
  { id: 2, title: "Electrical rough-in", start: seed(10), end: seed(12), color: 6 },
  { id: 3, title: "Order timber", start: seed(8), end: seed(8), color: 2 },
  { id: 4, title: "Kitchen install", start: seed(17), end: seed(21), color: 4 },
  { id: 5, title: "Client walkthrough", start: seed(25), end: seed(25), color: 8 },
];

export default function Home() {
  const [cursor, setCursor] = useState(new Date(y, m, 1));
  const [events, setEvents] = useState<CalendarEvent[]>(INITIAL_EVENTS);
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(first); gridStart.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); return d; });
  }, [cursor]);

  const changeMonth = (offset: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + offset, 1));
  const openNew = (date = iso(new Date(cursor.getFullYear(), cursor.getMonth(), 1))) => setEditing({ id: Date.now(), title: "", start: date, end: date, color: 6 });
  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing || !editing.title.trim()) return;
    const fixed = { ...editing, title: editing.title.trim(), end: editing.end < editing.start ? editing.start : editing.end };
    setEvents(current => current.some(item => item.id === fixed.id) ? current.map(item => item.id === fixed.id ? fixed : item) : [...current, fixed]);
    setEditing(null);
  };
  const remove = () => { if (!editing) return; setEvents(current => current.filter(item => item.id !== editing.id)); setEditing(null); };
  const moveTo = (date: string) => {
    if (dragging === null) return;
    setEvents(current => current.map(item => item.id === dragging ? { ...item, start: date, end: addDays(date, daysBetween(item.start, item.end)) } : item));
    setDragging(null);
  };

  return (
    <main className="calendar-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">P</span><span>Planboard</span></div>
        <div className="month-nav">
          <button className="icon-button" onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
          <h1>{MONTHS[cursor.getMonth()]}</h1>
          <select aria-label="Select year" value={cursor.getFullYear()} onChange={e => setCursor(new Date(Number(e.target.value), cursor.getMonth(), 1))}>
            {Array.from({ length: 11 }, (_, i) => y - 5 + i).map(year => <option key={year}>{year}</option>)}
          </select>
          <button className="icon-button" onClick={() => changeMonth(1)} aria-label="Next month">›</button>
        </div>
        <div className="actions">
          <button className="today-button" onClick={() => setCursor(new Date(y, m, 1))}>Today</button>
          <button className="add-button" onClick={() => openNew()}>＋ Add event</button>
        </div>
      </header>

      <section className="calendar" aria-label={`${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()} calendar`}>
        <div className="weekdays">{WEEKDAYS.map(day => <div key={day}>{day}</div>)}</div>
        <div className="month-grid">
          {days.map(date => {
            const dateIso = iso(date);
            const dayEvents = events.filter(item => item.start <= dateIso && item.end >= dateIso).sort((a, b) => a.start.localeCompare(b.start));
            const isToday = dateIso === iso(now);
            const outside = date.getMonth() !== cursor.getMonth();
            return (
              <div className={`day ${outside ? "outside" : ""}`} key={dateIso} onDoubleClick={() => openNew(dateIso)} onDragOver={e => e.preventDefault()} onDrop={() => moveTo(dateIso)}>
                <button className={`date-number ${isToday ? "is-today" : ""}`} onClick={() => openNew(dateIso)} aria-label={`Add event on ${dateIso}`}>{date.getDate()}</button>
                <div className="event-stack">
                  {dayEvents.map(item => {
                    const start = item.start === dateIso; const end = item.end === dateIso;
                    return <button key={item.id} draggable onDragStart={() => setDragging(item.id)} onDragEnd={() => setDragging(null)} onClick={() => setEditing({ ...item })} className={`event ${start ? "event-start" : "event-continue"} ${end ? "event-end" : ""}`} style={{ "--event-color": COLORS[item.color] } as React.CSSProperties} title={`${item.title} · ${item.start} to ${item.end}`}>{start ? item.title : <span aria-hidden="true">···</span>}</button>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <div className="legend">{COLORS.map((color, i) => <span key={color}><i style={{ background: color }} />{COLOR_NAMES[i]}</span>)}</div>

      {editing && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setEditing(null)}>
        <form className="modal" onSubmit={save}>
          <div className="modal-heading"><div><p>EVENT DETAILS</p><h2>{events.some(item => item.id === editing.id) ? "Edit event" : "New event"}</h2></div><button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close">×</button></div>
          <label>Event name<input autoFocus required value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Build wall" /></label>
          <div className="date-fields"><label>Starts<input type="date" required value={editing.start} onChange={e => setEditing({ ...editing, start: e.target.value })} /></label><label>Ends<input type="date" required min={editing.start} value={editing.end} onChange={e => setEditing({ ...editing, end: e.target.value })} /></label></div>
          <fieldset><legend>Category color</legend><div className="color-grid">{COLORS.map((color, i) => <button type="button" key={color} className={`color-dot ${editing.color === i ? "selected" : ""}`} style={{ background: color }} onClick={() => setEditing({ ...editing, color: i })} aria-label={COLOR_NAMES[i]} />)}</div></fieldset>
          <div className="modal-actions">{events.some(item => item.id === editing.id) && <button type="button" className="delete" onClick={remove}>Delete</button>}<span /><button type="button" className="cancel" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="save">Save event</button></div>
        </form>
      </div>}
    </main>
  );
}
