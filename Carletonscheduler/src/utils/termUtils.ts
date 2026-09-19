/**
 * Temporal Logic Engine for Carleton University term codes.
 *
 * Carleton term codes follow the pattern YYYY{suffix}:
 *   YYYY10 = Winter  (January – April)
 *   YYYY20 = Summer  (May – August)
 *   YYYY30 = Fall    (September – December)
 *
 * The engine derives everything from the system clock so the app
 * "updates itself" every semester without manual code changes.
 */

// ─── Term‑code arithmetic ───────────────────────────────────────────────────

/** Build a term code from a calendar year and a suffix (10, 20, 30). */
function makeTerm(year: number, suffix: 10 | 20 | 30): string {
  return `${year}${suffix}`;
}

/** Return the term code that immediately follows the given one. */
function nextTerm(term: string): string {
  const year = parseInt(term.substring(0, 4), 10);
  const suffix = parseInt(term.substring(4), 10);
  if (suffix === 10) return makeTerm(year, 20);
  if (suffix === 20) return makeTerm(year, 30);
  // Fall → next year's Winter
  return makeTerm(year + 1, 10);
}

/** Return the term code that immediately precedes the given one. */
function previousTerm(term: string): string {
  const year = parseInt(term.substring(0, 4), 10);
  const suffix = parseInt(term.substring(4), 10);
  if (suffix === 30) return makeTerm(year, 20);
  if (suffix === 20) return makeTerm(year, 10);
  // Winter → previous year's Fall
  return makeTerm(year - 1, 30);
}

// ─── Current‑term detection ─────────────────────────────────────────────────

/** Determine the "active" term based on the current month. */
function activeTerm(today: Date): string {
  const year = today.getFullYear();
  const month = today.getMonth() + 1; // 1-based

  if (month >= 1 && month <= 4) return makeTerm(year, 10);   // Winter
  if (month >= 5 && month <= 8) return makeTerm(year, 20);   // Summer
  return makeTerm(year, 30);                                   // Fall (Sep–Dec)
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface VisibleTerm {
  code: string;
  role: 'previous' | 'current' | 'upcoming';
}

/**
 * Return a rolling window of visible terms.
 *
 * Rules:
 * 1. **Active Term** – the semester that corresponds to the current month.
 * 2. **Historical Context** – the immediately preceding term (for late‑semester
 *    swaps / retake planning).
 * 3. **Planning Context** – the next term. During Summer (May–Aug), both the
 *    upcoming Fall *and* the following Winter are included because Carleton
 *    students register for both at once during that period.
 */
export function getVisibleTerms(today: Date = new Date()): VisibleTerm[] {
  const current = activeTerm(today);
  const prev = previousTerm(current);
  const next1 = nextTerm(current);

  const terms: VisibleTerm[] = [
    { code: prev, role: 'previous' },
    { code: current, role: 'current' },
    { code: next1, role: 'upcoming' },
  ];

  // During Summer, add the Winter term that follows Fall so students can
  // plan both semesters they're registering for simultaneously.
  const suffix = parseInt(current.substring(4), 10);
  if (suffix === 20) {
    terms.push({ code: nextTerm(next1), role: 'upcoming' });
  }

  return terms;
}

/**
 * Full human‑readable label.
 * e.g. "Fall 2026", "Winter 2027", "Summer 2026"
 */
export function getTermLabel(code: string): string {
  const year = code.substring(0, 4);
  const suffix = code.substring(4);
  if (suffix === '10') return `Winter ${year}`;
  if (suffix === '20') return `Summer ${year}`;
  if (suffix === '30') return `Fall ${year}`;
  return code;
}

/**
 * Compact label for badges / tabs.
 * e.g. "F26", "W27", "S26"
 */
export function getTermShortLabel(code: string): string {
  const yearSuffix = code.substring(2, 4);
  const suffix = code.substring(4);
  if (suffix === '10') return `W${yearSuffix}`;
  if (suffix === '20') return `S${yearSuffix}`;
  if (suffix === '30') return `F${yearSuffix}`;
  return code;
}

/**
 * Convenience: return the first registerable (non‑previous) term.
 * This is normally the "current" term but callers can rely on this
 * helper to always pick the right default.
 */
export function getDefaultActiveTerm(today: Date = new Date()): string {
  const terms = getVisibleTerms(today);
  const current = terms.find(t => t.role === 'current');
  return current ? current.code : terms[0].code;
}
