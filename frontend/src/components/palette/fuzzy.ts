// Tiny fuzzy match: returns score >= 0 if all chars in `query` appear in order in `text`.
// Higher score = better (consecutive matches and prefix matches preferred).
export function fuzzyScore(text: string, query: string): number {
  if (!query) return 1;
  const t = text.toLowerCase();
  const q = query.toLowerCase();
  let ti = 0, qi = 0, score = 0, streak = 0;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) {
      score += 1 + streak * 2;
      if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '-') score += 3;
      streak++;
      qi++;
    } else {
      streak = 0;
    }
    ti++;
  }
  if (qi < q.length) return -1;
  return score;
}
