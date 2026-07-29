import assert from "node:assert/strict";
import test from "node:test";
import { assignEventLanes } from "../app/event-lanes.ts";

test("keeps a multi-day event in one lane while shorter events come and go", () => {
  const lanes = assignEventLanes([
    { id: 1, startSlot: 10, endSlot: 30 },
    { id: 2, startSlot: 10, endSlot: 14 },
    { id: 3, startSlot: 16, endSlot: 20 },
    { id: 4, startSlot: 22, endSlot: 26 },
  ]);

  assert.equal(lanes.get(1), 0);
  assert.equal(lanes.get(2), 1);
  assert.equal(lanes.get(3), 1);
  assert.equal(lanes.get(4), 1);
});

test("overlapping events never share a lane", () => {
  const events = [
    { id: 1, startSlot: 10, endSlot: 20 },
    { id: 2, startSlot: 12, endSlot: 18 },
    { id: 3, startSlot: 18, endSlot: 24 },
  ];
  const lanes = assignEventLanes(events);

  for (const event of events) {
    for (const other of events) {
      if (event.id >= other.id) continue;
      const overlap = event.startSlot < other.endSlot && event.endSlot > other.startSlot;
      if (overlap) assert.notEqual(lanes.get(event.id), lanes.get(other.id));
    }
  }
});
