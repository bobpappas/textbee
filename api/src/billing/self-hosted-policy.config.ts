export type SelfHostedPolicy = {
  mode: 'self_hosted'
  timezone: string
  activeDeviceLimit: number
  recipientsPerSend: number
  segmentsPerMinute: number
  segmentsPerDay: number
  segmentsRolling30Days: number
  complianceSegmentsPerDay: number
}

const requiredPositiveInteger = (
  env: NodeJS.ProcessEnv,
  name: string,
  allowUnlimited = false,
) => {
  const raw = env[name]
  const value = Number(raw)
  if (
    raw == null ||
    raw.trim() === '' ||
    !Number.isInteger(value) ||
    (value <= 0 && !(allowUnlimited && value === -1))
  )
    throw new Error(
      `${name} must be ${allowUnlimited ? '-1 or ' : ''}a positive integer`,
    )
  return value
}

export function loadSelfHostedPolicy(
  env: NodeJS.ProcessEnv = process.env,
): SelfHostedPolicy {
  if (env.TEXTBEE_BILLING_MODE !== 'self_hosted')
    throw new Error('TEXTBEE_BILLING_MODE must be self_hosted')
  const timezone = env.TEXTBEE_SMS_POLICY_TIMEZONE
  if (!timezone) throw new Error('TEXTBEE_SMS_POLICY_TIMEZONE is required')
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format()
  } catch {
    throw new Error('TEXTBEE_SMS_POLICY_TIMEZONE must be a valid IANA timezone')
  }
  return {
    mode: 'self_hosted',
    timezone,
    activeDeviceLimit: requiredPositiveInteger(
      env,
      'TEXTBEE_SMS_ACTIVE_DEVICE_LIMIT',
    ),
    recipientsPerSend: requiredPositiveInteger(
      env,
      'TEXTBEE_SMS_RECIPIENT_LIMIT',
    ),
    segmentsPerMinute: requiredPositiveInteger(
      env,
      'TEXTBEE_SMS_SEGMENTS_PER_MINUTE',
      true,
    ),
    segmentsPerDay: requiredPositiveInteger(
      env,
      'TEXTBEE_SMS_SEGMENTS_PER_DAY',
      true,
    ),
    segmentsRolling30Days: requiredPositiveInteger(
      env,
      'TEXTBEE_SMS_SEGMENTS_ROLLING_30_DAYS',
      true,
    ),
    complianceSegmentsPerDay: requiredPositiveInteger(
      env,
      'TEXTBEE_SMS_COMPLIANCE_SEGMENTS_PER_DAY',
      true,
    ),
  }
}

export const validateSelfHostedEnvironment = (env: Record<string, unknown>) => {
  loadSelfHostedPolicy(env as NodeJS.ProcessEnv)
  return env
}
