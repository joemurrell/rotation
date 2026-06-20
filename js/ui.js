// UI: screen rendering and event wiring. Mobile-first, no framework.
import * as store from './store.js';
import { getDivision, DIVISION_LIST } from './rules.js';
import { generateRotation, validateRotation, availabilityFromWindow } from './rotation.js';
import { seasonStats, finalizedGameCount } from './stats.js';
import { assignPositions, POSITIONS, posLabel } from './positions.js';

// Labels used for the optional "preferred positions" tags on the roster.
const DEFAULT_POSITIONS = ['PG', 'SG', 'SF', 'PF', 'C'];

// ---- tiny DOM helpers ----
function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else if (v !== false && v != null) n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return n;
}
const $ = (sel) => document.querySelector(sel);

function toast(msg) {
  const t = el('div', { class: 'toast', text: msg });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 1800);
}

// ---- bottom sheet ----
function openSheet(title, builder) {
  const root = $('#sheet-root');
  const sheet = el('div', { class: 'sheet' }, [el('h3', { text: title })]);
  builder(sheet, closeSheet);
  const backdrop = el('div', { class: 'sheet-backdrop', onclick: (e) => { if (e.target === backdrop) closeSheet(); } }, [sheet]);
  root.innerHTML = '';
  root.appendChild(backdrop);
}
function closeSheet() { $('#sheet-root').innerHTML = ''; }

// ---- view state ----
let view = { tab: 'games', screen: 'list', gameId: null };
let livePeriod = 0;          // for live mode
let gameForm = null;         // transient new-game form state

export function mount() {
  document.querySelectorAll('#tabbar .tab').forEach((btn) => {
    btn.addEventListener('click', () => go({ tab: btn.dataset.tab, screen: 'list', gameId: null }));
  });
  $('#teamChip').addEventListener('click', () => go({ tab: 'teams', screen: 'list', gameId: null }));
  render();
}

function go(next) { view = { ...view, ...next }; closeSheet(); render(); }

function render() {
  renderHeader();
  document.querySelectorAll('#tabbar .tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === view.tab));
  const team = store.getActiveTeam();
  const screen = $('#screen');
  screen.innerHTML = '';
  screen.scrollTop = 0;

  if (view.tab === 'teams') return screen.appendChild(screenTeams());
  if (!team) return screen.appendChild(emptyTeamPrompt());

  if (view.tab === 'roster') return screen.appendChild(screenRoster(team));
  if (view.tab === 'season') return screen.appendChild(screenSeason(team));
  if (view.tab === 'backup') return screen.appendChild(screenBackup());

  // games tab
  if (view.screen === 'newgame') return screen.appendChild(screenNewGame(team));
  if (view.screen === 'rotation') {
    const g = team.games.find((x) => x.id === view.gameId);
    if (g) return screen.appendChild(screenRotation(team, g));
    view.screen = 'list';
  }
  return screen.appendChild(screenGames(team));
}

function renderHeader() {
  const team = store.getActiveTeam();
  $('#teamName').textContent = team ? team.name : 'Add a team';
  $('#teamDivision').textContent = team ? getDivision(team.division).name : '';
}

function emptyTeamPrompt() {
  return el('div', { class: 'empty' }, [
    el('p', { text: 'No team yet.' }),
    el('button', { class: 'btn primary', text: '+ Add your first team', onclick: () => go({ tab: 'teams' }) }),
  ]);
}

// ================= TEAMS =================
function screenTeams() {
  const wrap = el('div', {}, [el('h2', { text: 'Teams' })]);
  const teams = store.getTeams();
  const active = store.getActiveTeam();

  for (const t of teams) {
    const div = getDivision(t.division);
    wrap.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'row between' }, [
        el('div', { class: 'grow' }, [
          el('div', { class: 'row', html: `<strong>${esc(t.name)}</strong>` }),
          el('div', { class: 'tag', text: `${div.name} · ${t.roster.length} players` }),
        ]),
        t.id === active?.id
          ? el('span', { class: 'badge', text: 'Active' })
          : el('button', { class: 'btn sm', text: 'Use', onclick: () => { store.setActiveTeam(t.id); go({ tab: 'games', screen: 'list' }); } }),
      ]),
      el('div', { class: 'row', style: 'margin-top:10px;gap:8px' }, [
        el('button', { class: 'btn sm ghost', text: 'Rename', onclick: () => renameTeam(t) }),
        el('button', { class: 'btn sm danger', text: 'Delete', onclick: () => {
          if (confirm(`Delete team "${t.name}" and its games?`)) { store.deleteTeam(t.id); render(); }
        } }),
      ]),
    ]));
  }

  // add-team form
  let name = '', division = DIVISION_LIST[0].id;
  const nameInput = el('input', { type: 'text', placeholder: 'Team name', oninput: (e) => (name = e.target.value) });
  const divSelect = el('select', { onchange: (e) => (division = e.target.value) },
    DIVISION_LIST.map((d) => el('option', { value: d.id }, [d.name])));
  wrap.appendChild(el('div', { class: 'card' }, [
    el('h3', { text: 'Add team' }),
    el('label', { class: 'field' }, [el('span', { text: 'Name' }), nameInput]),
    el('label', { class: 'field' }, [el('span', { text: 'Division' }), divSelect]),
    el('button', { class: 'btn primary block', text: '+ Add team', onclick: () => {
      if (!name.trim()) return toast('Enter a team name');
      store.addTeam(name, division);
      go({ tab: 'roster', screen: 'list' });
    } }),
  ]));
  return wrap;
}

