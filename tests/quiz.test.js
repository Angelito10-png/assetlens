import { test } from "node:test";
import assert from "node:assert/strict";
import { QUESTIONS, quizResult } from "../src/quiz.js";
import { LANGS } from "../src/i18n.js";

const A = 0, D = 1, L = 2;

test("quiz: a clear majority picks that profile", () => {
  assert.equal(quizResult([A, A, A, D, L]).profile, "aggressive");
  assert.equal(quizResult([D, D, L, D, A]).profile, "defensive");
  assert.equal(quizResult([L, L, L, L, L]).profile, "longterm");
  assert.deepEqual(quizResult([A, A, A, D, L]).points, { aggressive: 3, defensive: 1, longterm: 1 });
});

test("quiz: ties are decided by the time-horizon answer, else the cautious profile", () => {
  assert.equal(quizResult([A, L, A, L, D]).profile, "longterm"); // A2 L2, horizon = long-term
  assert.equal(quizResult([A, A, D, D, L]).profile, "aggressive"); // A2 D2, horizon = aggressive
  assert.equal(quizResult([A, L, D, D, A]).profile, "defensive"); // A2 D2, horizon (L) not tied -> cautious
});

test("quiz: unanswered questions give no result", () => {
  const r = quizResult([A, A, undefined, D, L]);
  assert.equal(r.complete, false);
  assert.equal(r.profile, null);
  assert.equal(quizResult([A, A, 7, D, L]).complete, false);
});

test("quiz: every question and option has English and Greek text", () => {
  for (const lang of ["en", "el"]) for (const q of QUESTIONS) {
    assert.equal(typeof LANGS[lang]["quiz_" + q.key], "string", `${lang} ${q.key}`);
    q.options.forEach((_, i) => assert.equal(typeof LANGS[lang][`quiz_${q.key}_${i}`], "string", `${lang} ${q.key}_${i}`));
  }
});
