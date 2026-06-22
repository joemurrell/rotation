// Division rules and period models.
// Each division reduces the game to a fixed number of equal-length "periods".
// Substitutions are bench-clearing and happen between periods only.

export const DIVISIONS = {
  peewee: {
    id: 'peewee',
    name: 'Pee Wee',
    court: 5,              // players on court per period
    periods: 4,           // one period per quarter
    minutesPerPeriod: 6,
    // Column header for each period:
    periodLabels: ['Q1', 'Q2', 'Q3', 'Q4'],
    // What sub event happens *before* each period (shown above the grid):
    subLabels: ['Tip-off', 'End Q1', 'End Q2', 'End Q3 (Half)'],
    maxConsecutive: 2,    // no player plays > 2 consecutive periods (when avoidable)
    platoonAt: 10,        // exactly 10 present -> two fixed platoons of 5 alternate
    mustSitOnce: false,   // no forced-sit rule
    mustSitExemptAtOrBelow: 0,
  },
  mightymight: {
    id: 'mightymight',
    name: 'Might Mite',
    court: 5,
    periods: 8,           // mid-quarter + end-of-quarter splits each quarter in two
    minutesPerPeriod: 5,
    periodLabels: ['Q1·1', 'Q1·2', 'Q2·1', 'Q2·2', 'Q3·1', 'Q3·2', 'Q4·1', 'Q4·2'],
    subLabels: ['Tip-off', 'Mid Q1', 'End Q1', 'Mid Q2', 'Halftime', 'Mid Q3', 'End Q3', 'Mid Q4'],
    maxConsecutive: null, // no consecutive-period limit
    platoonAt: null,
    mustSitOnce: true,    // each player must sit at least one period...
    mustSitExemptAtOrBelow: 6, // ...unless 6 or fewer players are present
  },
};

export function getDivision(id) {
  return DIVISIONS[id] || DIVISIONS.peewee;
}

export const DIVISION_LIST = Object.values(DIVISIONS);
