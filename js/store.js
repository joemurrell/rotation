// Persistence: a single JSON blob in localStorage, plus CRUD helpers and
// export/import for backup. No framework — just an in-memory object that we
// save on every mutation.

const KEY = 'bbrotation.v1';
const SCHEMA = 1;

const uid = () => Math.random().toString(36).slice(2, 10);

const blank = () => ({ schema: SCHEMA, activeTeamId: null, teams: [] });

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return blank();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || !Array.isArray(data.teams)) return blank();
    return data;
  } catch {
    return blank();
  }
}

let onSaveError = null;
// Lets the UI surface a message when persistence fails (quota exceeded,
// private-browsing restrictions, etc.) instead of failing silently.
export function setSaveErrorHandler(fn) { onSaveError = fn; }

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (err) {
    if (onSaveError) onSaveError(err);
  }
}

// --- teams ---
export function getState() { return state; }
export function getTeams() { return state.teams; }
export function getActiveTeam() {
  return state.teams.find((t) => t.id === state.activeTeamId) || null;
}
export function setActiveTeam(id) { state.activeTeamId = id; save(); }

export function addTeam(name, division) {
  const team = { id: uid(), name: name.trim() || 'Team', division, roster: [], games: [] };
  state.teams.push(team);
  state.activeTeamId = team.id;
  save();
  return team;
}
export function updateTeam(id, patch) {
  const t = state.teams.find((x) => x.id === id);
  if (t) Object.assign(t, patch);
  save();
}
export function deleteTeam(id) {
  state.teams = state.teams.filter((t) => t.id !== id);
  if (state.activeTeamId === id) state.activeTeamId = state.teams[0]?.id || null;
  save();
}

// --- roster ---
export function addPlayer(teamId, { name, number = '', positions = [] }) {
  const t = state.teams.find((x) => x.id === teamId);
  if (!t) return;
  t.roster.push({ id: uid(), name: name.trim() || 'Player', number, positions });
  save();
}
export function updatePlayer(teamId, playerId, patch) {
  const t = state.teams.find((x) => x.id === teamId);
  const p = t?.roster.find((x) => x.id === playerId);
  if (p) Object.assign(p, patch);
  save();
}
export function deletePlayer(teamId, playerId) {
  const t = state.teams.find((x) => x.id === teamId);
  if (t) t.roster = t.roster.filter((p) => p.id !== playerId);
  save();
}

// --- games ---
export function addGame(teamId, game) {
  const t = state.teams.find((x) => x.id === teamId);
  if (!t) return null;
  const g = {
    id: uid(),
    date: game.date || new Date().toISOString().slice(0, 10),
    opponent: game.opponent || '',
    presentIds: game.presentIds || [],
    windows: game.windows || {},     // playerId -> {from,to} (1-based period window)
    frontLoad: game.frontLoad || [], // playerIds
    grid: game.grid || [],           // [period][playerId,...]
    positions: game.positions || {}, // "period:playerId" -> effective position (1-5)
    positionMode: game.positionMode || 'off', // 'off' | 'spread' | 'fixed'
    positionGroups: game.positionGroups || {}, // fixed mode: playerId -> [positions]
    positionLocks: game.positionLocks || {},   // "period:playerId" -> position (manual override)
    seed: game.seed || 1,
    finalized: false,
  };
  t.games.unshift(g);
  save();
  return g;
}
export function updateGame(teamId, gameId, patch) {
  const t = state.teams.find((x) => x.id === teamId);
  const g = t?.games.find((x) => x.id === gameId);
  if (g) Object.assign(g, patch);
  save();
}
export function deleteGame(teamId, gameId) {
  const t = state.teams.find((x) => x.id === teamId);
  if (t) t.games = t.games.filter((g) => g.id !== gameId);
  save();
}