function renameTeam(t) {
  const v = prompt('Team name', t.name);
  if (v && v.trim()) { store.updateTeam(t.id, { name: v.trim() }); render(); }
}

// ================= ROSTER =================
function screenRoster(team) {
  const wrap = el('div', {}, [el('h2', { text: `${team.name} · Roster` })]);
  if (team.roster.length === 0) wrap.appendChild(el('p', { class: 'muted', text: 'No players yet. Add them below.' }));

  for (const p of team.roster) {
    wrap.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'row between' }, [
        el('div', { class: 'grow' }, [
          el('div', { html: `<strong>${esc(p.name)}</strong>${p.number ? ` <span class="num">#${esc(p.number)}</span>` : ''}` }),
          p.positions?.length ? el('div', { class: 'tag', text: p.positions.join(', ') }) : null,
        ]),
        el('div', { class: 'row', style: 'gap:6px' }, [
          el('button', { class: 'btn sm ghost', text: 'Edit', onclick: () => editPlayer(team, p) }),
          el('button', { class: 'btn sm danger', text: '✕', onclick: () => { store.deletePlayer(team.id, p.id); render(); } }),
        ]),
      ]),
    ]));
  }

  wrap.appendChild(el('button', { class: 'btn primary block', text: '+ Add player', onclick: () => editPlayer(team, null) }));
  return wrap;
}

function editPlayer(team, player) {
  const data = { name: player?.name || '', number: player?.number || '', positions: new Set(player?.positions || []) };
  openSheet(player ? 'Edit player' : 'Add player', (sheet, close) => {
    const nameInput = el('input', { type: 'text', value: data.name, placeholder: 'Name', oninput: (e) => (data.name = e.target.value) });
    const numInput = el('input', { type: 'text', value: data.number, inputmode: 'numeric', placeholder: 'e.g. 12', oninput: (e) => (data.number = e.target.value) });
    const chips = el('div', { class: 'chips' }, DEFAULT_POSITIONS.map((pos) => {
      const c = el('button', { class: 'chip' + (data.positions.has(pos) ? ' sel' : ''), text: pos, onclick: () => {
        data.positions.has(pos) ? data.positions.delete(pos) : data.positions.add(pos);
        c.classList.toggle('sel');
      } });
      return c;
    }));
    sheet.append(
      el('label', { class: 'field' }, [el('span', { text: 'Name' }), nameInput]),
      el('label', { class: 'field' }, [el('span', { text: 'Jersey # (optional)' }), numInput]),
      el('label', { class: 'field' }, [el('span', { text: 'Preferred positions (optional)' }), chips]),
      el('button', { class: 'btn primary block', text: 'Save', onclick: () => {
        if (!data.name.trim()) return toast('Enter a name');
        const patch = { name: data.name, number: data.number, positions: [...data.positions] };
        if (player) store.updatePlayer(team.id, player.id, patch);
        else store.addPlayer(team.id, patch);
        close(); render();
      } }),
    );
  });
}

