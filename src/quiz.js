/**
 * Investor-profile quiz: five questions, each answer points to one profile.
 * Pure logic (no DOM); the texts live in i18n.js under quiz_* keys.
 */

export const PROFILE_KEYS = ["aggressive", "defensive", "longterm"];

// Each question lists its options in a fixed order; option i adds 1 point to OPTIONS[q][i].
export const QUESTIONS = [
  { key: "drop", options: ["aggressive", "defensive", "longterm"] },
  { key: "horizon", options: ["aggressive", "defensive", "longterm"] },
  { key: "goal", options: ["aggressive", "defensive", "longterm"] },
  { key: "coin", options: ["aggressive", "defensive", "longterm"] },
  { key: "habit", options: ["aggressive", "defensive", "longterm"] },
];

// When two profiles tie, the time-horizon answer decides: it is the strongest single signal.
const TIE_BREAK_QUESTION = 1;

/**
 * answers: array of option indexes (0..2), one per question.
 * Returns { profile, points: {aggressive, defensive, longterm}, complete }.
 */
export function quizResult(answers) {
  const points = Object.fromEntries(PROFILE_KEYS.map((k) => [k, 0]));
  let complete = true;
  QUESTIONS.forEach((q, i) => {
    const a = answers[i];
    if (!Number.isInteger(a) || a < 0 || a >= q.options.length) { complete = false; return; }
    points[q.options[a]] += 1;
  });
  if (!complete) return { profile: null, points, complete };
  const top = Math.max(...Object.values(points));
  const leaders = PROFILE_KEYS.filter((k) => points[k] === top);
  let profile = leaders[0];
  if (leaders.length > 1) {
    const horizon = QUESTIONS[TIE_BREAK_QUESTION].options[answers[TIE_BREAK_QUESTION]];
    // If the horizon answer is among the tied profiles it wins; otherwise pick the more cautious one.
    profile = leaders.includes(horizon) ? horizon : ["defensive", "longterm", "aggressive"].find((k) => leaders.includes(k));
  }
  return { profile, points, complete };
}
