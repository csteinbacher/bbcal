export type LaneEvent = { id: number; startSlot: number; endSlot: number };

export function assignEventLanes(events: LaneEvent[]) {
  const laneEnds: number[] = [];
  const lanes = new Map<number, number>();
  const ordered = [...events].sort(
    (a, b) => a.startSlot - b.startSlot || b.endSlot - a.endSlot || a.id - b.id,
  );

  for (const event of ordered) {
    let lane = laneEnds.findIndex(endSlot => endSlot <= event.startSlot);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = event.endSlot;
    lanes.set(event.id, lane);
  }

  return lanes;
}