// ================= GAMES LIST =================
function screenGames(team) {
  const wrap = el('div', {}, [el('h2', { text: `${team.name} · Games` })]);
  wrap.appendChild(el('button', { class: 'btn primary block', text: '+ New game', onclick: () => {
    if (team.roster.length === 0) return toast('Add players to the roster first');
    startNewGame(team);
  } }));
  wrap.appendChild(el('div', { class: 'spacer' }));

  if (team.games.length === 0) {
    wrap.appendChild(el('p', { class: 'muted', text: 'No games yet.' }));
    return wrap;
  }
  for (const g of team.games) {
    wrap.appendChild(el('div', { class: 'card row between', onclick: () => go({ screen: 'rotation', gameId: g.id }) }, [
      el('div', { class: 'grow' }, [
        el('div', { html: `<strong>${esc(g.date)}</strong>${g.opponent ? ` vs ${esc(g.opponent)}` : ''}` }),
        el('div', { class: 'tag', text: `${g.presentIds.length} present${g.finalized ? ' · final' : ''}` }),
      ]),
      el('span', { html: '›', style: 'font-size:22px;color:var(--muted)' }),
    ]));
  }
  return wrap;
}

// ================= NEW GAME =================
function startNewGame(team) {
  const div = getDivision(team.division);
  gameForm = {
    date: new Date().toISOString().slice(0, 10),
    opponent: '',
    present: new Set(team.roster.map((p) => p.id)), // default everyone present
    windows: {},   // id -> {from,to}
    frontLoad: new Set(),
    expanded: new Set(),
    periods: div.periods,
  };
  go({ tab: 'games', screen: 'newgame' });
}

function screenNewGame(team) {
  const div = getDivision(team.division);
  const f = gameForm;
  const wrap = el('div', {}, [el('h2', { text: 'New game' })]);

  wrap.appendChild(el('div', { class: 'card' }, [
    el('label', { class: 'field' }, [el('span', { text: 'Date' }),
      el('input', { type: 'date', value: f.date, onchange: (e) => (f.date = e.target.value) })]),
    el('label', { class: 'field' }, [el('span', { text: 'Opponent (optional)' }),
      el('input', { type: 'text', value: f.opponent, oninput: (e) => (f.opponent = e.target.value) })]),
  ]));

  const presentCount = el('span', { text: String(f.present.size) });
  wrap.appendChild(el('h3', {}, [el('span', { text: 'Who’s here? (' }), presentCount, el('span', { text: ' present)' })]));

  // Generate button is referenced by each row so its count stays live without
  // a full re-render (which would reset the scroll position mid-checklist).
  const genBtn = el('button', { class: 'btn primary block', onclick: () => {
    if (f.present.size === 0) return toast('Check at least one player');
    generateAndOpen(team);
  } });
  const refreshGen = () => { genBtn.textContent = `Generate rotation (${f.present.size})`; };
  refreshGen();

  const list = el('div', { class: 'card', style: 'padding:0' });
  for (const p of team.roster) {
    const row = el('div', {});
    const buildRow = () => {
      row.innerHTML = '';
      const present = f.present.has(p.id);
      const cb = el('input', { type: 'checkbox', checked: present, onchange: (e) => {
        if (e.target.checked) f.present.add(p.id);
        else { f.present.delete(p.id); f.expanded.delete(p.id); }
        presentCount.textContent = String(f.present.size);
        refreshGen();
        buildRow(); // rebuild just this row — no scroll jump
      } });
      const flags = [];
      if (f.frontLoad.has(p.id)) flags.push('front-load');
      const w = f.windows[p.id];
      if (w && (w.from > 1 || w.to < f.periods)) flags.push(`periods ${w.from}–${w.to}`);

      const checkRow = el('div', { class: 'check-row' }, [
        cb,
        el('div', { class: 'grow' }, [
          el('span', { class: 'name', text: p.name }),
          p.number ? el('span', { class: 'num', text: ` #${p.number}` }) : null,
          flags.length ? el('div', { class: 'pill-flag', text: flags.join(' · ') }) : null,
        ]),
        present ? el('button', { class: 'btn sm ghost', text: '⚙', onclick: () => {
          f.expanded.has(p.id) ? f.expanded.delete(p.id) : f.expanded.add(p.id);
          buildRow();
        } }) : null,
      ]);
      row.appendChild(checkRow);
      if (present && f.expanded.has(p.id)) row.appendChild(playerAdjust(f, p, div, buildRow));
    };
    buildRow();
    list.appendChild(row);
  }
  wrap.appendChild(list);

  wrap.appendChild(el('div', { class: 'spacer' }));
  wrap.appendChild(genBtn);
  return wrap;
}

