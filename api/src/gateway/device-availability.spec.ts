import { getGatewayAvailability } from './device-availability'

const now = new Date('2026-08-19T12:00:00.000Z')
const ready = {
  enabled: true,
  lastHeartbeat: new Date('2026-08-19T11:45:00.000Z'),
  reliability: {
    modeActive: true,
    smsPermissionGranted: true,
    notificationPermissionGranted: true,
    networkConnected: true,
    backgroundRestricted: false,
    batteryOptimizationRestricted: false,
  },
}

describe('getGatewayAvailability', () => {
  it('reports only a fresh, ready gateway online', () => {
    expect(getGatewayAvailability(ready, now)).toMatchObject({
      status: 'ONLINE',
      available: true,
      reasonCode: 'READY',
    })
  })

  it('does not require a blanket Doze exemption when background work is allowed', () => {
    expect(
      getGatewayAvailability(
        {
          ...ready,
          reliability: {
            ...ready.reliability,
            batteryOptimizationRestricted: true,
            reasonCode: 'BATTERY_OPTIMIZATION_ACTIVE',
          },
        },
        now,
      ),
    ).toMatchObject({ status: 'ONLINE', available: true })
  })

  it('requires attention when Android actually restricts background work', () => {
    expect(
      getGatewayAvailability(
        {
          ...ready,
          reliability: { ...ready.reliability, backgroundRestricted: true },
        },
        now,
      ),
    ).toMatchObject({
      status: 'NEEDS_ATTENTION',
      available: false,
      reasonCode: 'BACKGROUND_RESTRICTED',
    })
  })

  it.each([
    ['DISABLED', { ...ready, enabled: false }],
    [
      'STALE',
      { ...ready, lastHeartbeat: new Date('2026-08-19T11:39:59.000Z') },
    ],
    [
      'OFFLINE',
      { ...ready, lastHeartbeat: new Date('2026-08-19T10:59:59.000Z') },
    ],
    [
      'NEEDS_ATTENTION',
      {
        ...ready,
        reliability: { ...ready.reliability, smsPermissionGranted: false },
      },
    ],
  ])('reports %s without send capacity', (status, device) => {
    expect(getGatewayAvailability(device, now)).toMatchObject({
      status,
      available: false,
    })
  })
})