// --- mid-game roster changes (late arrivals, early leaves, corrections) ---
export function addPlayerToGame(teamId, gameId, playerId) {
  const g = findGame(teamId, gameId);
  if (!g) return;
  if (!g.presentIds.includes(playerId)) g.presentIds.push(playerId);
  save();
}
export function removePlayerFromGame(teamId, gameId, playerId) {
  const g = findGame(teamId, gameId);
  if (!g) return;
  g.presentIds = g.presentIds.filter((id) => id !== playerId);
  g.grid = g.grid.map((period) => period.filter((id) => id !== playerId));
  delete g.windows[playerId];
  g.frontLoad = (g.frontLoad || []).filter((id) => id !== playerId);
  delete g.positionGroups[playerId];
  for (const key of Object.keys(g.positionLocks)) {
    if (key.endsWith(`:${playerId}`)) delete g.positionLocks[key];
  }
  for (const key of Object.keys(g.positions)) {
    if (key.endsWith(`:${playerId}`)) delete g.positions[key];
  }
  save();
}
function findGame(teamId, gameId) {
  const t = state.teams.find((x) => x.id === teamId);
  return t?.games.find((x) => x.id === gameId);
}

// --- backup ---
export function exportJSON() { return JSON.stringify(state, null, 2); }
export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.teams)) throw new Error('Not a valid backup file.');
  state = sanitizeState(data);
  save();
}

// Normalizes a parsed backup into the shape the rest of the app assumes, so a
// hand-edited or partially-corrupt file can't crash downstream code that
// expects e.g. g.grid or g.windows to be a particular type.
function sanitizeState(data) {
  const teams = data.teams.map(sanitizeTeam).filter(Boolean);
  const activeTeamId = teams.some((t) => t.id === data.activeTeamId) ? data.activeTeamId : (teams[0]?.id || null);
  return { schema: SCHEMA, activeTeamId, teams };
}

function sanitizeTeam(t) {
  if (!t || typeof t !== 'object' || typeof t.id !== 'string') return null;
  return {
    id: t.id,
    name: typeof t.name === 'string' && t.name.trim() ? t.name : 'Team',
    division: typeof t.division === 'string' ? t.division : 'peewee',
    roster: Array.isArray(t.roster) ? t.roster.map(sanitizePlayer).filter(Boolean) : [],
    games: Array.isArray(t.games) ? t.games.map(sanitizeGame).filter(Boolean) : [],
  };
}

function sanitizePlayer(p) {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string') return null;
  return {
    id: p.id,
    name: typeof p.name === 'string' && p.name.trim() ? p.name : 'Player',
    number: typeof p.number === 'string' || typeof p.number === 'number' ? String(p.number) : '',
    positions: Array.isArray(p.positions) ? p.positions.filter((x) => typeof x === 'string') : [],
  };
}

function sanitizeGame(g) {
  if (!g || typeof g !== 'object' || typeof g.id !== 'string') return null;
  return {
    id: g.id,
    date: typeof g.date === 'string' && g.date ? g.date : new Date().toISOString().slice(0, 10),
    opponent: typeof g.opponent === 'string' ? g.opponent : '',
    presentIds: Array.isArray(g.presentIds) ? g.presentIds.filter((id) => typeof id === 'string') : [],
    windows: (g.windows && typeof g.windows === 'object') ? g.windows : {},
    frontLoad: Array.isArray(g.frontLoad) ? g.frontLoad.filter((id) => typeof id === 'string') : [],
    grid: Array.isArray(g.grid) ? g.grid.map((period) => (Array.isArray(period) ? period.filter((id) => typeof id === 'string') : [])) : [],
    positions: (g.positions && typeof g.positions === 'object') ? g.positions : {},
    positionMode: ['off', 'spread', 'fixed'].includes(g.positionMode) ? g.positionMode : 'off',
    positionGroups: (g.positionGroups && typeof g.positionGroups === 'object') ? g.positionGroups : {},
    positionLocks: (g.positionLocks && typeof g.positionLocks === 'object') ? g.positionLocks : {},
    seed: typeof g.seed === 'number' ? g.seed : 1,
    finalized: !!g.finalized,
  };
}