function playerAdjust(f, p, div, onChange = () => {}) {
  const w = f.windows[p.id] || { from: 1, to: div.periods };
  const periodOpts = (sel) => Array.from({ length: div.periods }, (_, i) =>
    el('option', { value: i + 1, ...(sel === i + 1 ? { selected: true } : {}) }, [`P${i + 1} (${div.periodLabels[i]})`]));
  const fromSel = el('select', { onchange: (e) => { setWin(f, p.id, div, { from: +e.target.value }); onChange(); } }, periodOpts(w.from));
  const toSel = el('select', { onchange: (e) => { setWin(f, p.id, div, { to: +e.target.value }); onChange(); } }, periodOpts(w.to));
  const fl = el('input', { type: 'checkbox', checked: f.frontLoad.has(p.id), onchange: (e) => {
    e.target.checked ? f.frontLoad.add(p.id) : f.frontLoad.delete(p.id);
    onChange();
  } });
  return el('div', { class: 'adjust' }, [
    el('div', { class: 'tag', text: 'Use these for injuries, late arrivals, or early leaves.' }),
    el('div', { class: 'row' }, [el('span', { text: 'Plays from', style: 'min-width:78px' }), fromSel]),
    el('div', { class: 'row' }, [el('span', { text: 'through', style: 'min-width:78px' }), toSel]),
    el('label', { class: 'row', style: 'gap:10px' }, [fl, el('span', { text: 'Front-load (weight minutes earlier)' })]),
  ]);
}
function setWin(f, id, div, patch) {
  const cur = f.windows[id] || { from: 1, to: div.periods };
  const next = { ...cur, ...patch };
  if (next.from > next.to) next.to = next.from;
  f.windows[id] = next;
}

function buildGenPlayers(team, present, windows, frontLoad, periods) {
  return [...present].map((id) => {
    const p = team.roster.find((x) => x.id === id);
    const w = windows[id];
    return {
      id, name: p?.name || '?',
      available: w ? availabilityFromWindow(periods, w.from, w.to) : availabilityFromWindow(periods),
      frontLoad: frontLoad.has(id),
    };
  });
}

function generateAndOpen(team) {
  const div = getDivision(team.division);
  const f = gameForm;
  const players = buildGenPlayers(team, f.present, f.windows, f.frontLoad, div.periods);
  const seed = (Date.now() & 0xffff) || 1;
  const { grid } = generateRotation({ ...div, players, seed });
  const g = store.addGame(team.id, {
    date: f.date, opponent: f.opponent,
    presentIds: [...f.present], windows: f.windows, frontLoad: [...f.frontLoad],
    grid, seed,
  });
  gameForm = null;
  go({ screen: 'rotation', gameId: g.id });
}

// ================= ROTATION VIEW =================
let liveOn = false;

