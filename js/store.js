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

function save() {
  localStorage.setItem(KEY, JSON.stringify(state));
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

// --- backup ---
export function exportJSON() { return JSON.stringify(state, null, 2); }
export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.teams)) throw new Error('Not a valid backup file.');
  state = data;
  if (!state.schema) state.schema = SCHEMA;
  save();
}
