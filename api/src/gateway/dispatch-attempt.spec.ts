import { withFreshDispatchAttempt } from './dispatch-attempt'

describe('withFreshDispatchAttempt', () => {
  it('gives each command a short-lived unique attempt identity', () => {
    const result = withFreshDispatchAttempt(
      {
        token: 'secret',
        data: { smsData: JSON.stringify({ smsId: 'sms-1' }) },
      },
      new Date('2026-08-19T12:00:00.000Z'),
      'attempt-1',
    )
    expect(JSON.parse(result.data!.smsData)).toEqual({
      smsId: 'sms-1',
      attemptId: 'attempt-1',
      expiresAt: '1787140920000',
    })
    expect(result.android).toMatchObject({ ttl: 120000, priority: 'high' })
  })
})
