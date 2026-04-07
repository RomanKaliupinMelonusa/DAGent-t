import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SessionCircuitBreaker } from "../session/session-events.js";

describe("SessionCircuitBreaker", () => {
  it("fires soft warning once when soft threshold reached", () => {
    const breaker = new SessionCircuitBreaker(3, 5, () => {});
    const counts: Record<string, number> = {};
    breaker.recordCall("shell", counts);
    breaker.recordCall("shell", counts);
    assert.equal(breaker.shouldWarnSoft, false); // 2 < 3
    breaker.recordCall("shell", counts);
    assert.equal(breaker.shouldWarnSoft, true);  // 3 >= 3, fires once
    assert.equal(breaker.shouldWarnSoft, false);  // already fired
  });

  it("trips on hard threshold and calls onTrip", () => {
    let tripped = false;
    let tripTotal = 0;
    const breaker = new SessionCircuitBreaker(3, 5, (total) => {
      tripped = true;
      tripTotal = total;
    });
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4; i++) breaker.recordCall("shell", counts);
    assert.equal(breaker.tripped, false); // 4 < 5
    breaker.recordCall("shell", counts);
    assert.equal(breaker.tripped, true);  // 5 >= 5
    assert.equal(tripped, true);
    assert.equal(tripTotal, 5);
  });

  it("does not fire onTrip more than once", () => {
    let tripCount = 0;
    const breaker = new SessionCircuitBreaker(2, 3, () => { tripCount++; });
    const counts: Record<string, number> = {};
    for (let i = 0; i < 6; i++) breaker.recordCall("shell", counts);
    assert.equal(tripCount, 1);
  });

  it("tracks calls across different categories", () => {
    const breaker = new SessionCircuitBreaker(10, 4, () => {});
    const counts: Record<string, number> = {};
    breaker.recordCall("shell", counts);
    breaker.recordCall("file-read", counts);
    breaker.recordCall("file-write", counts);
    assert.equal(breaker.tripped, false); // 3 < 4
    breaker.recordCall("search", counts);
    assert.equal(breaker.tripped, true);  // 4 >= 4
    assert.deepEqual(counts, { shell: 1, "file-read": 1, "file-write": 1, search: 1 });
  });
});
