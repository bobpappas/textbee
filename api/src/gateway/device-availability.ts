export const GATEWAY_STALE_AFTER_MS = 20 * 60 * 1000
export const GATEWAY_OFFLINE_AFTER_MS = 60 * 60 * 1000

export type GatewayAvailabilityStatus =
  | 'ONLINE'
  | 'STALE'
  | 'NEEDS_ATTENTION'
  | 'OFFLINE'
  | 'DISABLED'

export interface GatewayAvailabilityInput {
  enabled?: boolean
  lastHeartbeat?: Date | string | null
  fcmTokenInvalidatedAt?: Date | string | null
  reliability?: {
    modeActive?: boolean
    smsPermissionGranted?: boolean
    notificationPermissionGranted?: boolean
    networkConnected?: boolean
    backgroundRestricted?: boolean
    batteryOptimizationRestricted?: boolean
    reasonCode?: string
  } | null
}

export interface GatewayAvailability {
  status: GatewayAvailabilityStatus
  available: boolean
  reasonCode: string
  nextAction: string
}

const attention = (
  reasonCode: string,
  nextAction: string,
): GatewayAvailability => ({
  status: 'NEEDS_ATTENTION',
  available: false,
  reasonCode,
  nextAction,
})

export function getGatewayAvailability(
  device: GatewayAvailabilityInput,
  now = new Date(),
): GatewayAvailability {
  if (!device.enabled)
    return {
      status: 'DISABLED',
      available: false,
      reasonCode: 'GATEWAY_DISABLED',
      nextAction: 'Enable this gateway to send messages.',
    }

  if (device.fcmTokenInvalidatedAt)
    return attention(
      'PUSH_TOKEN_INVALID',
      'Open the TextBee app to reconnect push messaging.',
    )

  if (!device.lastHeartbeat)
    return attention(
      'HEARTBEAT_MISSING',
      'Open the TextBee app and finish gateway setup.',
    )

  const heartbeatAt = new Date(device.lastHeartbeat).getTime()
  const ageMs = now.getTime() - heartbeatAt
  if (!Number.isFinite(heartbeatAt) || ageMs > GATEWAY_OFFLINE_AFTER_MS)
    return {
      status: 'OFFLINE',
      available: false,
      reasonCode: 'HEARTBEAT_OFFLINE',
      nextAction:
        'Open the TextBee app and check the phone network connection.',
    }
  if (ageMs > GATEWAY_STALE_AFTER_MS)
    return {
      status: 'STALE',
      available: false,
      reasonCode: 'HEARTBEAT_STALE',
      nextAction: 'Open the TextBee app to restore background reliability.',
    }

  const reliability = device.reliability
  if (!reliability)
    return attention(
      'RELIABILITY_NOT_REPORTED',
      'Update and open the TextBee app to verify gateway readiness.',
    )
  if (!reliability.smsPermissionGranted)
    return attention(
      'SMS_PERMISSION_MISSING',
      'Allow SMS permission in Android settings.',
    )
  if (!reliability.notificationPermissionGranted)
    return attention(
      'NOTIFICATION_PERMISSION_MISSING',
      'Allow notifications so Android can keep the gateway active.',
    )
  if (!reliability.modeActive)
    return attention(
      'RELIABILITY_SERVICE_INACTIVE',
      'Open the TextBee app to restart Reliability Mode.',
    )
  if (reliability.backgroundRestricted)
    return attention(
      'BACKGROUND_RESTRICTED',
      'Allow background usage for TextBee in Android app settings.',
    )
  if (!reliability.networkConnected)
    return attention(
      'NETWORK_UNAVAILABLE',
      'Connect the gateway phone to the internet.',
    )
  if (
    reliability.reasonCode &&
    reliability.reasonCode !== 'BATTERY_OPTIMIZATION_ACTIVE'
  )
    return attention(
      reliability.reasonCode,
      'Open the TextBee app and review Gateway Readiness.',
    )

  return {
    status: 'ONLINE',
    available: true,
    reasonCode: 'READY',
    nextAction: 'No action needed.',
  }
}
