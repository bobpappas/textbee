import { nextSlot, schedule } from './schedule'
const jobs = (costs: number[], notBefore = 0) =>
  costs.map((segments, i) => ({ id: String(i), segments, notBefore }))
describe('B060 controlled-clock pacing', () => {
  it.each([5, 6])(
    'paces %i three-segment recipients over rolling minutes',
    (n) => {
      const times = schedule(0, 0, 10, [], jobs(Array(n).fill(3)))!.map(
        (x) => x.at,
      )
      expect(times).toEqual([0, 18000, 36000, 60000, 78000, 96000].slice(0, n))
    },
  )
  it('includes previously queued groups', () => {
    expect(schedule(0, 0, 10, [], jobs(Array(12).fill(3)))![11].at).toBe(216000)
  })
  it('accounts for usage and an existing pacing clock', () => {
    expect(nextSlot(1000, 5000, 3, 10, [{ at: 0, segments: 9 }])).toBe(60000)
  })
  it('uses an exclusive 60 second expiry boundary', () => {
    expect(nextSlot(59999, 0, 1, 10, [{ at: 0, segments: 10 }])).toBe(60000)
    expect(nextSlot(60000, 0, 1, 10, [{ at: 0, segments: 10 }])).toBe(60000)
  })
  it('does not hold ready work behind a future scheduled message', () => {
    expect(
      schedule(
        0,
        0,
        10,
        [],
        [{ id: 'future', segments: 1, notBefore: 120000 }, ...jobs([1, 1])],
      )!.map((x) => x.id),
    ).toEqual(['0', '1', 'future'])
  })
  it('does not catch up with a burst after downtime', () => {
    expect(
      schedule(300000, 0, 10, [], jobs([2, 2, 2]))!.map((x) => x.at),
    ).toEqual([300000, 312000, 324000])
  })
  it('supports unlimited minute capacity while accounting for worker cadence', () => {
    expect(schedule(0, 0, -1, [], jobs([20, 20]))!.map((x) => x.at)).toEqual([
      0, 1000,
    ])
  })
  it('rejects a single oversized message, not an oversized audience', () => {
    expect(schedule(0, 0, 10, [], jobs([11]))).toBeNull()
    expect(schedule(0, 0, 10, [], jobs(Array(100).fill(1)))).toHaveLength(100)
  })
  it('preserves FIFO rather than filling gaps with smaller later messages', () => {
    expect(schedule(0, 0, 10, [], jobs([8, 8, 1]))!.map((x) => x.at)).toEqual([
      0, 60000, 108000,
    ])
  })
  it('enforces invariants across 200 deterministic mixed-cost workloads', () => {
    let seed = 601
    for (let run = 0; run < 200; run++) {
      const costs = Array.from({ length: 30 }, () => {
        seed = (seed * 16807) % 2147483647
        return 1 + (seed % 10)
      })
      const plan = schedule(0, 0, 10, [], jobs(costs))!
      plan.forEach((item, i) => {
        const used = plan
          .slice(0, i + 1)
          .reduce((n, p, j) => n + (p.at > item.at - 60000 ? costs[j] : 0), 0)
        expect(used).toBeLessThanOrEqual(10)
        if (i)
          expect(item.at - plan[i - 1].at).toBeGreaterThanOrEqual(
            costs[i - 1] * 6000,
          )
      })
    }
  })
})
