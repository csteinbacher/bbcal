"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { assignEventLanes } from "./event-lanes";
import { supabase } from "./supabase";
import { todoSupabase } from "./todo-supabase";

type CalendarEvent = { id: number; title: string; startSlot: number; endSlot: number; color: number };
type DragAction = { id: number; mode: "move" | "start" | "end"; duration: number };
type CategoryRow = { id: number; name: string; color: string; sort_order: number };
type EventRow = { id: number; title: string; start_slot: number; end_slot: number; category_id: number };
type TodoList = { id: string; share_code: string; name: string; position: number };
type TodoItem = { id: string; list_id: string; title: string; is_completed: boolean; position: number };
type TodoLink = { id: number; todoListId: string; todoShareCode: string; startSlot: number; endSlot: number };
type TodoLinkRow = { id: number; todo_list_id: string; todo_share_code: string; start_slot: number; end_slot: number };
type TodoDraft = { todoListId: string; startDate: string; endDate: string };
type ViewerRole = "chris" | "viewer";

const DEFAULT_COLORS = ["#ff3b30", "#ff8500", "#ffc400", "#00a98f", "#00a6cf", "#2979ff", "#6847e8", "#a83bc1", "#ed3981"];
const DEFAULT_NAMES = ["Urgent", "Build", "Planning", "Review", "Research", "Work", "Publish", "Admin", "Ideas"];
const PRIVATE_PREFIX = "__BBCAL_PRIVATE__:";
const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayIndex = (value: string) => { const [year, month, day] = value.split("-").map(Number); return Math.floor(Date.UTC(year, month - 1, day) / 86400000); };
const slot = (value: string, half = 0) => dayIndex(value) * 2 + half;
const slotDate = (value: number) => { const d = new Date(Math.floor(value / 2) * 86400000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const today = new Date();
const baseYear = today.getFullYear();
const baseMonth = today.getMonth();
const toEvent = (row: EventRow): CalendarEvent => ({ id: Number(row.id), title: row.title, startSlot: row.start_slot, endSlot: row.end_slot, color: row.category_id });
const toTodoLink = (row: TodoLinkRow): TodoLink => ({ id: Number(row.id), todoListId: row.todo_list_id, todoShareCode: row.todo_share_code, startSlot: row.start_slot, endSlot: row.end_slot });

export default function Home() {
  const [halfStep, setHalfStep] = useState(0);
  const [selectedYear, setSelectedYear] = useState(baseYear);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [colors, setColors] = useState(DEFAULT_COLORS);
  const [colorNames, setColorNames] = useState(DEFAULT_NAMES);
  const [publicCategories, setPublicCategories] = useState(() => DEFAULT_NAMES.map(() => true));
  const [editing, setEditing] = useState<CalendarEvent | null>(null);
  const [dragAction, setDragAction] = useState<DragAction | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncError, setSyncError] = useState("");
  const [role, setRole] = useState<ViewerRole | null>(null);
  const [identityChecked, setIdentityChecked] = useState(false);
  const [choosingChris, setChoosingChris] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [todoLinks, setTodoLinks] = useState<TodoLink[]>([]);
  const [todoDraft, setTodoDraft] = useState<TodoDraft | null>(null);
  const [openTodoLink, setOpenTodoLink] = useState<TodoLink | null>(null);
  const [todoItems, setTodoItems] = useState<TodoItem[]>([]);
  const [todoLoading, setTodoLoading] = useState(false);
  const [todoError, setTodoError] = useState("");
  const wheelLock = useRef(0);

  const canEdit = role === "chris";
  const visibleEvents = useMemo(
    () => events.filter(item => canEdit || publicCategories[item.color]),
    [canEdit, events, publicCategories],
  );
  const eventLanes = useMemo(() => assignEventLanes(visibleEvents), [visibleEvents]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const savedRole = window.localStorage.getItem("bbcal-role");
      if (savedRole === "chris" || savedRole === "viewer") setRole(savedRole);
      setIdentityChecked(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!canEdit) return;
    let active = true;
    let retryTimer: number | undefined;
    const loadTodos = async () => {
      const [listsResult, linksResult] = await Promise.all([
        todoSupabase.from("todo_lists").select("id,share_code,name,position").order("position"),
        supabase.from("calendar_todo_links").select("id,todo_list_id,todo_share_code,start_slot,end_slot").order("start_slot"),
      ]);
      if (!active) return;
      if (listsResult.error || linksResult.error) {
        const source = listsResult.error ? "Todo database" : "Calendar todo links";
        setTodoError(`${source}: ${listsResult.error?.message || linksResult.error?.message || "Could not load todo lists."}`);
        retryTimer = window.setTimeout(loadTodos, 3000);
        return;
      }
      setTodoLists((listsResult.data || []) as TodoList[]);
      setTodoLinks(((linksResult.data || []) as TodoLinkRow[]).map(toTodoLink));
      setTodoError("");
    };
    loadTodos();
    return () => { active = false; if (retryTimer) window.clearTimeout(retryTimer); };
  }, [canEdit]);

  useEffect(() => {
    let active = true;
    const loadData = async () => {
      const [categoriesResult, eventsResult] = await Promise.all([
        supabase.from("categories").select("id,name,color,sort_order").order("sort_order"),
        supabase.from("events").select("id,title,start_slot,end_slot,category_id").order("start_slot"),
      ]);
      if (!active) return;
      if (categoriesResult.error || eventsResult.error) {
        setSyncError(`Calendar database: ${categoriesResult.error?.message || eventsResult.error?.message || "Could not load calendar data."}`);
      } else {
        const categories = (categoriesResult.data || []) as CategoryRow[];
        if (categories.length) {
          const nextColors = [...DEFAULT_COLORS]; const nextNames = [...DEFAULT_NAMES];
          const nextPublic = DEFAULT_NAMES.map(() => true);
          categories.forEach(category => {
            nextColors[category.id] = category.color;
            const isPublic = !category.name.startsWith(PRIVATE_PREFIX);
            nextPublic[category.id] = isPublic;
            nextNames[category.id] = isPublic ? category.name : category.name.slice(PRIVATE_PREFIX.length);
          });
          setColors(nextColors); setColorNames(nextNames);
          setPublicCategories(nextPublic);
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
  const openNew = (date = iso(new Date(view.year, view.month, view.half ? 15 : 1))) => {
    if (!canEdit) return;
    setEditing({ id: Date.now(), title: "", startSlot: slot(date), endSlot: slot(date, 2), color: 5 });
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || !editing?.title.trim()) return;
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
    if (!canEdit || !editing) return;
    const result = await supabase.from("events").delete().eq("id", editing.id);
    if (result.error) { setSyncError(result.error.message); return; }
    setEvents(current => current.filter(item => item.id !== editing.id)); setSyncError(""); setEditing(null);
  };
  const beginDrag = (event: React.DragEvent, item: CalendarEvent, mode: DragAction["mode"]) => {
    if (!canEdit) return;
    event.stopPropagation();
    setDragAction({ id: item.id, mode, duration: item.endSlot - item.startSlot });
    event.dataTransfer.effectAllowed = "move";
  };
  const dropAt = async (event: React.DragEvent, date: string) => {
    event.preventDefault();
    if (!canEdit || !dragAction) return;
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
  const renameColor = (index: number, name: string) => {
    if (canEdit) setColorNames(current => current.map((value, i) => i === index ? name : value));
  };
  const persistColorName = async (index: number) => {
    if (!canEdit) return;
    const name = colorNames[index].trim();
    if (!name) { setColorNames(current => current.map((value, i) => i === index ? DEFAULT_NAMES[index] : value)); return; }
    const storedName = publicCategories[index] ? name : `${PRIVATE_PREFIX}${name}`;
    const result = await supabase.from("categories").update({ name: storedName }).eq("id", index);
    if (result.error) setSyncError(result.error.message); else setSyncError("");
  };

  const setCategoryVisibility = async (index: number, isPublic: boolean) => {
    if (!canEdit || publicCategories[index] === isPublic) return;
    const previous = publicCategories[index];
    setPublicCategories(current => current.map((value, i) => i === index ? isPublic : value));
    const cleanName = colorNames[index].trim() || DEFAULT_NAMES[index];
    const storedName = isPublic ? cleanName : `${PRIVATE_PREFIX}${cleanName}`;
    const result = await supabase.from("categories").update({ name: storedName }).eq("id", index);
    if (result.error) {
      setPublicCategories(current => current.map((value, i) => i === index ? previous : value));
      setSyncError(result.error.message);
    } else setSyncError("");
  };

  const openTodoPicker = (date = iso(new Date(view.year, view.month, view.half ? 15 : 1))) => {
    if (!canEdit) return;
    setTodoError("");
    setTodoDraft({ todoListId: todoLists[0]?.id || "", startDate: date, endDate: date });
  };

  const attachTodoList = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canEdit || !todoDraft?.todoListId) return;
    const list = todoLists.find(item => item.id === todoDraft.todoListId);
    if (!list) return;
    const startSlot = slot(todoDraft.startDate);
    const endSlot = slot(todoDraft.endDate, 2);
    if (endSlot <= startSlot) { setTodoError("The end date must be on or after the start date."); return; }
    const result = await supabase.from("calendar_todo_links").insert({
      todo_list_id: list.id,
      todo_share_code: list.share_code,
      start_slot: startSlot,
      end_slot: endSlot,
    }).select("id,todo_list_id,todo_share_code,start_slot,end_slot").single();
    if (result.error) { setTodoError(result.error.message); return; }
    setTodoLinks(current => [...current, toTodoLink(result.data as TodoLinkRow)]);
    setTodoDraft(null); setTodoError("");
  };

  const showTodoList = async (link: TodoLink) => {
    if (!canEdit) return;
    setOpenTodoLink(link); setTodoItems([]); setTodoLoading(true); setTodoError("");
    const result = await todoSupabase.from("todo_items").select("id,list_id,title,is_completed,position").eq("list_id", link.todoListId).order("position");
    if (result.error) setTodoError(result.error.message);
    else setTodoItems((result.data || []) as TodoItem[]);
    setTodoLoading(false);
  };

  const toggleTodoItem = async (item: TodoItem) => {
    if (!canEdit) return;
    const nextValue = !item.is_completed;
    setTodoItems(current => current.map(todo => todo.id === item.id ? { ...todo, is_completed: nextValue } : todo));
    const result = await todoSupabase.from("todo_items").update({ is_completed: nextValue }).eq("id", item.id);
    if (result.error) {
      setTodoItems(current => current.map(todo => todo.id === item.id ? item : todo));
      setTodoError(result.error.message);
    } else setTodoError("");
  };

  const unlinkTodoList = async () => {
    if (!canEdit || !openTodoLink) return;
    const result = await supabase.from("calendar_todo_links").delete().eq("id", openTodoLink.id);
    if (result.error) { setTodoError(result.error.message); return; }
    setTodoLinks(current => current.filter(link => link.id !== openTodoLink.id));
    setOpenTodoLink(null); setTodoItems([]); setTodoError("");
  };

  const chooseViewer = () => {
    window.localStorage.setItem("bbcal-role", "viewer");
    setRole("viewer");
  };
  const unlockChris = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password !== "bbcal") { setPasswordError("That password is not correct."); return; }
    window.localStorage.setItem("bbcal-role", "chris");
    setRole("chris"); setPassword(""); setPasswordError("");
  };
  const forgetIdentity = () => {
    window.localStorage.removeItem("bbcal-role");
    setRole(null); setChoosingChris(false); setPassword(""); setPasswordError("");
    setTodoLists([]); setTodoLinks([]); setTodoItems([]); setOpenTodoLink(null); setTodoDraft(null); setTodoError("");
  };

  return (
    <main className={`calendar-shell ${canEdit ? "can-edit" : ""}`} onWheel={handleWheel}>
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
        <div className="actions"><button className="role-button" onClick={forgetIdentity} title="Change viewer">{canEdit ? "Chris" : "View only"}</button><span className={`sync-status ${syncError || todoError ? "sync-error" : ""}`} title={syncError || todoError || "Connected to Supabase"}>{loading ? "Loading…" : syncError || todoError ? "Sync error" : "● Saved"}</span><button className="today-button" onClick={jumpToday}>Today</button>{canEdit && <button className="todo-button" onClick={() => openTodoPicker()}>＋ Todo list</button>}{canEdit && <button className="add-button" onClick={() => openNew()}>＋ Add event</button>}</div>
      </header>

      <section className="calendar" aria-label={`${view.title} calendar`}>
        <div className="weekdays">{WEEKDAYS.map(day => <div key={day}>{day}</div>)}</div>
        <div className="month-grid" style={{ "--rows": view.cells.length / 7 } as React.CSSProperties}>
          {view.cells.map((date, cellIndex) => {
            if (!date) return <div className="day empty" key={`empty-${cellIndex}`} />;
            const dateIso = iso(date); const dayStart = slot(dateIso); const dayEnd = dayStart + 2;
            const dayEvents = visibleEvents
              .filter(item => item.startSlot < dayEnd && item.endSlot > dayStart)
              .sort((a, b) => (eventLanes.get(a.id) ?? 0) - (eventLanes.get(b.id) ?? 0));
            const laneEvents = new Map(dayEvents.map(item => [eventLanes.get(item.id) ?? 0, item]));
            const laneCount = dayEvents.length ? Math.max(...laneEvents.keys()) + 1 : 0;
            const dayTodoLinks = canEdit ? todoLinks.filter(link => link.startSlot < dayEnd && link.endSlot > dayStart) : [];
            const isToday = dateIso === iso(today);
            return <div className="day" data-date={dateIso} key={dateIso} onDoubleClick={e => { if (canEdit && e.target === e.currentTarget) openNew(dateIso); }} onDragOver={e => { if (canEdit) e.preventDefault(); }} onDrop={e => dropAt(e, dateIso)}>
              <div className="date-label">{isToday && <strong>TODAY</strong>}<button className={isToday ? "is-today" : ""} onClick={() => openNew(dateIso)} disabled={!canEdit} aria-label={canEdit ? `Add event on ${dateIso}` : dateIso}>{date.getDate()}</button></div>
              <div className="event-stack">
                {Array.from({ length: laneCount }, (_, lane) => {
                  const item = laneEvents.get(lane);
                  if (!item) return <div className="event-lane" aria-hidden="true" key={`empty-lane-${lane}`} />;
                  const starts = item.startSlot >= dayStart; const ends = item.endSlot <= dayEnd;
                  const left = Math.max(0, item.startSlot - dayStart) * 50;
                  const right = Math.max(0, dayEnd - item.endSlot) * 50;
                  return <div className={`event-lane ${!canEdit && !publicCategories[item.color] ? "private-category" : ""}`} key={item.id}><div draggable={canEdit} onDragStart={e => beginDrag(e, item, "move")} onDragEnd={() => setDragAction(null)} onDoubleClick={e => { if (canEdit) { e.stopPropagation(); setEditing({ ...item }); } }} className={`event ${starts ? "event-start" : ""} ${ends ? "event-end" : ""} ${canEdit ? "" : "read-only"}`} style={{ "--event-color": colors[item.color] || DEFAULT_COLORS[5], left: `${left}%`, right: `${right}%` } as React.CSSProperties} title={canEdit ? `${item.title} · double-click to edit` : item.title}>
                    {canEdit && starts && <span draggable className="resize-handle resize-left" onDragStart={e => beginDrag(e, item, "start")} aria-label="Resize event start" />}
                    {starts ? item.title : null}
                    {canEdit && ends && <span draggable className="resize-handle resize-right" onDragStart={e => beginDrag(e, item, "end")} aria-label="Resize event end" />}
                  </div></div>;
                })}
              </div>
              {dayTodoLinks.length > 0 && <div className="todo-link-stack">
                {dayTodoLinks.map(link => {
                  const list = todoLists.find(item => item.id === link.todoListId);
                  const starts = link.startSlot >= dayStart; const ends = link.endSlot <= dayEnd;
                  const left = Math.max(0, link.startSlot - dayStart) * 50;
                  const right = Math.max(0, dayEnd - link.endSlot) * 50;
                  return <div className="todo-link-lane" key={link.id}><button type="button" className={`todo-link ${starts ? "todo-link-start" : ""} ${ends ? "todo-link-end" : ""}`} style={{ left: `${left}%`, right: `${right}%` }} onClick={() => showTodoList(link)} title={`Open ${list?.name || "todo list"}`}>
                    {starts ? <><span aria-hidden="true">✓</span>{list?.name || "Todo list"}</> : null}
                  </button></div>;
                })}
              </div>}
            </div>;
          })}
        </div>
      </section>

      <footer className="category-footer" onWheel={e => e.stopPropagation()}>
        <div className="legend">{colors.map((color, i) => <label className={!canEdit && !publicCategories[i] ? "private-category" : ""} key={i} title={canEdit ? "Click to rename" : colorNames[i]}><i style={{ background: color }} /><input value={colorNames[i]} readOnly={!canEdit} onChange={e => renameColor(i, e.target.value)} onBlur={() => persistColorName(i)} onKeyDown={e => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label={`${canEdit ? "Rename" : "Category"} ${colorNames[i]}`} /></label>)}</div>
        {canEdit && <div className="visibility-manager" aria-label="Category visibility settings">
          <div className="visibility-bucket"><strong>Everyone can see</strong><div>{colors.map((color, i) => publicCategories[i] && <button key={i} onClick={() => setCategoryVisibility(i, false)} title="Make Chris only"><i style={{ background: color }} />{colorNames[i]}<span>→</span></button>)}</div></div>
          <div className="visibility-divider" aria-hidden="true" />
          <div className="visibility-bucket private-bucket"><strong>Chris only</strong><div>{colors.map((color, i) => !publicCategories[i] && <button key={i} onClick={() => setCategoryVisibility(i, true)} title="Make visible to everyone"><span>←</span><i style={{ background: color }} />{colorNames[i]}</button>)}</div></div>
        </div>}
      </footer>

      {editing && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setEditing(null)} onWheel={e => e.stopPropagation()}>
        <form className="modal" onSubmit={save}>
          <div className="modal-heading"><div><p>EVENT DETAILS</p><h2>{events.some(item => item.id === editing.id) ? "Edit event" : "New event"}</h2></div><button type="button" className="close" onClick={() => setEditing(null)} aria-label="Close">×</button></div>
          <label>Event name<input autoFocus required value={editing.title} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Build wall" /></label>
          <div className="date-fields"><label>Starts<input type="date" required value={slotDate(editing.startSlot)} onChange={e => setEditing({ ...editing, startSlot: slot(e.target.value) })} /></label><label>Ends<input type="date" required min={slotDate(editing.startSlot)} value={slotDate(editing.endSlot - 1)} onChange={e => setEditing({ ...editing, endSlot: slot(e.target.value, 2) })} /></label></div>
          <fieldset><legend>Category</legend><div className="color-grid">{colors.map((color, i) => <button type="button" key={i} className={`color-dot ${editing.color === i ? "selected" : ""}`} style={{ background: color }} onClick={() => setEditing({ ...editing, color: i })} aria-label={colorNames[i]} title={colorNames[i]} />)}</div></fieldset>
          <div className="modal-actions">{events.some(item => item.id === editing.id) && <button type="button" className="delete" onClick={remove}>Delete</button>}<span /><button type="button" className="cancel" onClick={() => setEditing(null)}>Cancel</button><button type="submit" className="save">Save event</button></div>
        </form>
      </div>}

      {canEdit && todoDraft && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setTodoDraft(null)} onWheel={e => e.stopPropagation()}>
        <form className="modal todo-picker-modal" onSubmit={attachTodoList}>
          <div className="modal-heading"><div><p>PRIVATE · CHRIS ONLY</p><h2>Attach a todo list</h2></div><button type="button" className="close" onClick={() => setTodoDraft(null)} aria-label="Close">×</button></div>
          <label>Todo list<select required autoFocus value={todoDraft.todoListId} onChange={e => setTodoDraft({ ...todoDraft, todoListId: e.target.value })}><option value="" disabled>{todoLists.length ? "Choose a list" : "No todo lists available"}</option>{todoLists.map(list => <option value={list.id} key={list.id}>{list.name}</option>)}</select></label>
          <div className="date-fields"><label>Starts<input type="date" required value={todoDraft.startDate} onChange={e => setTodoDraft({ ...todoDraft, startDate: e.target.value, endDate: e.target.value > todoDraft.endDate ? e.target.value : todoDraft.endDate })} /></label><label>Ends<input type="date" required min={todoDraft.startDate} value={todoDraft.endDate} onChange={e => setTodoDraft({ ...todoDraft, endDate: e.target.value })} /></label></div>
          {todoError && <p className="todo-error" role="alert">{todoError}</p>}
          <div className="modal-actions"><span /><button type="button" className="cancel" onClick={() => setTodoDraft(null)}>Cancel</button><button type="submit" className="save" disabled={!todoDraft.todoListId}>Attach list</button></div>
        </form>
      </div>}

      {canEdit && openTodoLink && <div className="modal-backdrop" onMouseDown={e => e.target === e.currentTarget && setOpenTodoLink(null)} onWheel={e => e.stopPropagation()}>
        <section className="modal todo-list-modal" role="dialog" aria-modal="true" aria-labelledby="todo-list-title">
          <div className="modal-heading"><div><p>PRIVATE · CHRIS ONLY</p><h2 id="todo-list-title">{todoLists.find(list => list.id === openTodoLink.todoListId)?.name || "Todo list"}</h2></div><button type="button" className="close" onClick={() => setOpenTodoLink(null)} aria-label="Close">×</button></div>
          {todoLoading ? <p className="todo-state">Loading tasks…</p> : todoItems.length ? <ul className="todo-modal-items">{todoItems.map(item => <li className={item.is_completed ? "completed" : ""} key={item.id}><label><input type="checkbox" checked={item.is_completed} onChange={() => toggleTodoItem(item)} /><span>{item.title}</span></label></li>)}</ul> : <p className="todo-state">This list has no tasks yet.</p>}
          {todoError && <p className="todo-error" role="alert">{todoError}</p>}
          <div className="modal-actions todo-modal-actions"><button type="button" className="delete" onClick={unlinkTodoList}>Remove from calendar</button><span /><button type="button" className="save" onClick={() => setOpenTodoLink(null)}>Done</button></div>
        </section>
      </div>}

      {identityChecked && !role && <div className="modal-backdrop identity-backdrop" onWheel={e => e.stopPropagation()}>
        {!choosingChris ? <section className="modal identity-modal" role="dialog" aria-modal="true" aria-labelledby="identity-title">
          <p className="eyebrow">WELCOME TO BBCAL</p><h2 id="identity-title">Who are you?</h2><p className="identity-copy">Choose how you want to open the calendar.</p>
          <div className="identity-options"><button className="identity-primary" onClick={() => setChoosingChris(true)}>Chris</button><button className="identity-secondary" onClick={chooseViewer}>Not Chris</button></div>
        </section> : <form className="modal identity-modal" onSubmit={unlockChris}>
          <button type="button" className="identity-back" onClick={() => { setChoosingChris(false); setPasswordError(""); }}>‹ Back</button><p className="eyebrow">CHRIS ACCESS</p><h2>Enter your password</h2>
          <label>Password<input autoFocus type="password" value={password} onChange={e => { setPassword(e.target.value); setPasswordError(""); }} aria-invalid={Boolean(passwordError)} /></label>
          {passwordError && <p className="password-error" role="alert">{passwordError}</p>}<button className="identity-primary identity-submit" type="submit">Open BBCal</button>
        </form>}
      </div>}
    </main>
  );
}
