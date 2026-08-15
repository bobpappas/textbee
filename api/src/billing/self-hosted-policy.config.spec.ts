import {
  loadSelfHostedPolicy,
  validateSelfHostedEnvironment,
} from './self-hosted-policy.config'
import { smsSegmentCount } from './self-hosted-policy.service'

const valid = {
  TEXTBEE_BILLING_MODE: 'self_hosted',
  TEXTBEE_SMS_POLICY_TIMEZONE: 'America/Boise',
  TEXTBEE_SMS_ACTIVE_DEVICE_LIMIT: '1',
  TEXTBEE_SMS_RECIPIENT_LIMIT: '40',
  TEXTBEE_SMS_SEGMENTS_PER_MINUTE: '10',
  TEXTBEE_SMS_SEGMENTS_PER_DAY: '200',
  TEXTBEE_SMS_SEGMENTS_ROLLING_30_DAYS: '2000',
  TEXTBEE_SMS_COMPLIANCE_SEGMENTS_PER_DAY: '50',
}

describe('self-hosted SMS policy configuration', () => {
  it('loads the explicit deployment policy', () => {
    expect(loadSelfHostedPolicy(valid)).toEqual({
      mode: 'self_hosted',
      timezone: 'America/Boise',
      activeDeviceLimit: 1,
      recipientsPerSend: 40,
      segmentsPerMinute: 10,
      segmentsPerDay: 200,
      segmentsRolling30Days: 2000,
      complianceSegmentsPerDay: 50,
    })
  })

  it('accepts explicit unlimited segment windows without making gateway caps unlimited', () => {
    const policy = loadSelfHostedPolicy({
      ...valid,
      TEXTBEE_SMS_SEGMENTS_PER_MINUTE: '-1',
      TEXTBEE_SMS_SEGMENTS_PER_DAY: '-1',
      TEXTBEE_SMS_SEGMENTS_ROLLING_30_DAYS: '-1',
      TEXTBEE_SMS_COMPLIANCE_SEGMENTS_PER_DAY: '-1',
    })

    expect(policy).toMatchObject({
      activeDeviceLimit: 1,
      recipientsPerSend: 40,
      segmentsPerMinute: -1,
      segmentsPerDay: -1,
      segmentsRolling30Days: -1,
      complianceSegmentsPerDay: -1,
    })
  })

  it.each([
    [{ ...valid, TEXTBEE_BILLING_MODE: '' }],
    [{ ...valid, TEXTBEE_SMS_SEGMENTS_PER_DAY: '0' }],
    [{ ...valid, TEXTBEE_SMS_RECIPIENT_LIMIT: '-1' }],
    [{ ...valid, TEXTBEE_SMS_POLICY_TIMEZONE: 'Not/AZone' }],
  ])('fails startup for missing or invalid policy values', (input) => {
    expect(() => validateSelfHostedEnvironment(input)).toThrow()
  })
})

describe('SMS segment counting', () => {
  it.each([
    ['a'.repeat(160), 1],
    ['a'.repeat(161), 2],
    ['^'.repeat(80), 1],
    ['^'.repeat(81), 2],
    ['界'.repeat(70), 1],
    ['界'.repeat(71), 2],
    ['😀'.repeat(35), 1],
    ['😀'.repeat(36), 2],
  ])('counts carrier segments conservatively', (message, expected) => {
    expect(smsSegmentCount(message)).toBe(expected)
  })
})
