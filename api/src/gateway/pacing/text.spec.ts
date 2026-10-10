import { normalizeSms, smsUnits, textAdvice } from './text'
describe('B060 exact text and segment advice', () => {
  it('normalizes formatting and is idempotent', () => {
    const input = '“Hello”—it’s…\u00a0nice\u202f–yes‘'
    const output = '"Hello"-it\'s... nice -yes\''
    expect(normalizeSms(input)).toBe(output)
    expect(normalizeSms(output)).toBe(output)
  })
  it.each([
    'https://example.test/“a”?x=…&y=%20#é',
    '(https://example.test/a’).',
    'www.example.test/😀?q=“yes”',
  ])('preserves URL token %s', (url) => {
    expect(normalizeSms(`“See” ${url} — thanks`)).toBe(`"See" ${url} - thanks`)
  })
  it.each([
    [160, 1],
    [161, 2],
    [306, 2],
    [307, 3],
  ])('counts GSM length %i as %i', (n, segments) =>
    expect(smsUnits('a'.repeat(n)).segments).toBe(segments),
  )
  it.each([
    [70, 1],
    [71, 2],
    [134, 2],
    [135, 3],
  ])('counts Unicode length %i as %i', (n, segments) =>
    expect(smsUnits('漢'.repeat(n)).segments).toBe(segments),
  )
  it('counts extension characters and surrogate pairs', () => {
    expect(smsUnits('^'.repeat(80)).segments).toBe(1)
    expect(smsUnits('^'.repeat(81)).segments).toBe(2)
    expect(smsUnits('😊')).toMatchObject({
      units: 2,
      segments: 1,
      encoding: 'Unicode',
    })
    expect(smsUnits('👨‍👩‍👧‍👦').units).toBe(11)
    expect(smsUnits('é').encoding).toBe('GSM-7')
  })
  it('calculates the special two-to-one threshold and audience savings', () => {
    expect(textAdvice('a'.repeat(161), 6)).toMatchObject({
      trimUnits: 1,
      saveOneSegmentTotal: 6,
      totalSegments: 12,
    })
    expect(textAdvice('漢'.repeat(135), 6)).toMatchObject({
      trimUnits: 1,
      totalSegments: 18,
    })
    expect(textAdvice('hello', 0)).toMatchObject({
      trimUnits: 0,
      totalSegments: 0,
    })
  })
})
