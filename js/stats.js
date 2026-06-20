// Season aggregation from finalized games.
import { getDivision } from './rules.js';

/**
 * Aggregate playing time per player across a team's finalized games.
 * @returns {Array<{ id, name, games, periods, minutes, byPosition }>}
 *          sorted by minutes descending. byPosition maps position -> minutes.
 */
export function seasonStats(team) {
  const div = getDivision(team.division);
  const mpp = div.minutesPerPeriod;
  const out = new Map(
    team.roster.map((p) => [p.id, { id: p.id, name: p.name, number: p.number, games: 0, periods: 0, minutes: 0, byPosition: {} }])
  );

  for (const g of team.games) {
    if (!g.finalized || !g.grid?.length) continue;
    const playedThisGame = new Set();
    g.grid.forEach((onCourt, period) => {
      for (const pid of onCourt) {
        const rec = out.get(pid);
        if (!rec) continue; // player removed from roster after game
        rec.periods += 1;
        rec.minutes += mpp;
        playedThisGame.add(pid);
        const pos = g.positions?.[`${period}:${pid}`];
        if (pos) rec.byPosition[pos] = (rec.byPosition[pos] || 0) + mpp;
      }
    });
    for (const pid of playedThisGame) {
      const rec = out.get(pid);
      if (rec) rec.games += 1;
    }
  }

  return [...out.values()].sort((a, b) => b.minutes - a.minutes);
}

export function finalizedGameCount(team) {
  return team.games.filter((g) => g.finalized).length;
}
