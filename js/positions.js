// Position assignment: a layer on top of the already-generated rotation grid.
// Two modes:
//   'spread' — rotate each player through as many different positions (1-5) as
//              possible across the game, avoiding repeats until forced.
//   'fixed'  — each player is limited to the 1-2 positions you assign for the
//              game; we place them within that group and fill the court.
// Positions are 1=PG, 2=SG, 3=SF, 4=PF, 5=C.

export const POSITIONS = [1, 2, 3, 4, 5];
export const POSITION_LABELS = { 1: 'PG', 2: 'SG', 3: 'SF', 4: 'PF', 5: 'C' };
export const posLabel = (n) => `${n} ${POSITION_LABELS[n] || ''}`.trim();

/**
 * @param {Object} cfg
 * @param {string[][]} cfg.grid       grid[period] = on-court player ids
 * @param {'spread'|'fixed'} cfg.mode
 * @param {Object} cfg.groups         fixed mode: { playerId: [allowed positions] }
 * @param {Object} cfg.locks          manual overrides: { "period:pid": position }
 * @returns {{ byCell: Object, warnings: Array<{period:number, pids:string[]}> }}
 */
export function assignPositions({ grid, mode, groups = {}, locks = {} }) {
  const byCell = {};
  const warnings = [];
  const playedPos = {}; // pid -> { position: timesPlayed }  (drives spread variety)

  grid.forEach((onCourt, period) => {
    const used = new Set();        // positions taken this period
    const toAssign = [];

    // 1) honor manual locks first
    for (const pid of onCourt) {
      const lk = locks[`${period}:${pid}`];
      if (lk && !used.has(lk)) {
        byCell[`${period}:${pid}`] = lk;
        used.add(lk);
        bump(playedPos, pid, lk);
      } else {
        toAssign.push(pid);
      }
    }

    // 2) base allowed positions per player (mode-dependent)
    const baseAllowed = {};
    for (const pid of toAssign) {
      if (mode === 'fixed') {
        const g = groups[pid];
        baseAllowed[pid] = g && g.length ? g.slice() : POSITIONS.slice(); // no group set -> any open spot
      } else {
        baseAllowed[pid] = POSITIONS.slice();
      }
    }
    // Prefer positions the player has used least so far — in spread mode this
    // rotates them through 1-5; in fixed mode it alternates within their group.
    const cost = (pid, pos) => (playedPos[pid]?.[pos] || 0);

    // 3) best assignment: place as many players as possible, then minimize cost
    const best = bestAssignment(toAssign, baseAllowed, cost, used);
    for (const pid of toAssign) {
      const pos = best.assign[pid];
      if (pos != null) { byCell[`${period}:${pid}`] = pos; bump(playedPos, pid, pos); }
    }
    if (mode === 'fixed' && best.unassigned.length) {
      warnings.push({ period, pids: best.unassigned });
    }
  });

  return { byCell, warnings };
}

function bump(map, pid, pos) {
  (map[pid] = map[pid] || {})[pos] = (map[pid][pos] || 0) + 1;
}

// Exhaustive search (<=5 players, <=5 positions): maximize players placed,
// then minimize total cost. Players that can't be placed are left unassigned.
function bestAssignment(pids, baseAllowed, cost, lockedUsed) {
  let best = { count: -1, cost: Infinity, assign: {}, unassigned: pids.slice() };
  const used = new Set(lockedUsed);
  const cur = {};

  function rec(i, count, total) {
    // prune: even placing all remaining can't beat best count
    if (count + (pids.length - i) < best.count) return;
    if (i === pids.length) {
      if (count > best.count || (count === best.count && total < best.cost)) {
        best = {
          count, cost: total,
          assign: { ...cur },
          unassigned: pids.filter((p) => cur[p] == null),
        };
      }
      return;
    }
    const pid = pids[i];
    for (const pos of baseAllowed[pid]) {
      if (used.has(pos)) continue;
      used.add(pos); cur[pid] = pos;
      rec(i + 1, count + 1, total + cost(pid, pos));
      used.delete(pos); cur[pid] = null;
    }
    // leave this player unassigned (only matters when the court is over-constrained)
    cur[pid] = null;
    rec(i + 1, count, total);
  }

  rec(0, 0, 0);
  return best;
}