function screenRotation(team, g) {
  const div = getDivision(team.division);
  const wrap = el('div', {});

  wrap.appendChild(el('div', { class: 'row between' }, [
    el('button', { class: 'btn sm ghost', text: '‹ Games', onclick: () => go({ screen: 'list' }) }),
    el('div', { html: `<strong>${esc(g.date)}</strong>${g.opponent ? ` vs ${esc(g.opponent)}` : ''}`, style: 'text-align:center' }),
    el('button', { class: 'btn sm danger', text: '✕', onclick: () => {
      if (confirm('Delete this game?')) { store.deleteGame(team.id, g.id); go({ screen: 'list' }); }
    } }),
  ]));

  // keep the position layer in sync with the current grid/mode/groups/locks
  const posWarnings = recomputePositions(team, g);

  // warnings (minutes rules + positions)
  const players = buildGenPlayers(team, new Set(g.presentIds), g.windows || {}, new Set(g.frontLoad || []), div.periods);
  const warnings = [...validateRotation(div, players, g.grid), ...posWarnings];
  if (warnings.length) {
    wrap.appendChild(el('div', { class: 'warns' }, warnings.map((w) => el('div', { class: 'warn', text: '⚠ ' + w }))));
  }

  // controls
  wrap.appendChild(el('div', { class: 'row', style: 'gap:8px;margin:10px 0' }, [
    el('button', { class: 'btn sm', text: '🔀 Regenerate', onclick: () => {
      if (confirm('Regenerate this rotation? This replaces the current grid and any manual subs or pinned positions.')) regenerate(team, g);
    } }),
    el('button', { class: 'btn sm' + (liveOn ? ' primary' : ''), text: liveOn ? '📋 Grid' : '▶ Live', onclick: () => { liveOn = !liveOn; render(); } }),
    g.finalized
      ? el('button', { class: 'btn sm', text: '↩ Unfinalize', onclick: () => { store.updateGame(team.id, g.id, { finalized: false }); render(); toast('Removed from season totals'); } })
      : el('button', { class: 'btn sm success', text: '✓ Mark final', onclick: () => { store.updateGame(team.id, g.id, { finalized: true }); render(); toast('Added to season totals'); } }),
  ]));

  if (!liveOn) wrap.appendChild(positionControls(team, g, div));
  wrap.appendChild(liveOn ? liveView(team, g, div) : gridView(team, g, div));
  return wrap;
}

// ---- positions ----
const POS_MODES = [
  { id: 'off', label: 'Off' },
  { id: 'spread', label: 'Spread' },
  { id: 'fixed', label: 'Fixed' },
];

function recomputePositions(team, g) {
  const mode = g.positionMode || 'off';
  if (mode === 'off') {
    g.positions = { ...(g.positionLocks || {}) };
    store.updateGame(team.id, g.id, { positions: g.positions });
    return [];
  }
  const { byCell, warnings } = assignPositions({
    grid: g.grid, mode, groups: g.positionGroups || {}, locks: g.positionLocks || {},
  });
  g.positions = byCell;
  store.updateGame(team.id, g.id, { positions: byCell });
  const div = getDivision(team.division);
  const nameOf = (id) => team.roster.find((p) => p.id === id)?.name || '?';
  return warnings.map((w) =>
    `${div.periodLabels[w.period]}: no open spot for ${w.pids.map(nameOf).join(', ')} — position groups too tight.`);
}

function setPosMode(team, g, mode) {
  // entering fixed mode with no groups yet? seed from the team's previous game.
  if (mode === 'fixed' && Object.keys(g.positionGroups || {}).length === 0) {
    const prev = team.games.find((x) => x.id !== g.id && Object.keys(x.positionGroups || {}).length);
    g.positionGroups = prev ? { ...prev.positionGroups } : {};
  }
  store.updateGame(team.id, g.id, { positionMode: mode, positionGroups: g.positionGroups || {} });
  render();
}

