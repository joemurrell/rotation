// Rotation generator: division-agnostic, pure functions (no DOM, no storage).
//
// Given the period model and the set of present players (each with an
// availability window and optional front-load flag), produce a fair,
// rules-compliant grid of which players are on court each period, plus a list
// of any rule violations that couldn't be avoided.

// --- seeded RNG so "Regenerate" gives variety but a given seed is reproducible ---
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @param {Object} cfg
 * @param {number} cfg.periods       number of periods
 * @param {number} cfg.court         players on court per period
 * @param {number|null} cfg.maxConsecutive  max consecutive periods (null = no limit)
 * @param {number|null} cfg.platoonAt        N at which to use fixed platoons (Pee Wee 10)
 * @param {boolean} cfg.mustSitOnce          everyone must sit >=1 period...
 * @param {number} cfg.mustSitExemptAtOrBelow ...unless N <= this
 * @param {Array} cfg.players  [{ id, name, available:boolean[periods], frontLoad:boolean }]
 * @param {number} [cfg.seed]
 * @returns {{ grid: string[][], counts: Object, warnings: string[] }}
 *          grid[period] = array of player ids on court that period
 */
export function generateRotation(cfg) {
  const { periods, court, players, seed = 1 } = cfg;
  const maxConsecutive = cfg.maxConsecutive ?? null;
  const N = players.length;
  const rng = mulberry32(seed);

  if (N === 0) return { grid: Array.from({ length: periods }, () => []), counts: {}, warnings: [] };

  // Special case: exactly `platoonAt` players -> two fixed platoons of `court`,
  // alternating every period (each plays half the periods, never consecutive).
  if (cfg.platoonAt && N === cfg.platoonAt && N === court * 2) {
    return platoonRotation(players, periods, court, rng);
  }

  const ids = players.map((p) => p.id);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const played = Object.fromEntries(ids.map((id) => [id, 0]));
  const streak = Object.fromEntries(ids.map((id) => [id, 0])); // current consecutive run
  const grid = [];

  for (let period = 0; period < periods; period++) {
    const availableIds = ids.filter((id) => byId[id].available[period]);
    const capacity = Math.min(court, availableIds.length);

    // Partition by the hard-ish consecutive constraint.
    const eligible = [];
    const blocked = []; // would exceed maxConsecutive — avoid unless forced
    for (const id of availableIds) {
      if (maxConsecutive != null && streak[id] >= maxConsecutive) blocked.push(id);
      else eligible.push(id);
    }

    const pick = [];
    fillFrom(eligible, capacity - pick.length);
    if (pick.length < capacity) fillFrom(blocked, capacity - pick.length); // forced overuse

    // commit period
    grid.push(pick);
    const picked = new Set(pick);
    for (const id of ids) {
      if (picked.has(id)) { played[id]++; streak[id]++; }
      else streak[id] = 0;
    }

    // selection helper: pick the `n` neediest players from a pool
    function fillFrom(pool, n) {
      if (n <= 0 || pool.length === 0) return;
      const shuffled = shuffle(pool, rng); // randomize ties before stable sort
      shuffled.sort((a, b) => {
        // 1) fewest periods played so far (front-load gives an early-period bonus)
        const da = effectivePlayed(a), db = effectivePlayed(b);
        if (da !== db) return da - db;
        // 2) prefer the shorter current streak (cleaner alternation / spreads rest)
        if (streak[a] !== streak[b]) return streak[a] - streak[b];
        return 0; // already shuffled -> random tie-break
      });
      for (let i = 0; i < shuffled.length && pick.length < capacity && n > 0; i++) {
        pick.push(shuffled[i]); n--;
      }
    }
    function effectivePlayed(id) {
      // front-load players look slightly "needier" in the first half of the game,
      // biasing their minutes earlier.
      const bonus = byId[id].frontLoad && period < periods / 2 ? 0.5 : 0;
      return played[id] - bonus;
    }
  }

  // --- repair: enforce "must sit once" when required ---
  const exempt = N <= cfg.mustSitExemptAtOrBelow;
  if (cfg.mustSitOnce && !exempt && N > court) {
    enforceSitOnce(grid, players, periods, court);
    // recompute played after repair
    for (const id of ids) played[id] = 0;
    for (const p of grid) for (const id of p) played[id]++;
  }

  const warnings = collectWarnings({ grid, players, periods, court, maxConsecutive, cfg, played });
  return { grid, counts: played, warnings };
}

