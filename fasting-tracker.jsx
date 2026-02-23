import { useState, useEffect } from "react";

// ─── Storage ───────────────────────────────────────────────────────────────
const KEYS = {
  fastingLog:   "ft_fasting_log",
  foodLog:      "ft_food_log",
  waterLog:     "ft_water_log",
  activeFast:   "ft_active_fast",
  waterGoal:    "ft_water_goal",
  waterPresets: "ft_water_presets",
};
const DEFAULT_PRESETS = [8, 16, 24];

const load = async (key) => {
  try { const r = await window.storage.get(key); return r ? JSON.parse(r.value) : null; }
  catch { return null; }
};
const save = async (key, val) => {
  try { await window.storage.set(key, JSON.stringify(val)); } catch {}
};

// ─── Helpers ───────────────────────────────────────────────────────────────
const fmtDur = (ms) => {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
};
const fmtDate = (ts) => new Date(ts).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" });
const fmtTime = (ts) => new Date(ts).toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit" });
const toLocalISO = (ts) => {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2,"0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalISO = (str) => new Date(str).getTime();
const todayStr = () => new Date().toDateString();

const TABS      = ["Fast","Food","Water","Log"];
const TAB_ICONS = ["⏱","🥗","💧","📋"];
const PROTOCOLS = [{ label:"16:8", h:16 },{ label:"18:6", h:18 },{ label:"20:4", h:20 },{ label:"OMAD", h:23 }];
const FOOD_CATS = ["🥣 Breakfast","🥗 Lunch","🍽 Dinner","🍎 Snack","☕ Drink"];

// ─── Reusable bottom-sheet modal ────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center", background:"rgba(0,0,0,0.65)", backdropFilter:"blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background:"#1a1a24", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"24px 24px 0 0", width:"100%", maxWidth:430, padding:"24px 20px 44px", animation:"slideUp 0.25s ease" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <span style={{ fontSize:17, fontWeight:600 }}>{title}</span>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.08)", border:"none", color:"#aaa", borderRadius:"50%", width:32, height:32, fontSize:16, cursor:"pointer" }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Field label ────────────────────────────────────────────────────────────
function FL({ children }) {
  return <div style={{ fontSize:11, letterSpacing:1.5, color:"#888", textTransform:"uppercase", marginBottom:6, marginTop:14 }}>{children}</div>;
}

// ─── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab]                   = useState(0);
  const [loaded, setLoaded]             = useState(false);

  // Fasting state
  const [activeFast, setActiveFast]     = useState(null);
  const [elapsed, setElapsed]           = useState(0);
  const [protocol, setProtocol]         = useState(16);
  const [fastingLog, setFastingLog]     = useState([]);
  const [celebrate, setCelebrate]       = useState(false);

  // Food state
  const [foodLog, setFoodLog]           = useState([]);
  const [foodEntry, setFoodEntry]       = useState({ name:"", cal:"", cat:"🥣 Breakfast", note:"" });
  const [showFoodForm, setShowFoodForm] = useState(false);

  // Water state
  const [waterLog, setWaterLog]         = useState([]);
  const [waterGoal, setWaterGoal]       = useState(64);
  const [waterPresets, setWaterPresets] = useState(DEFAULT_PRESETS);
  const [waterAmt, setWaterAmt]         = useState(8);
  const [customInput, setCustomInput]   = useState("");
  const [showCustom, setShowCustom]     = useState(false);

  // Edit modals — each holds { index, data } or null
  const [editFast, setEditFast]   = useState(null);
  const [editFood, setEditFood]   = useState(null);
  const [editWater, setEditWater] = useState(null);

  // ── Load saved data ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [fl, food, water, af, wg, wp] = await Promise.all([
        load(KEYS.fastingLog), load(KEYS.foodLog),   load(KEYS.waterLog),
        load(KEYS.activeFast), load(KEYS.waterGoal), load(KEYS.waterPresets),
      ]);
      if (fl)    setFastingLog(fl);
      if (food)  setFoodLog(food);
      if (water) setWaterLog(water);
      if (af)    setActiveFast(af);
      if (wg)    setWaterGoal(wg);
      if (wp)    setWaterPresets(wp);
      setLoaded(true);
    })();
  }, []);

  // ── Live timer ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeFast) return;
    const id = setInterval(() => setElapsed(Date.now() - activeFast.start), 1000);
    setElapsed(Date.now() - activeFast.start);
    return () => clearInterval(id);
  }, [activeFast]);

  // ── Fasting actions ──────────────────────────────────────────────────────
  const startFast = async () => {
    const fast = { start: Date.now(), protocol };
    setActiveFast(fast);
    await save(KEYS.activeFast, fast);
  };

  const endFast = async () => {
    if (!activeFast) return;
    const now   = Date.now();
    const entry = { ...activeFast, end: now, duration: now - activeFast.start, id: activeFast.start };
    const updated = [entry, ...fastingLog];
    setFastingLog(updated);
    setActiveFast(null);
    setElapsed(0);
    await save(KEYS.fastingLog, updated);
    await save(KEYS.activeFast, null);
    if (entry.duration >= activeFast.protocol * 3600000) {
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 3000);
    }
  };

  const openEditFast = (index) => {
    const f = fastingLog[index];
    setEditFast({ index, data: { protocol: f.protocol, startISO: toLocalISO(f.start), endISO: toLocalISO(f.end) } });
  };

  const saveFastEdit = async () => {
    if (!editFast) return;
    const { index, data } = editFast;
    const startTs = fromLocalISO(data.startISO);
    const endTs   = fromLocalISO(data.endISO);
    if (!startTs || !endTs || endTs <= startTs) return;
    const updated = fastingLog.map((f, i) =>
      i === index ? { ...f, start: startTs, end: endTs, duration: endTs - startTs, protocol: data.protocol } : f
    );
    setFastingLog(updated);
    setEditFast(null);
    await save(KEYS.fastingLog, updated);
  };

  // ── Food actions ─────────────────────────────────────────────────────────
  const addFood = async () => {
    if (!foodEntry.name.trim()) return;
    const entry = { ...foodEntry, ts: Date.now(), id: Date.now() };
    const updated = [entry, ...foodLog];
    setFoodLog(updated);
    setFoodEntry({ name:"", cal:"", cat:"🥣 Breakfast", note:"" });
    setShowFoodForm(false);
    await save(KEYS.foodLog, updated);
  };

  const openEditFood = (index) => {
    const e = foodLog[index];
    setEditFood({ index, data: { name: e.name, cal: e.cal || "", cat: e.cat, note: e.note || "", tsISO: toLocalISO(e.ts) } });
  };

  const saveFoodEdit = async () => {
    if (!editFood) return;
    const { index, data } = editFood;
    const updated = foodLog.map((f, i) =>
      i === index ? { ...f, name: data.name, cal: data.cal, cat: data.cat, note: data.note, ts: fromLocalISO(data.tsISO) } : f
    );
    setFoodLog(updated);
    setEditFood(null);
    await save(KEYS.foodLog, updated);
  };

  // ── Water actions ────────────────────────────────────────────────────────
  const addWater = async () => {
    const entry   = { amount: waterAmt, ts: Date.now(), id: Date.now() };
    const updated = [entry, ...waterLog];
    setWaterLog(updated);
    await save(KEYS.waterLog, updated);
  };

  const openEditWater = (index) => {
    const e = waterLog[index];
    setEditWater({ index, data: { amount: e.amount, tsISO: toLocalISO(e.ts) } });
  };

  const saveWaterEdit = async () => {
    if (!editWater) return;
    const { index, data } = editWater;
    const updated = waterLog.map((w, i) =>
      i === index ? { ...w, amount: Number(data.amount), ts: fromLocalISO(data.tsISO) } : w
    );
    setWaterLog(updated);
    setEditWater(null);
    await save(KEYS.waterLog, updated);
  };

  const saveCustomPreset = async () => {
    const val = parseInt(customInput);
    if (!val || val <= 0 || val > 9999) return;
    const updated = waterPresets.includes(val) ? waterPresets : [...waterPresets, val].sort((a,b) => a - b);
    setWaterPresets(updated);
    setWaterAmt(val);
    setCustomInput("");
    setShowCustom(false);
    await save(KEYS.waterPresets, updated);
  };

  const removePreset = async (val) => {
    if (DEFAULT_PRESETS.includes(val)) return;
    const updated = waterPresets.filter(p => p !== val);
    setWaterPresets(updated);
    if (waterAmt === val) setWaterAmt(updated[0] || 8);
    await save(KEYS.waterPresets, updated);
  };

  // ── Generic delete ───────────────────────────────────────────────────────
  const deleteItem = async (log, setLog, key, id) => {
    const updated = log.filter(e => (e.id ?? e.start) !== id);
    setLog(updated);
    await save(key, updated);
  };

  // ── Derived values ───────────────────────────────────────────────────────
  const progress    = activeFast ? Math.min((elapsed / (activeFast.protocol * 3600000)) * 100, 100) : 0;
  const goalReached = activeFast && elapsed >= activeFast.protocol * 3600000;
  const todayFood   = foodLog.filter(e => new Date(e.ts).toDateString() === todayStr());
  const todayCals   = todayFood.reduce((s, e) => s + (parseInt(e.cal) || 0), 0);
  const todayWater  = waterLog.filter(e => new Date(e.ts).toDateString() === todayStr());
  const todayOz     = todayWater.reduce((s, e) => s + e.amount, 0);
  const waterPct    = Math.min((todayOz / waterGoal) * 100, 100);

  // Edit fast duration preview
  const editFastDur = editFast && editFast.data.startISO && editFast.data.endISO
    ? fromLocalISO(editFast.data.endISO) - fromLocalISO(editFast.data.startISO)
    : null;

  if (!loaded) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", background:"#0f0f14", color:"#fff", fontFamily:"sans-serif" }}>
      Loading…
    </div>
  );

  return (
    <div style={{ fontFamily:"'DM Sans', sans-serif", background:"#0f0f14", minHeight:"100vh", color:"#f0f0f0", maxWidth:430, margin:"0 auto", position:"relative" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Space+Mono:wght@400;700&display=swap');
        *  { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0f0f14; }
        ::-webkit-scrollbar { display: none; }
        .card { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 20px; }
        .btn-primary { background: linear-gradient(135deg,#6ee7b7,#3b82f6); color: #0f0f14; border: none; border-radius: 14px; padding: 14px 28px; font-family: 'DM Sans',sans-serif; font-weight: 600; font-size: 16px; cursor: pointer; width: 100%; transition: opacity .2s, transform .1s; }
        .btn-primary:active { opacity:.85; transform:scale(0.98); }
        .btn-save { background: linear-gradient(135deg,#6ee7b7,#3b82f6); color: #0f0f14; border: none; border-radius: 12px; padding: 13px 20px; font-family: 'DM Sans',sans-serif; font-weight: 600; font-size: 15px; cursor: pointer; width: 100%; transition: opacity .2s; }
        .btn-save:active { opacity: .85; }
        .btn-edit { background: rgba(110,231,183,0.1); color: #6ee7b7; border: 1px solid rgba(110,231,183,0.3); border-radius: 9px; padding: 5px 11px; font-size: 12px; cursor: pointer; font-family: 'DM Sans',sans-serif; font-weight: 600; transition: background .2s; white-space: nowrap; }
        .btn-edit:active { background: rgba(110,231,183,0.25); }
        .btn-danger { background: rgba(239,68,68,0.12); color: #f87171; border: 1px solid rgba(239,68,68,0.25); border-radius: 9px; padding: 5px 11px; font-size: 12px; cursor: pointer; font-family: 'DM Sans',sans-serif; transition: background .2s; white-space: nowrap; }
        .btn-danger:active { background: rgba(239,68,68,0.3); }
        input, select { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.12); border-radius: 12px; padding: 11px 14px; color: #f0f0f0; font-family: 'DM Sans',sans-serif; font-size: 15px; width: 100%; outline: none; transition: border-color .2s; }
        input:focus, select:focus { border-color: rgba(110,231,183,0.5); }
        select option { background: #1a1a24; }
        .protocol-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 10px; padding: 8px 14px; color: #aaa; font-size: 13px; font-weight: 600; cursor: pointer; transition: all .2s; white-space: nowrap; font-family: 'Space Mono',monospace; }
        .protocol-btn.active { background: rgba(110,231,183,0.15); border-color: #6ee7b7; color: #6ee7b7; }
        .water-quick { background: rgba(59,130,246,0.15); border: 1px solid rgba(59,130,246,0.3); color: #93c5fd; border-radius: 10px; padding: 8px 13px; font-size: 13px; cursor: pointer; font-family: 'DM Sans',sans-serif; font-weight: 600; transition: background .2s; white-space: nowrap; }
        .water-quick.sel { background: rgba(59,130,246,0.35); border-color: #60a5fa; }
        .log-item { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 13px 14px; }
        .row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
        .acts { display: flex; gap: 6px; align-items: center; flex-shrink: 0; }
        @keyframes fadeIn  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideUp { from { transform:translateY(100%); }           to { transform:translateY(0); } }
        @keyframes celebrate { 0%,100%{transform:scale(1)} 50%{transform:scale(1.04)} }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.55} }
        .celebrate { animation: celebrate .35s ease 3; }
        .pulse     { animation: pulse 2s ease-in-out infinite; }
        .tab-cnt   { animation: fadeIn .22s ease; }
        .ring-track { fill:none; stroke:rgba(255,255,255,0.07); stroke-width:12; }
        .ring-fill  { fill:none; stroke-width:12; stroke-linecap:round; transition:stroke-dashoffset .5s ease; }
        input[type="datetime-local"] { color-scheme: dark; }
        .modal-label { font-size:11px; letter-spacing:1.5px; color:#888; text-transform:uppercase; display:block; margin-bottom:6px; margin-top:16px; }
        .modal-label:first-child { margin-top:0; }
      `}</style>

      {/* ── Celebration overlay ─────────────────────────────────────────── */}
      {celebrate && (
        <div style={{ position:"fixed", inset:0, zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.75)", backdropFilter:"blur(6px)" }}>
          <div style={{ textAlign:"center" }}>
            <div style={{ fontSize:72 }}>🎉</div>
            <div style={{ fontSize:24, fontWeight:700, color:"#6ee7b7", marginTop:12 }}>Fast Complete!</div>
            <div style={{ color:"#aaa", marginTop:6 }}>You crushed your goal!</div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          EDIT FAST MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {editFast && (
        <Modal title="Edit Fast" onClose={() => setEditFast(null)}>
          <span className="modal-label">Protocol</span>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:2 }}>
            {PROTOCOLS.map(p => (
              <button key={p.label}
                className={`protocol-btn ${editFast.data.protocol === p.h ? "active" : ""}`}
                onClick={() => setEditFast(ef => ({ ...ef, data:{ ...ef.data, protocol:p.h } }))}>
                {p.label}
              </button>
            ))}
          </div>

          <span className="modal-label">Start Time</span>
          <input type="datetime-local" value={editFast.data.startISO}
            onChange={e => setEditFast(ef => ({ ...ef, data:{ ...ef.data, startISO:e.target.value } }))} />

          <span className="modal-label">End Time</span>
          <input type="datetime-local" value={editFast.data.endISO}
            onChange={e => setEditFast(ef => ({ ...ef, data:{ ...ef.data, endISO:e.target.value } }))} />

          {editFastDur !== null && (
            editFastDur > 0
              ? <div style={{ marginTop:12, padding:"10px 14px", background:"rgba(110,231,183,0.08)", borderRadius:10, fontSize:13, color:"#6ee7b7" }}>
                  Duration: <strong>{fmtDur(editFastDur)}</strong> &nbsp;·&nbsp; {Math.round((editFastDur / (editFast.data.protocol * 3600000)) * 100)}% of goal
                </div>
              : <div style={{ marginTop:12, padding:"10px 14px", background:"rgba(239,68,68,0.08)", borderRadius:10, fontSize:13, color:"#f87171" }}>
                  End time must be after start time
                </div>
          )}

          <div style={{ marginTop:18 }}>
            <button className="btn-save" onClick={saveFastEdit}
              disabled={!editFastDur || editFastDur <= 0}
              style={{ opacity: (!editFastDur || editFastDur <= 0) ? 0.4 : 1 }}>
              Save Changes
            </button>
          </div>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          EDIT FOOD MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {editFood && (
        <Modal title="Edit Food Entry" onClose={() => setEditFood(null)}>
          <span className="modal-label">Category</span>
          <select value={editFood.data.cat}
            onChange={e => setEditFood(ef => ({ ...ef, data:{ ...ef.data, cat:e.target.value } }))}>
            {FOOD_CATS.map(c => <option key={c}>{c}</option>)}
          </select>

          <span className="modal-label">Food Name</span>
          <input value={editFood.data.name}
            onChange={e => setEditFood(ef => ({ ...ef, data:{ ...ef.data, name:e.target.value } }))} />

          <span className="modal-label">Calories</span>
          <input type="number" placeholder="optional" value={editFood.data.cal}
            onChange={e => setEditFood(ef => ({ ...ef, data:{ ...ef.data, cal:e.target.value } }))} />

          <span className="modal-label">Notes</span>
          <input placeholder="optional" value={editFood.data.note}
            onChange={e => setEditFood(ef => ({ ...ef, data:{ ...ef.data, note:e.target.value } }))} />

          <span className="modal-label">Date & Time</span>
          <input type="datetime-local" value={editFood.data.tsISO}
            onChange={e => setEditFood(ef => ({ ...ef, data:{ ...ef.data, tsISO:e.target.value } }))} />

          <div style={{ marginTop:18 }}>
            <button className="btn-save" onClick={saveFoodEdit}>Save Changes</button>
          </div>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          EDIT WATER MODAL
      ══════════════════════════════════════════════════════════════════ */}
      {editWater && (
        <Modal title="Edit Water Entry" onClose={() => setEditWater(null)}>
          <span className="modal-label">Amount (fl oz)</span>
          <input type="number" value={editWater.data.amount}
            onChange={e => setEditWater(ew => ({ ...ew, data:{ ...ew.data, amount:e.target.value } }))} />

          <span className="modal-label">Date & Time</span>
          <input type="datetime-local" value={editWater.data.tsISO}
            onChange={e => setEditWater(ew => ({ ...ew, data:{ ...ew.data, tsISO:e.target.value } }))} />

          <div style={{ marginTop:18 }}>
            <button className="btn-save" onClick={saveWaterEdit}>Save Changes</button>
          </div>
        </Modal>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ padding:"52px 20px 16px", background:"linear-gradient(180deg,rgba(110,231,183,0.05) 0%,transparent 100%)" }}>
        <div className="row">
          <div>
            <div style={{ fontSize:11, letterSpacing:3, color:"#6ee7b7", textTransform:"uppercase", fontWeight:600 }}>FastTrack</div>
            <div style={{ fontSize:22, fontWeight:600, marginTop:2 }}>
              {new Date().toLocaleDateString("en-US", { weekday:"long", month:"short", day:"numeric" })}
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:11, color:"#666", letterSpacing:1 }}>TODAY</div>
            <div style={{ fontSize:18, fontWeight:600, color: todayCals > 0 ? "#fbbf24" : "#555" }}>
              {todayCals} <span style={{ fontSize:12, color:"#666", fontWeight:400 }}>kcal</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tab content area ────────────────────────────────────────────── */}
      <div style={{ padding:"0 16px 110px", overflowY:"auto", maxHeight:"calc(100vh - 148px)" }}>

        {/* ════════════════ FAST TAB ════════════════ */}
        {tab === 0 && (
          <div className="tab-cnt">
            {!activeFast && (
              <div className="card" style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, letterSpacing:2, color:"#888", textTransform:"uppercase", marginBottom:12 }}>Protocol</div>
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {PROTOCOLS.map(p => (
                    <button key={p.label} className={`protocol-btn ${protocol === p.h ? "active" : ""}`} onClick={() => setProtocol(p.h)}>
                      {p.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize:12, color:"#555", marginTop:10 }}>
                  Fast <span style={{ color:"#6ee7b7", fontWeight:600 }}>{protocol}h</span> · eat within <span style={{ color:"#6ee7b7", fontWeight:600 }}>{24-protocol}h</span>
                </div>
              </div>
            )}

            {/* Timer ring card */}
            <div className={`card ${goalReached ? "celebrate" : ""}`} style={{ marginBottom:16, display:"flex", flexDirection:"column", alignItems:"center", padding:"28px 20px" }}>
              <div style={{ position:"relative", width:200, height:200 }}>
                <svg width="200" height="200" viewBox="0 0 200 200" style={{ transform:"rotate(-90deg)" }}>
                  <circle className="ring-track" cx="100" cy="100" r="84" />
                  <circle className="ring-fill" cx="100" cy="100" r="84"
                    stroke={goalReached ? "#6ee7b7" : "url(#rGrad)"}
                    strokeDasharray={`${2*Math.PI*84}`}
                    strokeDashoffset={`${2*Math.PI*84*(1-progress/100)}`} />
                  <defs>
                    <linearGradient id="rGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#6ee7b7"/><stop offset="100%" stopColor="#3b82f6"/>
                    </linearGradient>
                  </defs>
                </svg>
                <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                  {activeFast ? (
                    <>
                      <div className={goalReached ? "" : "pulse"} style={{ fontFamily:"'Space Mono',monospace", fontSize:28, fontWeight:700, color: goalReached ? "#6ee7b7" : "#f0f0f0" }}>
                        {fmtDur(elapsed)}
                      </div>
                      <div style={{ fontSize:12, color:"#666", marginTop:4 }}>{goalReached ? "✅ Goal reached!" : `Goal: ${activeFast.protocol}h`}</div>
                      <div style={{ fontSize:13, color:"#6ee7b7", fontWeight:600, marginTop:4 }}>{Math.round(progress)}%</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize:40 }}>⏱</div>
                      <div style={{ fontSize:13, color:"#666", marginTop:6 }}>Ready to start</div>
                    </>
                  )}
                </div>
              </div>
              {activeFast && (
                <div style={{ display:"flex", gap:20, marginTop:16, fontSize:12, color:"#666" }}>
                  <span>Started: <span style={{ color:"#aaa" }}>{fmtTime(activeFast.start)}</span></span>
                  <span>Goal end: <span style={{ color:"#aaa" }}>{fmtTime(activeFast.start + activeFast.protocol*3600000)}</span></span>
                </div>
              )}
            </div>

            {activeFast
              ? <button className="btn-primary" onClick={endFast} style={{ background:"linear-gradient(135deg,#f87171,#ec4899)" }}>End Fast</button>
              : <button className="btn-primary" onClick={startFast}>Start {protocol}h Fast</button>
            }

            {/* Recent fasts list */}
            {fastingLog.length > 0 && (
              <div style={{ marginTop:24 }}>
                <div style={{ fontSize:11, letterSpacing:2, color:"#888", textTransform:"uppercase", marginBottom:12 }}>Recent Fasts</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {fastingLog.slice(0,5).map((f, i) => {
                    const pct = Math.min(Math.round((f.duration/(f.protocol*3600000))*100),100);
                    return (
                      <div key={f.id ?? f.start} className="log-item">
                        <div className="row" style={{ alignItems:"flex-start" }}>
                          <div>
                            <div style={{ fontFamily:"'Space Mono',monospace", fontWeight:700, fontSize:16 }}>{fmtDur(f.duration)}</div>
                            <div style={{ fontSize:12, color:"#666", marginTop:2 }}>{fmtDate(f.start)} · {f.protocol}h goal</div>
                            <div style={{ fontSize:11, color:"#555", marginTop:1 }}>{fmtTime(f.start)} → {fmtTime(f.end)}</div>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6, flexShrink:0 }}>
                            <div style={{ fontSize:14, fontWeight:600, color: pct>=100 ? "#6ee7b7" : "#fbbf24" }}>{pct}%</div>
                            <div className="acts">
                              <button className="btn-edit" onClick={() => openEditFast(i)}>✏️ Edit</button>
                              <button className="btn-danger" onClick={() => deleteItem(fastingLog, setFastingLog, KEYS.fastingLog, f.id ?? f.start)}>✕</button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ════════════════ FOOD TAB ════════════════ */}
        {tab === 1 && (
          <div className="tab-cnt">
            <div className="row" style={{ marginBottom:16 }}>
              <div>
                <div style={{ fontSize:11, letterSpacing:2, color:"#888", textTransform:"uppercase" }}>Today's Food</div>
                <div style={{ fontSize:22, fontWeight:600, marginTop:2 }}>{todayCals} <span style={{ fontSize:14, color:"#666", fontWeight:400 }}>kcal</span></div>
              </div>
              <button onClick={() => { setShowFoodForm(!showFoodForm); setFoodEntry({ name:"", cal:"", cat:"🥣 Breakfast", note:"" }); }}
                className="btn-primary" style={{ width:"auto", padding:"10px 20px", fontSize:14 }}>
                {showFoodForm ? "Cancel" : "+ Add"}
              </button>
            </div>

            {showFoodForm && (
              <div className="card" style={{ marginBottom:16, display:"flex", flexDirection:"column", gap:10 }}>
                <select value={foodEntry.cat} onChange={e => setFoodEntry(f => ({ ...f, cat:e.target.value }))}>
                  {FOOD_CATS.map(c => <option key={c}>{c}</option>)}
                </select>
                <input placeholder="Food name *" value={foodEntry.name} onChange={e => setFoodEntry(f => ({ ...f, name:e.target.value }))} />
                <input placeholder="Calories (optional)" type="number" value={foodEntry.cal} onChange={e => setFoodEntry(f => ({ ...f, cal:e.target.value }))} />
                <input placeholder="Notes (optional)" value={foodEntry.note} onChange={e => setFoodEntry(f => ({ ...f, note:e.target.value }))} />
                <button className="btn-primary" onClick={addFood}>Save Entry</button>
              </div>
            )}

            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {foodLog.length === 0 && (
                <div style={{ textAlign:"center", padding:"40px 0", color:"#444", fontSize:14 }}>
                  <div style={{ fontSize:36, marginBottom:8 }}>🥗</div>No food logged yet
                </div>
              )}
              {foodLog.map((entry, i) => (
                <div key={entry.id} className="log-item">
                  <div className="row" style={{ alignItems:"flex-start" }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:600, fontSize:15 }}>{entry.name}</div>
                      <div style={{ fontSize:12, color:"#666", marginTop:2 }}>{entry.cat} · {fmtDate(entry.ts)} {fmtTime(entry.ts)}</div>
                      {entry.note && <div style={{ fontSize:12, color:"#888", marginTop:2, fontStyle:"italic" }}>{entry.note}</div>}
                    </div>
                    <div className="acts">
                      {entry.cal && <span style={{ fontFamily:"'Space Mono',monospace", color:"#fbbf24", fontWeight:700, fontSize:13 }}>{entry.cal}</span>}
                      <button className="btn-edit" onClick={() => openEditFood(i)}>✏️</button>
                      <button className="btn-danger" onClick={() => deleteItem(foodLog, setFoodLog, KEYS.foodLog, entry.id)}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════ WATER TAB ════════════════ */}
        {tab === 2 && (
          <div className="tab-cnt">
            {/* Progress ring */}
            <div className="card" style={{ marginBottom:16, textAlign:"center" }}>
              <div style={{ fontSize:11, letterSpacing:2, color:"#888", textTransform:"uppercase", marginBottom:16 }}>Daily Progress</div>
              <div style={{ position:"relative", display:"inline-block", width:140, height:140 }}>
                <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform:"rotate(-90deg)" }}>
                  <circle className="ring-track" cx="70" cy="70" r="58" strokeWidth="10"/>
                  <circle className="ring-fill" cx="70" cy="70" r="58" strokeWidth="10"
                    stroke="url(#wGrad)"
                    strokeDasharray={`${2*Math.PI*58}`}
                    strokeDashoffset={`${2*Math.PI*58*(1-waterPct/100)}`}/>
                  <defs>
                    <linearGradient id="wGrad" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#93c5fd"/><stop offset="100%" stopColor="#3b82f6"/>
                    </linearGradient>
                  </defs>
                </svg>
                <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                  <div style={{ fontSize:26, fontWeight:700, fontFamily:"'Space Mono',monospace", color:"#93c5fd", lineHeight:1 }}>{todayOz}</div>
                  <div style={{ fontSize:10, color:"#555", marginTop:2 }}>fl oz</div>
                  <div style={{ fontSize:11, color:"#666", marginTop:4 }}>of {waterGoal} fl oz</div>
                </div>
              </div>
              <div style={{ marginTop:14, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <span style={{ fontSize:12, color:"#666" }}>Daily goal:</span>
                <input type="number" value={waterGoal}
                  onChange={async e => { setWaterGoal(+e.target.value); await save(KEYS.waterGoal, +e.target.value); }}
                  style={{ width:64, textAlign:"center", padding:"6px 8px", fontSize:14 }} />
                <span style={{ fontSize:12, color:"#666" }}>fl oz</span>
              </div>
              {waterPct >= 100 && <div style={{ marginTop:10, fontSize:13, color:"#6ee7b7", fontWeight:600 }}>🎉 Goal reached!</div>}
            </div>

            {/* Add water */}
            <div className="card" style={{ marginBottom:16 }}>
              <div style={{ fontSize:11, letterSpacing:2, color:"#888", textTransform:"uppercase", marginBottom:12 }}>Add Water</div>
              <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
                {waterPresets.map(a => (
                  <div key={a} style={{ position:"relative", display:"inline-flex" }}>
                    <button className={`water-quick ${waterAmt === a ? "sel" : ""}`} onClick={() => setWaterAmt(a)}>
                      {a} fl oz
                    </button>
                    {!DEFAULT_PRESETS.includes(a) && (
                      <button onClick={() => removePreset(a)}
                        style={{ position:"absolute", top:-6, right:-6, background:"rgba(239,68,68,0.85)", border:"none", borderRadius:"50%", width:16, height:16, fontSize:9, color:"#fff", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                <button className="water-quick"
                  onClick={() => setShowCustom(!showCustom)}
                  style={{ borderStyle:"dashed", color: showCustom ? "#93c5fd" : "#555", borderColor: showCustom ? "#3b82f6" : "rgba(255,255,255,0.15)" }}>
                  {showCustom ? "Cancel" : "+ Custom"}
                </button>
              </div>
              {showCustom && (
                <div style={{ display:"flex", gap:8, marginBottom:12 }}>
                  <input type="number" placeholder="e.g. 20" value={customInput}
                    onChange={e => setCustomInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveCustomPreset()}
                    style={{ flex:1 }} autoFocus />
                  <button onClick={saveCustomPreset}
                    style={{ background:"rgba(59,130,246,0.2)", border:"1px solid rgba(59,130,246,0.4)", color:"#93c5fd", borderRadius:12, padding:"0 16px", fontSize:14, cursor:"pointer", fontWeight:600, whiteSpace:"nowrap", fontFamily:"'DM Sans',sans-serif" }}>
                    Save & Use
                  </button>
                </div>
              )}
              <button className="btn-primary" onClick={addWater} style={{ background:"linear-gradient(135deg,#93c5fd,#3b82f6)" }}>
                💧 Log {waterAmt} fl oz
              </button>
            </div>

            {/* Water log */}
            <div style={{ fontSize:11, letterSpacing:2, color:"#888", textTransform:"uppercase", marginBottom:10 }}>Today's Log</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {todayWater.length === 0 && (
                <div style={{ textAlign:"center", padding:"20px 0", color:"#444", fontSize:14 }}>
                  <div style={{ fontSize:36, marginBottom:8 }}>💧</div>Stay hydrated! Log your first drink.
                </div>
              )}
              {waterLog.slice(0,20).map((entry, i) => (
                <div key={entry.id} className="log-item">
                  <div className="row">
                    <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                      <span style={{ fontSize:20 }}>💧</span>
                      <div>
                        <div style={{ fontWeight:600, fontFamily:"'Space Mono',monospace" }}>
                          {entry.amount} <span style={{ fontSize:12, fontFamily:"'DM Sans',sans-serif", color:"#888", fontWeight:400 }}>fl oz</span>
                        </div>
                        <div style={{ fontSize:12, color:"#666" }}>{fmtDate(entry.ts)} · {fmtTime(entry.ts)}</div>
                      </div>
                    </div>
                    <div className="acts">
                      <button className="btn-edit" onClick={() => openEditWater(i)}>✏️</button>
                      <button className="btn-danger" onClick={() => deleteItem(waterLog, setWaterLog, KEYS.waterLog, entry.id)}>✕</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ════════════════ LOG / HISTORY TAB ════════════════ */}
        {tab === 3 && (() => {
          // ── Build current-week data (Sun→Sat) ──────────────────────────
          const now      = new Date();
          const dow      = now.getDay(); // 0=Sun
          const weekStart = new Date(now); weekStart.setHours(0,0,0,0); weekStart.setDate(now.getDate() - dow);
          const DAY_LABELS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
          const todayDow  = dow;

          // Fasting hours per day — sum all fasts whose START falls this week
          const fastHours = Array(7).fill(0);
          fastingLog.forEach(f => {
            const d = new Date(f.start);
            const diff = Math.floor((new Date(d.setHours(0,0,0,0)) - weekStart) / 86400000);
            if (diff >= 0 && diff < 7) fastHours[diff] += f.duration / 3600000;
          });

          // Water oz per day — sum all water entries this week
          const waterOzDay = Array(7).fill(0);
          waterLog.forEach(e => {
            const d = new Date(e.ts);
            const diff = Math.floor((new Date(new Date(e.ts).setHours(0,0,0,0)) - weekStart) / 86400000);
            if (diff >= 0 && diff < 7) waterOzDay[diff] += e.amount;
          });

          const maxFast  = Math.max(...fastHours, 24);
          const maxWater = Math.max(...waterOzDay, waterGoal, 1);

          // ── SVG bar chart renderer ─────────────────────────────────────
          const BAR_W   = 28;
          const BAR_GAP = 10;
          const CHART_W = 7 * (BAR_W + BAR_GAP) - BAR_GAP;
          const CHART_H = 120;

          const BarChart = ({ values, maxVal, colorFn, labelFn, unitLabel, gradId, gradColors }) => (
            <svg width="100%" viewBox={`0 0 ${CHART_W} ${CHART_H + 28}`} style={{ overflow:"visible" }}>
              <defs>
                <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={gradColors[0]}/>
                  <stop offset="100%" stopColor={gradColors[1]}/>
                </linearGradient>
                <linearGradient id={`${gradId}_dim`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={gradColors[0]} stopOpacity="0.3"/>
                  <stop offset="100%" stopColor={gradColors[1]} stopOpacity="0.1"/>
                </linearGradient>
              </defs>

              {/* Horizontal guide lines */}
              {[0.25,0.5,0.75,1].map(t => (
                <line key={t}
                  x1="0" y1={CHART_H * (1-t)}
                  x2={CHART_W} y2={CHART_H * (1-t)}
                  stroke="rgba(255,255,255,0.05)" strokeWidth="1" strokeDasharray="3,4"/>
              ))}

              {values.map((val, i) => {
                const barH   = val > 0 ? Math.max((val / maxVal) * CHART_H, 4) : 0;
                const x      = i * (BAR_W + BAR_GAP);
                const y      = CHART_H - barH;
                const isToday = i === todayDow;
                const isEmpty = val === 0;

                return (
                  <g key={i}>
                    {/* Empty bar ghost */}
                    <rect x={x} y={0} width={BAR_W} height={CHART_H}
                      rx="6" fill="rgba(255,255,255,0.03)"/>

                    {/* Filled bar */}
                    {!isEmpty && (
                      <rect x={x} y={y} width={BAR_W} height={barH}
                        rx="6"
                        fill={isToday ? `url(#${gradId})` : `url(#${gradId}_dim)`}/>
                    )}

                    {/* Today highlight ring */}
                    {isToday && (
                      <rect x={x-1} y={-1} width={BAR_W+2} height={CHART_H+2}
                        rx="7" fill="none"
                        stroke={gradColors[0]} strokeWidth="1.5" strokeOpacity="0.4"/>
                    )}

                    {/* Day label */}
                    <text x={x + BAR_W/2} y={CHART_H + 16}
                      textAnchor="middle" fontSize="10"
                      fill={isToday ? gradColors[0] : "#666"}
                      fontFamily="'DM Sans',sans-serif"
                      fontWeight={isToday ? "600" : "400"}>
                      {DAY_LABELS[i]}
                    </text>

                    {/* Value label above bar */}
                    {!isEmpty && (
                      <text x={x + BAR_W/2} y={y - 5}
                        textAnchor="middle" fontSize="9"
                        fill={isToday ? gradColors[0] : "rgba(255,255,255,0.35)"}
                        fontFamily="'Space Mono',monospace">
                        {labelFn(val)}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          );

          return (
            <div className="tab-cnt">
              {/* ── Stats grid ── */}
              <div style={{ fontSize:11, letterSpacing:2, color:"#888", textTransform:"uppercase", marginBottom:16 }}>Summary</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:24 }}>
                {[
                  { label:"Total Fasts",  val: fastingLog.length,                                                                                icon:"⏱", color:"#6ee7b7" },
                  { label:"Avg Duration", val: fastingLog.length ? fmtDur(fastingLog.reduce((s,f)=>s+f.duration,0)/fastingLog.length) : "—",   icon:"📊", color:"#a78bfa" },
                  { label:"Food Entries", val: foodLog.length,                                                                                   icon:"🥗", color:"#fbbf24" },
                  { label:"Water Logs",   val: waterLog.length,                                                                                  icon:"💧", color:"#93c5fd" },
                ].map(s => (
                  <div key={s.label} className="card" style={{ textAlign:"center" }}>
                    <div style={{ fontSize:24 }}>{s.icon}</div>
                    <div style={{ fontFamily:"'Space Mono',monospace", fontWeight:700, fontSize:18, color:s.color, marginTop:6 }}>{s.val}</div>
                    <div style={{ fontSize:11, color:"#666", marginTop:4 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* ── Chart 1: Weekly Fasting Hours ── */}
              <div className="card" style={{ marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                  <div>
                    <div style={{ fontSize:11, letterSpacing:2, color:"#888", textTransform:"uppercase" }}>Weekly Fasting</div>
                    <div style={{ fontSize:15, fontWeight:600, color:"#6ee7b7", marginTop:3 }}>Hours fasted per day</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:10, color:"#555", letterSpacing:1 }}>THIS WEEK</div>
                    <div style={{ fontSize:14, fontWeight:700, fontFamily:"'Space Mono',monospace", color:"#6ee7b7", marginTop:2 }}>
                      {fastHours.reduce((s,h) => s+h, 0).toFixed(1)}h
                    </div>
                  </div>
                </div>

                <BarChart
                  values={fastHours}
                  maxVal={maxFast}
                  gradId="fastGrad"
                  gradColors={["#6ee7b7","#3b82f6"]}
                  labelFn={v => `${v.toFixed(1)}h`}
                />

                <div style={{ display:"flex", justifyContent:"space-between", marginTop:10, paddingTop:10, borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                  {["Best day","Avg/day","Today"].map((lbl, i) => {
                    const bestIdx = fastHours.indexOf(Math.max(...fastHours));
                    const vals = [
                      `${Math.max(...fastHours).toFixed(1)}h`,
                      `${(fastHours.reduce((s,h)=>s+h,0)/7).toFixed(1)}h`,
                      `${(fastHours[todayDow]||0).toFixed(1)}h`
                    ];
                    return (
                      <div key={lbl} style={{ textAlign:"center" }}>
                        <div style={{ fontSize:10, color:"#555", marginBottom:2 }}>{lbl}</div>
                        <div style={{ fontSize:13, fontWeight:700, fontFamily:"'Space Mono',monospace", color:"#6ee7b7" }}>{vals[i]}</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Chart 2: Weekly Water Intake ── */}
              <div className="card" style={{ marginBottom:24 }}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
                  <div>
                    <div style={{ fontSize:11, letterSpacing:2, color:"#888", textTransform:"uppercase" }}>Weekly Hydration</div>
                    <div style={{ fontSize:15, fontWeight:600, color:"#93c5fd", marginTop:3 }}>Fluid oz per day</div>
                  </div>
                  <div style={{ textAlign:"right" }}>
                    <div style={{ fontSize:10, color:"#555", letterSpacing:1 }}>THIS WEEK</div>
                    <div style={{ fontSize:14, fontWeight:700, fontFamily:"'Space Mono',monospace", color:"#93c5fd", marginTop:2 }}>
                      {waterOzDay.reduce((s,v)=>s+v,0)} fl oz
                    </div>
                  </div>
                </div>

                <BarChart
                  values={waterOzDay}
                  maxVal={maxWater}
                  gradId="waterChartGrad"
                  gradColors={["#93c5fd","#1d4ed8"]}
                  labelFn={v => `${v}`}
                />

                {/* Goal line annotation */}
                {waterGoal > 0 && (() => {
                  const goalPct = Math.min(waterGoal / maxWater, 1);
                  const goalY   = 120 * (1 - goalPct);
                  return (
                    <div style={{ position:"relative", marginTop:-6 }}>
                      <div style={{ fontSize:10, color:"rgba(251,191,36,0.7)", textAlign:"right", marginBottom:2 }}>
                        ── goal: {waterGoal} fl oz
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display:"flex", justifyContent:"space-between", marginTop:10, paddingTop:10, borderTop:"1px solid rgba(255,255,255,0.06)" }}>
                  {["Best day","Avg/day","Today"].map((lbl, i) => {
                    const vals = [
                      `${Math.max(...waterOzDay)} oz`,
                      `${Math.round(waterOzDay.reduce((s,v)=>s+v,0)/7)} oz`,
                      `${waterOzDay[todayDow]||0} oz`
                    ];
                    const goalMet = i === 2 && (waterOzDay[todayDow]||0) >= waterGoal;
                    return (
                      <div key={lbl} style={{ textAlign:"center" }}>
                        <div style={{ fontSize:10, color:"#555", marginBottom:2 }}>{lbl}</div>
                        <div style={{ fontSize:13, fontWeight:700, fontFamily:"'Space Mono',monospace", color: goalMet ? "#6ee7b7" : "#93c5fd" }}>
                          {vals[i]} {goalMet ? "✓" : ""}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── All fasts ── */}
              {fastingLog.length > 0 && (
                <>
                  <div style={{ fontSize:11, letterSpacing:2, color:"#888", textTransform:"uppercase", marginBottom:12 }}>All Fasts</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:24 }}>
                    {fastingLog.map((f, i) => {
                      const pct = Math.min(Math.round((f.duration/(f.protocol*3600000))*100),100);
                      return (
                        <div key={f.id ?? f.start} className="log-item">
                          <div className="row" style={{ alignItems:"flex-start" }}>
                            <div>
                              <div style={{ fontFamily:"'Space Mono',monospace", fontWeight:700 }}>{fmtDur(f.duration)}</div>
                              <div style={{ fontSize:12, color:"#666", marginTop:2 }}>{fmtDate(f.start)} · {f.protocol}h goal</div>
                              <div style={{ fontSize:11, color:"#555", marginTop:1 }}>{fmtTime(f.start)} → {fmtTime(f.end)}</div>
                            </div>
                            <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6, flexShrink:0 }}>
                              <div style={{ fontSize:14, fontWeight:600, color: pct>=100 ? "#6ee7b7" : "#fbbf24" }}>{pct}%</div>
                              <div className="acts">
                                <button className="btn-edit" onClick={() => openEditFast(i)}>✏️</button>
                                <button className="btn-danger" onClick={() => deleteItem(fastingLog, setFastingLog, KEYS.fastingLog, f.id ?? f.start)}>✕</button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* ── All food ── */}
              {foodLog.length > 0 && (
                <>
                  <div style={{ fontSize:11, letterSpacing:2, color:"#888", textTransform:"uppercase", marginBottom:12 }}>All Food</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:24 }}>
                    {foodLog.map((entry, i) => (
                      <div key={entry.id} className="log-item">
                        <div className="row" style={{ alignItems:"flex-start" }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:600 }}>{entry.name}</div>
                            <div style={{ fontSize:12, color:"#666", marginTop:2 }}>{entry.cat} · {fmtDate(entry.ts)} {fmtTime(entry.ts)}</div>
                            {entry.note && <div style={{ fontSize:12, color:"#888", marginTop:2, fontStyle:"italic" }}>{entry.note}</div>}
                          </div>
                          <div className="acts">
                            {entry.cal && <span style={{ fontFamily:"'Space Mono',monospace", color:"#fbbf24", fontWeight:700, fontSize:13 }}>{entry.cal}</span>}
                            <button className="btn-edit" onClick={() => openEditFood(i)}>✏️</button>
                            <button className="btn-danger" onClick={() => deleteItem(foodLog, setFoodLog, KEYS.foodLog, entry.id)}>✕</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* ── All water ── */}
              {waterLog.length > 0 && (
                <>
                  <div style={{ fontSize:11, letterSpacing:2, color:"#888", textTransform:"uppercase", marginBottom:12 }}>All Water</div>
                  <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                    {waterLog.map((entry, i) => (
                      <div key={entry.id} className="log-item">
                        <div className="row">
                          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                            <span style={{ fontSize:18 }}>💧</span>
                            <div>
                              <div style={{ fontWeight:600, fontFamily:"'Space Mono',monospace" }}>
                                {entry.amount} <span style={{ fontSize:12, fontFamily:"'DM Sans',sans-serif", color:"#888", fontWeight:400 }}>fl oz</span>
                              </div>
                              <div style={{ fontSize:12, color:"#666" }}>{fmtDate(entry.ts)} · {fmtTime(entry.ts)}</div>
                            </div>
                          </div>
                          <div className="acts">
                            <button className="btn-edit" onClick={() => openEditWater(i)}>✏️</button>
                            <button className="btn-danger" onClick={() => deleteItem(waterLog, setWaterLog, KEYS.waterLog, entry.id)}>✕</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}
      </div>

      {/* ── Bottom navigation ───────────────────────────────────────────── */}
      <div style={{ position:"fixed", bottom:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:430, background:"rgba(15,15,20,0.96)", backdropFilter:"blur(20px)", borderTop:"1px solid rgba(255,255,255,0.08)", padding:"10px 0 28px", display:"grid", gridTemplateColumns:"repeat(4,1fr)" }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)}
            style={{ background:"none", border:"none", cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:"6px 0", color: tab===i ? "#6ee7b7" : "#555", transition:"color .2s" }}>
            <span style={{ fontSize:20 }}>{TAB_ICONS[i]}</span>
            <span style={{ fontSize:11, fontFamily:"'DM Sans',sans-serif", fontWeight:600, letterSpacing:0.5 }}>{t}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