function positionControls(team, g, div) {
  const mode = g.positionMode || 'off';
  const seg = el('div', { class: 'row', style: 'gap:6px' }, POS_MODES.map((m) =>
    el('button', { class: 'btn sm' + (m.id === mode ? ' primary' : ''), text: m.label, onclick: () => setPosMode(team, g, m.id) })));

  const wrap = el('div', { class: 'card', style: 'margin-bottom:10px' }, [
    el('div', { class: 'row between' }, [el('strong', { text: 'Positions' }), seg]),
  ]);

  if (mode === 'off') {
    wrap.appendChild(el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:13px', text: 'No auto positions. Tap a cell to tag one by hand.' }));
  } else if (mode === 'spread') {
    wrap.appendChild(el('p', { class: 'muted', style: 'margin:8px 0 0;font-size:13px', text: 'Each player rotates through as many of 1–5 as possible — no repeats until they’ve cycled.' }));
  } else {
    wrap.appendChild(el('p', { class: 'muted', style: 'margin:8px 0 6px;font-size:13px', text: 'Pick 1–2 spots each player sticks to this game. Tap to set; change them week to week.' }));
    wrap.appendChild(positionGroupEditor(team, g));
  }
  wrap.appendChild(el('div', { class: 'tag', style: 'margin-top:8px', text: '1 PG · 2 SG · 3 SF · 4 PF · 5 C' }));
  return wrap;
}

function positionGroupEditor(team, g) {
  const present = team.roster.filter((p) => g.presentIds.includes(p.id));
  const box = el('div', { class: 'stack' });
  for (const p of present) {
    const group = new Set(g.positionGroups[p.id] || []);
    const chips = el('div', { class: 'chips' }, POSITIONS.map((n) =>
      el('button', { class: 'chip' + (group.has(n) ? ' sel' : ''), text: String(n), onclick: () => {
        if (group.has(n)) group.delete(n);
        else { if (group.size >= 2) return toast('Up to 2 positions each'); group.add(n); }
        g.positionGroups[p.id] = [...group].sort();
        store.updateGame(team.id, g.id, { positionGroups: g.positionGroups });
        render();
      } })));
    box.appendChild(el('div', { class: 'row between', style: 'gap:8px;flex-wrap:wrap' }, [
      el('div', { class: 'ellipsis', style: 'min-width:80px;font-weight:600', text: p.number ? `${p.name} #${p.number}` : p.name }),
      chips,
    ]));
  }
  return box;
}

function regenerate(team, g) {
  const div = getDivision(team.division);
  const players = buildGenPlayers(team, new Set(g.presentIds), g.windows || {}, new Set(g.frontLoad || []), div.periods);
  const seed = ((g.seed || 1) * 1103515245 + 12345) & 0x7fffffff;
  const { grid } = generateRotation({ ...div, players, seed });
  // new on-court sets invalidate manual position locks
  store.updateGame(team.id, g.id, { grid, seed, positionLocks: {} });
  render();
}

function gridView(team, g, div) {
  const present = team.roster.filter((p) => g.presentIds.includes(p.id));
  const periods = div.periods;

  const thead = el('thead', {}, [el('tr', {}, [
    el('th', { class: 'player', text: 'Player' }),
    ...Array.from({ length: periods }, (_, i) =>
      el('th', {}, [el('span', { class: 'sub', text: div.subLabels[i] }), document.createTextNode(div.periodLabels[i])])),
    el('th', { text: 'Tot' }),
  ])]);

  const tbody = el('tbody');
  for (const p of present) {
    const cells = [];
    let total = 0;
    for (let period = 0; period < periods; period++) {
      const on = g.grid[period]?.includes(p.id);
      if (on) total++;
      const pos = g.positions?.[`${period}:${p.id}`];
      const locked = g.positionLocks?.[`${period}:${p.id}`] != null;
      const td = el('td', {
        class: 'cell' + (on ? ' on' : '') + (on && pos ? ' haspos' : '') + (on && locked ? ' locked' : ''),
        text: on ? (pos != null ? String(pos) : '●') : '',
        onclick: () => cellSheet(team, g, div, period, p),
      });
      cells.push(td);
    }
    tbody.appendChild(el('tr', {}, [
      el('th', { class: 'player ellipsis', text: p.number ? `${p.name} #${p.number}` : p.name },),
      ...cells,
      el('td', {}, [el('strong', { text: String(total) })]),
    ]));
  }

  const tfoot = el('tfoot', {}, [el('tr', {}, [
    el('th', { class: 'player', text: 'On court' }),
    ...Array.from({ length: periods }, (_, i) => el('td', {}, [
      el('span', { class: 'count-pill', text: String(g.grid[i]?.length || 0) }),
    ])),
    el('td', { text: '' }),
  ])]);

  return el('div', {}, [
    el('p', { class: 'muted', style: 'font-size:13px;margin:4px 0', text: `${div.minutesPerPeriod} min/period · numbers = position · tap a cell to sub or pin a spot` }),
    el('div', { class: 'grid-wrap' }, [el('table', { class: 'grid' }, [thead, tbody, tfoot])]),
  ]);
}

function cellSheet(team, g, div, period, player) {
  const key = `${period}:${player.id}`;
  const onCourt = g.grid[period]?.includes(player.id);
  openSheet(`${player.name} · ${div.periodLabels[period]} (${div.subLabels[period]})`, (sheet, close) => {
    if (onCourt) {
      sheet.appendChild(el('button', { class: 'btn block danger', text: '⬇ Sub to bench', onclick: () => {
        g.grid[period] = g.grid[period].filter((id) => id !== player.id);
        delete g.positionLocks[key];
        store.updateGame(team.id, g.id, { grid: g.grid, positionLocks: g.positionLocks });
        close(); render();
      } }));
      sheet.appendChild(el('h3', { text: 'Pin a position this period' }));
      const cur = g.positionLocks?.[key];
      sheet.appendChild(el('div', { class: 'chips' }, POSITIONS.map((n) =>
        el('button', { class: 'chip' + (cur === n ? ' sel' : ''), text: posLabel(n), onclick: () => {
          if (g.positionLocks[key] === n) delete g.positionLocks[key]; else g.positionLocks[key] = n;
          store.updateGame(team.id, g.id, { positionLocks: g.positionLocks });
          close(); render();
        } })
      )));
      if (cur != null) sheet.appendChild(el('p', { class: 'muted', style: 'font-size:13px', text: 'Pinned spots override auto-assignment.' }));
    } else {
      sheet.appendChild(el('p', { class: 'muted', text: (g.grid[period]?.length || 0) >= div.court ? `${div.court} already on court — adding makes ${(g.grid[period]?.length || 0) + 1}.` : '' }));
      sheet.appendChild(el('button', { class: 'btn block success', text: '⬆ Put on court', onclick: () => {
        g.grid[period] = [...(g.grid[period] || []), player.id];
        store.updateGame(team.id, g.id, { grid: g.grid });
        close(); render();
      } }));
    }
  });
}

// ================= LIVE MODE =================
function liveView(team, g, div) {
  if (livePeriod >= div.periods) livePeriod = div.periods - 1;
  if (livePeriod < 0) livePeriod = 0;
  const nameOf = (id) => { const p = team.roster.find((x) => x.id === id); return p ? (p.number ? `${p.name} #${p.number}` : p.name) : '?'; };

  const onNow = g.grid[livePeriod] || [];
  const prev = livePeriod > 0 ? (g.grid[livePeriod - 1] || []) : [];
  const comingIn = onNow.filter((id) => !prev.includes(id));
  const goingOut = prev.filter((id) => !onNow.includes(id));
  const benchNow = team.roster.filter((p) => g.presentIds.includes(p.id) && !onNow.includes(p.id));

  const subsBlock = livePeriod === 0 ? null : el('div', { class: 'card' }, [
    el('h4', { text: 'Subs at ' + div.subLabels[livePeriod], style: 'margin:0 0 8px;color:var(--muted)' }),
    el('div', { class: 'lists' }, [
      el('div', {}, [el('h4', { text: 'IN ⬆' }), ...comingIn.map((id) => el('div', { class: 'pl in', text: nameOf(id) })), comingIn.length ? null : el('p', { class: 'muted', text: '—' })]),
      el('div', {}, [el('h4', { text: 'OUT ⬇' }), ...goingOut.map((id) => el('div', { class: 'pl out', text: nameOf(id) })), goingOut.length ? null : el('p', { class: 'muted', text: '—' })]),
    ]),
  ]);

  return el('div', { class: 'live' }, [
    el('div', { class: 'row between' }, [
      el('button', { class: 'btn', text: '◀', onclick: () => { livePeriod--; render(); }, ...(livePeriod === 0 ? { disabled: true } : {}) }),
      el('div', { class: 'period-head' }, [el('div', { text: div.periodLabels[livePeriod] }), el('div', { class: 'tag', text: `${div.subLabels[livePeriod]} · ${div.minutesPerPeriod} min` })]),
      el('button', { class: 'btn', text: '▶', onclick: () => { livePeriod++; render(); }, ...(livePeriod >= div.periods - 1 ? { disabled: true } : {}) }),
    ]),
    subsBlock,
    el('div', { class: 'card' }, [
      el('h4', { text: `On court (${onNow.length})`, style: 'margin:0 0 8px;color:var(--accent-2)' }),
      ...onNow.map((id) => el('div', { class: 'pl', text: nameOf(id) + posSuffix(g, livePeriod, id) })),
    ]),
    el('div', { class: 'card' }, [
      el('h4', { text: `Bench (${benchNow.length})`, style: 'margin:0 0 8px;color:var(--muted)' }),
      ...benchNow.map((p) => el('div', { class: 'pl', style: 'opacity:.7', text: p.number ? `${p.name} #${p.number}` : p.name })),
    ]),
  ]);
}
function posSuffix(g, period, id) { const pos = g.positions?.[`${period}:${id}`]; return pos != null ? ` · ${posLabel(pos)}` : ''; }

// ================= SEASON =================
function screenSeason(team) {
  const div = getDivision(team.division);
  const wrap = el('div', {}, [el('h2', { text: `${team.name} · Season` })]);
  const finals = finalizedGameCount(team);
  wrap.appendChild(el('p', { class: 'muted', text: finals === 0 ? 'Mark games as "final" to build season totals.' : `${finals} finalized game${finals === 1 ? '' : 's'}.` }));

  const rows = seasonStats(team);
  const maxMin = Math.max(1, ...rows.map((r) => r.minutes));
  for (const r of rows) {
    const posLine = Object.keys(r.byPosition).length
      ? Object.entries(r.byPosition).sort((a, b) => a[0] - b[0]).map(([k, v]) => `${posLabel(+k)} ${v}m`).join(' · ') : '';
    wrap.appendChild(el('div', { class: 'card' }, [
      el('div', { class: 'row between' }, [
        el('div', { class: 'grow' }, [
          el('div', { html: `<strong>${esc(r.name)}</strong>${r.number ? ` <span class="num">#${esc(r.number)}</span>` : ''}` }),
          el('div', { class: 'tag', text: `${r.minutes} min · ${r.periods} periods · ${r.games} games` }),
          posLine ? el('div', { class: 'tag', text: posLine }) : null,
        ]),
      ]),
      el('div', { style: `height:6px;border-radius:3px;margin-top:8px;background:var(--surface-2)` }, [
        el('div', { style: `height:100%;width:${Math.round((r.minutes / maxMin) * 100)}%;background:var(--accent);border-radius:3px` }),
      ]),
    ]));
  }
  if (rows.length === 0) wrap.appendChild(el('p', { class: 'muted', text: 'No players.' }));
  return wrap;
}

// ================= BACKUP =================
function screenBackup() {
  const wrap = el('div', {}, [el('h2', { text: 'Backup & restore' })]);
  wrap.appendChild(el('div', { class: 'card' }, [
    el('h3', { text: 'Export' }),
    el('p', { class: 'muted', text: 'Save all teams, rosters, games and season data to a file.' }),
    el('button', { class: 'btn primary block', text: '⬇ Download backup', onclick: downloadBackup }),
  ]));

  const fileInput = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none', onchange: (e) => importFile(e.target.files[0]) });
  wrap.appendChild(el('div', { class: 'card' }, [
    el('h3', { text: 'Import' }),
    el('p', { class: 'muted', text: 'Restore from a backup file. This replaces all current data.' }),
    fileInput,
    el('button', { class: 'btn block', text: '⬆ Choose backup file', onclick: () => fileInput.click() }),
  ]));
  return wrap;
}

function downloadBackup() {
  const blob = new Blob([store.exportJSON()], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `rotation-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.appendChild(a); a.click(); a.remove();
  toast('Backup downloaded');
}
function importFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (!confirm('Replace ALL current data with this backup?')) return;
    try { store.importJSON(reader.result); view = { tab: 'games', screen: 'list', gameId: null }; render(); toast('Restored'); }
    catch (e) { toast('Import failed: ' + e.message); }
  };
  reader.readAsText(file);
}

// ---- util ----
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