function platoonRotation(players, periods, court, rng) {
  const ids = shuffle(players.map((p) => p.id), rng);
  const groupA = ids.slice(0, court);
  const groupB = ids.slice(court, court * 2);
  const grid = [];
  for (let p = 0; p < periods; p++) grid.push(p % 2 === 0 ? groupA.slice() : groupB.slice());
  const counts = {};
  for (const id of players.map((p) => p.id)) counts[id] = 0;
  for (const p of grid) for (const id of p) counts[id]++;
  return { grid, counts, warnings: [] };
}

// Make sure no eligible player plays every single period (Mighty Mite).
function enforceSitOnce(grid, players, periods, court) {
  const ids = players.map((p) => p.id);
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const playedCount = (id) => grid.reduce((n, p) => n + (p.includes(id) ? 1 : 0), 0);
  const availCount = (id) => byId[id].available.filter(Boolean).length;

  for (const id of ids) {
    // A player only *needs* to sit if they're available for every period.
    if (availCount(id) < periods) continue;
    if (playedCount(id) < periods) continue; // already sits at least once
    // Find a period where we can swap them out for someone who is sitting,
    // available, and currently plays more than they would after the swap.
    for (let p = 0; p < periods; p++) {
      const onCourt = grid[p];
      if (!onCourt.includes(id)) continue;
      const benchCandidate = ids.find(
        (o) => o !== id && byId[o].available[p] && !onCourt.includes(o) && playedCount(o) < playedCount(id)
      );
      if (benchCandidate) {
        grid[p] = onCourt.map((x) => (x === id ? benchCandidate : x));
        break;
      }
    }
  }
}

function collectWarnings({ grid, players, periods, court, maxConsecutive, cfg, played }) {
  const warnings = [];
  const byId = Object.fromEntries(players.map((p) => [p.id, p]));
  const N = players.length;

  // consecutive-period violations
  if (maxConsecutive != null) {
    for (const pl of players) {
      let run = 0, worst = 0;
      for (let p = 0; p < periods; p++) {
        if (grid[p].includes(pl.id)) { run++; worst = Math.max(worst, run); }
        else run = 0;
      }
      if (worst > maxConsecutive) {
        warnings.push(`${pl.name} plays ${worst} periods in a row (only ${N} players — unavoidable).`);
      }
    }
  }

  // must-sit violations (should be repaired; warn if truly impossible)
  const exempt = N <= cfg.mustSitExemptAtOrBelow;
  if (cfg.mustSitOnce && !exempt) {
    for (const pl of players) {
      const plays = grid.reduce((n, p) => n + (p.includes(pl.id) ? 1 : 0), 0);
      const avail = byId[pl.id].available.filter(Boolean).length;
      if (plays >= periods && avail >= periods) {
        warnings.push(`${pl.name} never sits — couldn't satisfy the sit-one rule.`);
      }
    }
  }

  // fairness note: report spread among players available the whole game
  const fullGame = players.filter((p) => p.available.every(Boolean));
  if (fullGame.length > 1) {
    const vals = fullGame.map((p) => played[p.id]);
    const spread = Math.max(...vals) - Math.min(...vals);
    if (spread >= 2) {
      warnings.push(`Playing time varies by ${spread} periods across full-game players.`);
    }
  }
  return warnings;
}

// Re-check an existing (possibly hand-edited) grid against the division rules.
export function validateRotation(cfg, players, grid) {
  const played = {};
  for (const p of players) played[p.id] = 0;
  for (const period of grid) for (const id of period) played[id] = (played[id] || 0) + 1;
  return collectWarnings({
    grid, players,
    periods: cfg.periods, court: cfg.court,
    maxConsecutive: cfg.maxConsecutive ?? null,
    cfg, played,
  });
}

// Build the per-player availability array from a from/to window (1-based inclusive).
// Returns boolean[periods]. Defaults to all-available.
export function availabilityFromWindow(periods, fromPeriod = 1, toPeriod = periods) {
  const a = [];
  for (let p = 0; p < periods; p++) a.push(p + 1 >= fromPeriod && p + 1 <= toPeriod);
  return a;
}
