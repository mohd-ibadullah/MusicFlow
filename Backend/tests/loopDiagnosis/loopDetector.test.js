// SYSTEM SCAN: loopDetector is a pure module used by loopDiagnosisEngine with env-backed thresholds.
// SYSTEM SCAN: project test runner is node:test and does not require Jest.
// SYSTEM SCAN: this test suite validates threshold/time-window behavior only.

import test from "node:test";
import assert from "node:assert/strict";

// Keep loop-detector tests deterministic regardless of runtime fallback test-mode config.
process.env.LOOP_ULTRA_MINIMAL_TEST_MODE = "false";
process.env.LOOP_REPLAY_THRESHOLD = "4";
process.env.LOOP_TIME_WINDOW_MINUTES = "45";

const { evaluateLoop } = await import("../../src/services/loopDiagnosis/loopDetector.js");

const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000);

test("CASE 1: Below threshold", () => {
  const now = new Date();
  const result = evaluateLoop({
    replayCount: 2,
    windowStart: minutesAgo(10),
    now,
    hour: 14,
  });

  assert.equal(result.isLoop, false);
});

test("CASE 2: At threshold, within window", () => {
  const now = new Date();
  const result = evaluateLoop({
    replayCount: 4,
    windowStart: minutesAgo(35),
    now,
    hour: 14,
  });

  assert.equal(result.isLoop, true);
  assert.equal(result.severity, "low");
});

test("CASE 3: Late night, lower threshold", () => {
  const now = new Date();
  const result = evaluateLoop({
    replayCount: 3,
    windowStart: minutesAgo(20),
    now,
    hour: 23,
  });

  assert.equal(result.isLoop, true);
  assert.equal(result.isLateNight, true);
  assert.equal(result.severity, "high");
});

test("CASE 4: Window expired", () => {
  const now = new Date();
  const result = evaluateLoop({
    replayCount: 6,
    windowStart: minutesAgo(50),
    now,
    hour: 16,
  });

  assert.equal(result.isLoop, false);
  assert.match(result.reason, /window expired/i);
});

test("CASE 5: Deep night replay", () => {
  const now = new Date();
  const result = evaluateLoop({
    replayCount: 3,
    windowStart: minutesAgo(15),
    now,
    hour: 3,
  });

  assert.equal(result.isLoop, true);
  assert.equal(result.timeOfDay, "deepnight");
});

test("CASE 6: Threshold+2 for medium severity", () => {
  const now = new Date();
  const result = evaluateLoop({
    replayCount: 6,
    windowStart: minutesAgo(20),
    now,
    hour: 15,
  });

  assert.equal(result.isLoop, true);
  assert.equal(result.severity, "medium");
});
