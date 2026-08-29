import { describe, expect, it } from 'vitest'
import { STEPS, computeStepStates } from './steps'

const byId = (id: string) => STEPS.find((s) => s.id === id)!

describe('onboarding steps', () => {
  it('contains no password-era email-verification step', () => {
    expect(STEPS.map((step) => step.id)).not.toContain('verify_email')
  })

  it('download_app is done with a device or when skipped', () => {
    const step = byId('download_app')
    expect(step.checkDone({}, { totalDeviceCount: 0 }, null, [])).toBe(false)
    expect(step.checkDone({}, { totalDeviceCount: 1 }, null, [])).toBe(true)
    expect(
      step.checkDone({}, { totalDeviceCount: 0 }, null, ['download_app']),
    ).toBe(true)
  })

  it('api_key / register_device / first_message follow the stats counters', () => {
    expect(
      byId('api_key').checkDone({}, { totalApiKeyCount: 1 }, null, []),
    ).toBe(true)
    expect(
      byId('register_device').checkDone({}, { totalDeviceCount: 1 }, null, []),
    ).toBe(true)
    expect(
      byId('first_message').checkDone({}, { totalSentSMSCount: 1 }, null, []),
    ).toBe(true)
  })

  it('computeStepStates marks a fully-set-up self-hosted user as all done', () => {
    const states = computeStepStates(
      { emailVerifiedAt: '2026-01-01' },
      { totalApiKeyCount: 2, totalDeviceCount: 1, totalSentSMSCount: 10 },
      null,
      [],
    )
    expect(states.every((s) => s.isDone)).toBe(true)
  })

  it('contains no commercial plan-selection step', () => {
    expect(STEPS.map((step) => step.id)).not.toContain('choose_plan')
  })

  it('computeStepStates marks a brand-new user as nothing done', () => {
    const states = computeStepStates({}, {}, null, [])
    expect(states.some((s) => s.isDone)).toBe(false)
  })
})
