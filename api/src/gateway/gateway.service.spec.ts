import { Test, TestingModule } from '@nestjs/testing'
import { GatewayService } from './gateway.service'
import { getModelToken } from '@nestjs/mongoose'
import { Device } from './schemas/device.schema'
import { DeviceTombstone } from './schemas/device-tombstone.schema'
import { SMS } from './schemas/sms.schema'
import { SMSBatch } from './schemas/sms-batch.schema'
import { AuthService } from '../auth/auth.service'
import { WebhookService } from '../webhook/webhook.service'
import { BillingService } from '../billing/billing.service'
import { SmsQueueService } from './queue/sms-queue.service'
import { ConfigModule } from '@nestjs/config'
import { HttpException, HttpStatus } from '@nestjs/common'
import * as firebaseAdmin from 'firebase-admin'
import { SMSType } from './sms-type.enum'
import { WebhookEvent } from '../webhook/webhook-event.enum'
import {
  RegisterDeviceInputDTO,
  SendBulkSMSInputDTO,
  SendSMSInputDTO,
} from './gateway.dto'
import { User } from '../users/schemas/user.schema'
import { BatchResponse } from 'firebase-admin/messaging'
import { ConsentService } from '../consent/consent.service'
import { SelfHostedPolicyService } from '../billing/self-hosted-policy.service'

// Mock firebase-admin
jest.mock('firebase-admin', () => ({
  messaging: jest.fn().mockReturnValue({
    sendEach: jest.fn(),
  }),
}))

describe('GatewayService', () => {
  let service: GatewayService
  const mockDeviceModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    find: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findByIdAndDelete: jest.fn(),
    create: jest.fn(),
    exec: jest.fn(),
    countDocuments: jest.fn(),
  }

  const mockSmsModel = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn(),
    updateOne: jest.fn(),
    countDocuments: jest.fn(),
  }

  const mockSmsBatchModel = {
    create: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  }

  const mockDeviceTombstoneModel = {
    updateOne: jest.fn(),
  }

  const mockAuthService = {
    getUserApiKeys: jest.fn(),
  }

  const mockWebhookService = {
    deliverNotification: jest.fn(),
  }

  const mockBillingService = {
    canPerformAction: jest.fn(),
    getUserLimits: jest.fn(),
    notifyDeviceLimitReached: jest.fn(),
  }

  const mockSmsQueueService = {
    isQueueEnabled: jest.fn(),
    addSendSmsJob: jest.fn(),
  }

  const mockConsentService = {
    authorizeRecipients: jest.fn(),
    processInbound: jest.fn(),
  }

  const mockSelfHostedPolicy = {
    reserve: jest.fn(),
    consume: jest.fn(),
    release: jest.fn(),
  }

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GatewayService,
        {
          provide: getModelToken(Device.name),
          useValue: mockDeviceModel,
        },
        {
          provide: getModelToken(DeviceTombstone.name),
          useValue: mockDeviceTombstoneModel,
        },
        {
          provide: getModelToken(SMS.name),
          useValue: mockSmsModel,
        },
        {
          provide: getModelToken(SMSBatch.name),
          useValue: mockSmsBatchModel,
        },
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: WebhookService,
          useValue: mockWebhookService,
        },
        {
          provide: BillingService,
          useValue: mockBillingService,
        },
        {
          provide: SmsQueueService,
          useValue: mockSmsQueueService,
        },
        {
          provide: ConsentService,
          useValue: mockConsentService,
        },
        {
          provide: SelfHostedPolicyService,
          useValue: mockSelfHostedPolicy,
        },
      ],
      imports: [ConfigModule],
    }).compile()

    service = module.get<GatewayService>(GatewayService)
    // Reset all mocks
    jest.clearAllMocks()
    mockConsentService.authorizeRecipients.mockImplementation(
      async (_userId, recipients) =>
        recipients.map((recipient) => ({ recipient, eligible: true })),
    )
    mockConsentService.processInbound.mockResolvedValue({ handled: false })
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('previewMessagingEligibility', () => {
    it('returns counts and redacted recipient positions without dispatching', async () => {
      mockDeviceModel.findById.mockResolvedValue({
        _id: 'device123',
        enabled: true,
        user: 'user123',
        lastHeartbeat: new Date(),
        reliability: {
          modeActive: true,
          smsPermissionGranted: true,
          notificationPermissionGranted: true,
          networkConnected: true,
          backgroundRestricted: false,
        },
      })
      mockConsentService.authorizeRecipients.mockResolvedValue([
        { recipient: '+12085550101', eligible: true },
        {
          recipient: '+12085550102',
          eligible: false,
          reason: 'NO_ACTIVE_GROUP_CONSENT',
        },
        {
          recipient: '+12085550103',
          eligible: false,
          reason: 'ORGANIZATION_SUPPRESSION',
        },
      ])

      const result = await service.previewMessagingEligibility('device123', [
        '+12085550101',
        '+12085550102',
        '+12085550103',
      ])

      expect(result).toMatchObject({ total: 3, eligibleCount: 1 })
      expect(result.excludedRecipients.map((item) => item.position)).toEqual([
        2, 3,
      ])
      expect(JSON.stringify(result)).not.toMatch(
        /\+1208555010|NO_ACTIVE_GROUP_CONSENT|ORGANIZATION_SUPPRESSION/,
      )
      expect(mockSmsModel.create).not.toHaveBeenCalled()
      expect(firebaseAdmin.messaging().sendEach).not.toHaveBeenCalled()
    })
  })

  describe('registerDevice', () => {
    const mockUser = {
      _id: 'user123',
      name: 'Test User',
      email: 'test@example.com',
      password: 'password',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as User

    const mockDeviceInput: RegisterDeviceInputDTO = {
      model: 'Pixel 6',
      buildId: 'build123',
      fcmToken: 'token123',
      enabled: true,
    }
    const mockDevice = {
      _id: 'device123',
      ...mockDeviceInput,
      user: mockUser._id,
      // TODO: add more tests for different app version codes
      appVersionCode: 11,
    }

    it('should update device if it already exists', async () => {
      mockDeviceModel.findOne.mockResolvedValue(mockDevice)
      mockDeviceModel.findByIdAndUpdate.mockResolvedValue({
        ...mockDevice,
        fcmToken: 'updatedToken',
      })

      // The implementation internally uses the _id from the found device to update it
      // So we need to avoid the internal call to updateDevice which is failing in the test
      // by mocking the service method directly and restoring it after the test
      const originalUpdateDevice = service.updateDevice
      service.updateDevice = jest.fn().mockResolvedValue({
        ...mockDevice,
        fcmToken: 'updatedToken',
      })

      const result = await service.registerDevice(mockDeviceInput, mockUser)

      expect(mockDeviceModel.findOne).toHaveBeenCalledWith({
        user: mockUser._id,
        model: mockDeviceInput.model,
        buildId: mockDeviceInput.buildId,
      })
      expect(service.updateDevice).toHaveBeenCalledWith(
        mockDevice._id.toString(),
        expect.objectContaining({
          ...mockDeviceInput,
          enabled: true,
          user: mockUser,
          fcmTokenUpdatedAt: expect.any(Date),
          fcmTokenInvalidatedAt: undefined,
          fcmTokenInvalidReason: undefined,
        }),
      )
      expect(result).toBeDefined()

      // Restore the original method
      service.updateDevice = originalUpdateDevice
    })

    it('should create a new device if it does not exist', async () => {
      mockDeviceModel.findOne.mockResolvedValue(null)
      mockDeviceModel.create.mockResolvedValue(mockDevice)

      const result = await service.registerDevice(mockDeviceInput, mockUser)

      expect(mockDeviceModel.findOne).toHaveBeenCalledWith({
        user: mockUser._id,
        model: mockDeviceInput.model,
        buildId: mockDeviceInput.buildId,
      })
      expect(mockDeviceModel.create).toHaveBeenCalledWith({
        ...mockDeviceInput,
        user: mockUser,
        fcmTokenUpdatedAt: expect.any(Date),
        fcmTokenInvalidatedAt: undefined,
        fcmTokenInvalidReason: undefined,
      })
      expect(result).toBeDefined()
    })

    it('should default a new device to enabled when the client omits enabled', async () => {
      // 2.8+ clients register without an `enabled` field; the server must
      // still create the device enabled so it works without a manual toggle.
      const inputWithoutEnabled: RegisterDeviceInputDTO = {
        model: 'Pixel 6',
        buildId: 'build123',
        fcmToken: 'token123',
      }
      mockDeviceModel.findOne.mockResolvedValue(null)
      mockBillingService.getUserLimits.mockResolvedValue({ deviceLimit: -1 })
      mockDeviceModel.create.mockResolvedValue({ _id: 'device123' })

      await service.registerDevice(inputWithoutEnabled, mockUser)

      expect(mockDeviceModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ enabled: true }),
      )
    })

    it('should block registration when the device limit is already reached', async () => {
      mockDeviceModel.findOne.mockResolvedValue(null)
      mockBillingService.getUserLimits.mockResolvedValue({ deviceLimit: 1 })
      mockBillingService.notifyDeviceLimitReached.mockResolvedValue(undefined)
      mockDeviceModel.countDocuments.mockResolvedValue(1)

      await expect(
        service.registerDevice(mockDeviceInput, mockUser),
      ).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS })
      expect(mockDeviceModel.create).not.toHaveBeenCalled()
    })
  })

  describe('claimSMSDispatch', () => {
    it('atomically advances a fresh pending command to dispatched', async () => {
      mockSmsModel.findOneAndUpdate.mockResolvedValue({ _id: 'sms123' })
      const expiresAt = String(Date.now() + 60_000)

      await expect(
        service.claimSMSDispatch('device123', 'sms123', {
          attemptId: 'attempt-1',
          expiresAt,
        }),
      ).resolves.toEqual({ success: true })

      expect(mockSmsModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: 'sms123', device: 'device123', status: 'pending' },
        expect.objectContaining({
          $set: expect.objectContaining({
            status: 'dispatched',
            'metadata.dispatchAttemptId': 'attempt-1',
          }),
        }),
        { new: true },
      )
    })

    it('rejects an expired command without changing SMS state', async () => {
      await expect(
        service.claimSMSDispatch('device123', 'sms123', {
          attemptId: 'attempt-1',
          expiresAt: String(Date.now() - 1),
        }),
      ).rejects.toMatchObject({ status: HttpStatus.CONFLICT })
      expect(mockSmsModel.findOneAndUpdate).not.toHaveBeenCalled()
    })
  })

  describe('getDevicesForUser', () => {
    const mockUser = {
      _id: 'user123',
      name: 'Test User',
      email: 'test@example.com',
      password: 'password',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as User

    const mockDevices = [
      { _id: 'device1', model: 'Pixel 6' },
      { _id: 'device2', model: 'iPhone 13' },
    ]

    it("should return a user's devices without the push token or serial", async () => {
      mockDeviceModel.find.mockResolvedValue(mockDevices)

      const result = await service.getDevicesForUser(mockUser)

      const [filter, projection] = mockDeviceModel.find.mock.calls[0]
      expect(filter).toEqual({ user: mockUser._id })
      // fcmToken is a push credential and serial is a hardware id; neither
      // should be shipped to the browser in the device list.
      expect(projection).toContain('-fcmToken')
      expect(projection).toContain('-serial')
      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({
        ...mockDevices[0],
        availability: { status: 'DISABLED', available: false },
      })
    })
  })

  describe('getDeviceById', () => {
    const mockDevice = { _id: 'device123', model: 'Pixel 6' }

    it('should return device by id', async () => {
      mockDeviceModel.findById.mockResolvedValue(mockDevice)

      const result = await service.getDeviceById('device123')

      expect(mockDeviceModel.findById).toHaveBeenCalledWith('device123')
      expect(result).toEqual(mockDevice)
    })
  })

  describe('updateDevice', () => {
    const mockDeviceId = 'device123'
    const mockDeviceInput: RegisterDeviceInputDTO = {
      model: 'Pixel 6',
      buildId: 'build123',
      fcmToken: 'updatedToken',
      enabled: true,
    }
    const mockDevice = {
      _id: mockDeviceId,
      ...mockDeviceInput,
    }

    it('should update device if it exists', async () => {
      mockDeviceModel.findById.mockResolvedValue(mockDevice)
      mockDeviceModel.findByIdAndUpdate.mockResolvedValue({
        ...mockDevice,
        fcmToken: 'updatedToken',
      })

      const result = await service.updateDevice(mockDeviceId, mockDeviceInput)

      expect(mockDeviceModel.findById).toHaveBeenCalledWith(mockDeviceId)
      expect(mockDeviceModel.findByIdAndUpdate).toHaveBeenCalledWith(
        mockDeviceId,
        { $set: mockDeviceInput },
        { new: true },
      )
      expect(result).toBeDefined()
    })

    it('should throw an error if device does not exist', async () => {
      mockDeviceModel.findById.mockResolvedValue(null)

      await expect(
        service.updateDevice(mockDeviceId, mockDeviceInput),
      ).rejects.toThrow(HttpException)
      expect(mockDeviceModel.findById).toHaveBeenCalledWith(mockDeviceId)
      expect(mockDeviceModel.findByIdAndUpdate).not.toHaveBeenCalled()
    })
  })

  describe('deleteDevice', () => {
    const mockDeviceId = '507f1f77bcf86cd799439011'
    const mockDevice = { _id: mockDeviceId, model: 'Pixel 6' }

    it('should tombstone and delete when device exists', async () => {
      mockDeviceModel.findById.mockResolvedValue(mockDevice)

      const result = await service.deleteDevice(mockDeviceId)

      expect(mockDeviceModel.findById).toHaveBeenCalledWith(mockDeviceId)
      expect(mockDeviceTombstoneModel.updateOne).toHaveBeenCalled()
      expect(mockDeviceModel.findByIdAndDelete).toHaveBeenCalledWith(
        mockDeviceId,
      )
      expect(result).toEqual({ success: true })
    })

    it('should throw an error if device does not exist', async () => {
      mockDeviceModel.findById.mockResolvedValue(null)

      await expect(service.deleteDevice(mockDeviceId)).rejects.toThrow(
        HttpException,
      )
      expect(mockDeviceModel.findById).toHaveBeenCalledWith(mockDeviceId)
    })
  })

  describe('sendSMS', () => {
    const mockDeviceId = 'device123'
    const mockDevice = {
      _id: mockDeviceId,
      enabled: true,
      fcmToken: 'fcm-token',
      user: 'user123',
      lastHeartbeat: new Date(),
      reliability: {
        modeActive: true,
        smsPermissionGranted: true,
        notificationPermissionGranted: true,
        networkConnected: true,
        backgroundRestricted: false,
      },
    }
    const mockSmsInput: SendSMSInputDTO = {
      message: 'Hello there',
      recipients: ['+123456789'],
      smsBody: 'Hello there',
      receivers: ['+123456789'],
    }
    const mockSms = {
      _id: 'sms123',
      device: mockDeviceId,
      message: mockSmsInput.message,
      type: SMSType.SENT,
      recipient: mockSmsInput.recipients[0],
      status: 'pending',
    }
    const mockSmsBatch = {
      _id: 'batch123',
      device: mockDeviceId,
      message: mockSmsInput.message,
      recipientCount: 1,
      status: 'pending',
    }
    const mockFcmResponse: BatchResponse = {
      successCount: 1,
      failureCount: 0,
      responses: [],
    }

    beforeEach(() => {
      mockDeviceModel.findById.mockResolvedValue(mockDevice)
      mockSmsBatchModel.create.mockResolvedValue(mockSmsBatch)
      mockSmsModel.create.mockResolvedValue(mockSms)
      mockDeviceModel.findByIdAndUpdate.mockImplementation(() => ({
        exec: jest.fn().mockResolvedValue(true),
      }))
      mockSmsBatchModel.findByIdAndUpdate.mockImplementation(() => ({
        exec: jest.fn().mockResolvedValue(true),
      }))
      mockBillingService.canPerformAction.mockResolvedValue(true)
      mockSmsQueueService.isQueueEnabled.mockReturnValue(false)

      // Fix the mock
      jest
        .spyOn(firebaseAdmin.messaging(), 'sendEach')
        .mockResolvedValue(mockFcmResponse)
    })

    it('should send SMS successfully', async () => {
      const result = await service.sendSMS(mockDeviceId, mockSmsInput)

      expect(mockDeviceModel.findById).toHaveBeenCalledWith(mockDeviceId)
      expect(mockBillingService.canPerformAction).toHaveBeenCalledWith(
        mockDevice.user.toString(),
        'send_sms',
        mockSmsInput.recipients.length,
      )
      expect(mockSmsBatchModel.create).toHaveBeenCalled()
      expect(mockSmsModel.create).toHaveBeenCalled()
      expect(firebaseAdmin.messaging().sendEach).toHaveBeenCalled()
      expect(result).toEqual(mockFcmResponse)
    })

    it('rejects an all-ineligible audience with actionable redacted details', async () => {
      mockConsentService.authorizeRecipients.mockResolvedValue([
        {
          recipient: '+12085550101',
          eligible: false,
          reason: 'NO_ACTIVE_GROUP_CONSENT',
        },
      ])

      let response: unknown
      try {
        await service.sendSMS(mockDeviceId, {
          ...mockSmsInput,
          recipients: ['+12085550101'],
        })
      } catch (error) {
        response = (error as HttpException).getResponse()
      }

      expect(response).toMatchObject({
        code: 'MESSAGING_INELIGIBLE',
        message: expect.stringContaining('no active group consent'),
        exclusionSummary: { total: 1 },
      })
      expect(JSON.stringify(response)).not.toMatch(
        /\+12085550101|NO_ACTIVE_GROUP_CONSENT/,
      )
      expect(firebaseAdmin.messaging().sendEach).not.toHaveBeenCalled()
    })

    it('preserves the partial-send contract with privacy-safe exclusions', async () => {
      mockConsentService.authorizeRecipients.mockImplementation(
        async (_userId, recipients) =>
          recipients.map((recipient) =>
            recipient === '+12085550102'
              ? {
                  recipient,
                  eligible: false,
                  reason: 'ORGANIZATION_SUPPRESSION',
                }
              : { recipient, eligible: true },
          ),
      )

      const result = await service.sendSMS(mockDeviceId, {
        ...mockSmsInput,
        recipients: ['+12085550101', '+12085550102'],
      })

      expect(result).toMatchObject({
        successCount: 1,
        exclusionSummary: { total: 1 },
        excludedRecipients: [
          {
            position: 2,
            recipient: 'Recipient ending in 0102',
            code: 'opted-out',
          },
        ],
      })
      expect(JSON.stringify(result)).not.toMatch(
        /\+12085550102|ORGANIZATION_SUPPRESSION/,
      )
    })

    it('explains when eligibility changes before immediate dispatch', async () => {
      mockConsentService.authorizeRecipients
        .mockResolvedValueOnce([
          { recipient: mockSmsInput.recipients[0], eligible: true },
        ])
        .mockResolvedValueOnce([
          {
            recipient: mockSmsInput.recipients[0],
            eligible: false,
            reason: 'ORGANIZATION_SUPPRESSION',
          },
        ])

      let response: unknown
      try {
        await service.sendSMS(mockDeviceId, mockSmsInput)
      } catch (error) {
        response = (error as HttpException).getResponse()
      }

      expect(response).toMatchObject({
        code: 'MESSAGING_ELIGIBILITY_CHANGED',
        message: expect.stringContaining('no message was sent'),
      })
      expect(mockSelfHostedPolicy.consume).not.toHaveBeenCalled()
    })

    it('reserves and consumes gateway segment capacity in self-hosted mode', async () => {
      const priorMode = process.env.TEXTBEE_BILLING_MODE
      process.env.TEXTBEE_BILLING_MODE = 'self_hosted'
      mockSelfHostedPolicy.reserve.mockResolvedValue({
        reservationId: 'reservation-1',
        segments: 1,
        kind: 'ORDINARY',
      })

      try {
        await service.sendSMS(mockDeviceId, mockSmsInput)
      } finally {
        if (priorMode === undefined) delete process.env.TEXTBEE_BILLING_MODE
        else process.env.TEXTBEE_BILLING_MODE = priorMode
      }

      expect(mockSelfHostedPolicy.reserve).toHaveBeenCalledWith({
        deviceId: mockDevice._id,
        kind: 'ORDINARY',
        messages: [{ message: 'Hello there', recipientCount: 1 }],
      })
      expect(mockSelfHostedPolicy.consume).toHaveBeenCalledWith(
        mockDevice._id,
        'reservation-1',
        'ORDINARY',
      )
    })

    it('should throw error if device is not enabled', async () => {
      mockDeviceModel.findById.mockResolvedValue({
        ...mockDevice,
        enabled: false,
      })

      await expect(service.sendSMS(mockDeviceId, mockSmsInput)).rejects.toThrow(
        HttpException,
      )
      expect(mockDeviceModel.findById).toHaveBeenCalledWith(mockDeviceId)
      expect(mockBillingService.canPerformAction).not.toHaveBeenCalled()
    })

    it('should throw error if message is blank', async () => {
      await expect(
        service.sendSMS(mockDeviceId, {
          ...mockSmsInput,
          message: '',
          smsBody: '',
        }),
      ).rejects.toThrow(HttpException)
    })

    it('should throw error if recipients are invalid', async () => {
      await expect(
        service.sendSMS(mockDeviceId, { ...mockSmsInput, recipients: [] }),
      ).rejects.toThrow(HttpException)
    })

    it('should queue SMS if queue is enabled', async () => {
      mockSmsQueueService.isQueueEnabled.mockReturnValue(true)
      mockSmsQueueService.addSendSmsJob.mockResolvedValue(true)

      const result = await service.sendSMS(mockDeviceId, mockSmsInput)

      expect(mockSmsQueueService.isQueueEnabled).toHaveBeenCalled()
      expect(mockSmsQueueService.addSendSmsJob).toHaveBeenCalled()
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('smsBatchId', mockSmsBatch._id)
    })

    it('should handle queue error properly', async () => {
      mockSmsQueueService.isQueueEnabled.mockReturnValue(true)
      mockSmsQueueService.addSendSmsJob.mockRejectedValue(
        new Error('Queue error'),
      )

      await expect(service.sendSMS(mockDeviceId, mockSmsInput)).rejects.toThrow(
        HttpException,
      )

      expect(mockSmsBatchModel.findByIdAndUpdate).toHaveBeenCalled()
      expect(mockSmsModel.updateMany).toHaveBeenCalled()
    })
  })

  describe('sendBulkSMS', () => {
    const mockDeviceId = 'device123'
    const mockDevice = {
      _id: mockDeviceId,
      enabled: true,
      fcmToken: 'fcm-token',
      user: 'user123',
      lastHeartbeat: new Date(),
      reliability: {
        modeActive: true,
        smsPermissionGranted: true,
        notificationPermissionGranted: true,
        networkConnected: true,
        backgroundRestricted: false,
      },
    }
    const mockBulkSmsInput: SendBulkSMSInputDTO = {
      messageTemplate: 'Hello {name}',
      messages: [
        {
          message: 'Hello John',
          recipients: ['+123456789'],
          smsBody: 'Hello John',
          receivers: ['+123456789'],
        },
        {
          message: 'Hello Jane',
          recipients: ['+987654321'],
          smsBody: 'Hello Jane',
          receivers: ['+987654321'],
        },
      ],
    }
    const mockSmsBatch = {
      _id: 'batch123',
      device: mockDeviceId,
      message: mockBulkSmsInput.messageTemplate,
      recipientCount: 2,
      status: 'pending',
    }
    const mockSms = {
      _id: 'sms123',
      device: mockDeviceId,
      message: 'Hello John',
      type: SMSType.SENT,
      recipient: '+123456789',
      status: 'pending',
    }
    const mockFcmResponse: BatchResponse = {
      successCount: 1,
      failureCount: 0,
      responses: [],
    }

    beforeEach(() => {
      mockDeviceModel.findById.mockResolvedValue(mockDevice)
      mockSmsBatchModel.create.mockResolvedValue(mockSmsBatch)
      mockSmsModel.create.mockResolvedValue(mockSms)
      mockDeviceModel.findByIdAndUpdate.mockImplementation(() => ({
        exec: jest.fn().mockResolvedValue(true),
      }))
      mockSmsBatchModel.findByIdAndUpdate.mockImplementation(() => ({
        exec: jest.fn().mockResolvedValue(true),
      }))
      mockBillingService.canPerformAction.mockResolvedValue(true)
      mockSmsQueueService.isQueueEnabled.mockReturnValue(false)

      // Fix the mock
      jest
        .spyOn(firebaseAdmin.messaging(), 'sendEach')
        .mockResolvedValue(mockFcmResponse)
    })

    it('should send bulk SMS successfully', async () => {
      const result = await service.sendBulkSMS(mockDeviceId, mockBulkSmsInput)

      expect(mockDeviceModel.findById).toHaveBeenCalledWith(mockDeviceId)
      expect(mockBillingService.canPerformAction).toHaveBeenCalledWith(
        mockDevice.user.toString(),
        'bulk_send_sms',
        2,
      )
      expect(mockSmsBatchModel.create).toHaveBeenCalled()
      expect(mockSmsModel.create).toHaveBeenCalled()
      expect(firebaseAdmin.messaging().sendEach).toHaveBeenCalled()
      expect(result).toHaveProperty('success', true)
    })

    it('should queue bulk SMS if queue is enabled', async () => {
      mockSmsQueueService.isQueueEnabled.mockReturnValue(true)
      mockSmsQueueService.addSendSmsJob.mockResolvedValue(true)

      const result = await service.sendBulkSMS(mockDeviceId, mockBulkSmsInput)

      expect(mockSmsQueueService.isQueueEnabled).toHaveBeenCalled()
      expect(mockSmsQueueService.addSendSmsJob).toHaveBeenCalled()
      expect(result).toHaveProperty('success', true)
      expect(result).toHaveProperty('smsBatchId', mockSmsBatch._id)
    })
  })

  describe('receiveSMS', () => {
    const mockDeviceId = 'device123'
    const mockDevice = {
      _id: mockDeviceId,
      user: 'user123',
    }
    const mockReceivedSmsData = {
      message: 'Hello from test',
      sender: '+123456789',
      receivedAt: new Date(),
    }
    const mockSms = {
      _id: 'sms123',
      ...mockReceivedSmsData,
      device: mockDeviceId,
      type: SMSType.RECEIVED,
    }

    beforeEach(() => {
      mockDeviceModel.findById.mockResolvedValue(mockDevice)
      mockSmsModel.findOne.mockResolvedValue(null)
      mockSmsModel.create.mockResolvedValue(mockSms)
      mockDeviceModel.findByIdAndUpdate.mockImplementation(() => ({
        exec: jest.fn().mockResolvedValue(true),
      }))
      mockBillingService.canPerformAction.mockResolvedValue(true)
      mockWebhookService.deliverNotification.mockResolvedValue(true)
    })

    it('should receive SMS successfully', async () => {
      const result = await service.receiveSMS(mockDeviceId, mockReceivedSmsData)

      expect(mockDeviceModel.findById).toHaveBeenCalledWith(mockDeviceId)
      expect(mockBillingService.canPerformAction).toHaveBeenCalledWith(
        mockDevice.user.toString(),
        'receive_sms',
        1,
      )
      expect(mockSmsModel.create).toHaveBeenCalled()
      expect(mockDeviceModel.findByIdAndUpdate).toHaveBeenCalled()
      expect(mockWebhookService.deliverNotification).toHaveBeenCalledWith({
        sms: mockSms,
        user: mockDevice.user,
        event: WebhookEvent.MESSAGE_RECEIVED,
      })
      expect(result).toEqual(mockSms)
    })

    it('should throw error if device does not exist', async () => {
      mockDeviceModel.findById.mockResolvedValue(null)

      await expect(
        service.receiveSMS(mockDeviceId, mockReceivedSmsData),
      ).rejects.toThrow(HttpException)
    })

    it('should throw error if SMS data is invalid', async () => {
      await expect(
        service.receiveSMS(mockDeviceId, {
          ...mockReceivedSmsData,
          message: '',
        }),
      ).rejects.toThrow(HttpException)
    })
  })

  describe('getReceivedSMS', () => {
    const mockDeviceId = 'device123'
    const mockDevice = {
      _id: mockDeviceId,
    }
    const mockSmsData = [
      {
        _id: 'sms1',
        message: 'Hello 1',
        type: SMSType.RECEIVED,
        sender: '+123456789',
        receivedAt: new Date(),
      },
      {
        _id: 'sms2',
        message: 'Hello 2',
        type: SMSType.RECEIVED,
        sender: '+987654321',
        receivedAt: new Date(),
      },
    ]

    beforeEach(() => {
      mockDeviceModel.findById.mockResolvedValue(mockDevice)
      mockSmsModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockSmsData),
        }),
      })
      mockSmsModel.countDocuments.mockResolvedValue(2)
    })

    it('should get received SMS with pagination', async () => {
      const result = await service.getReceivedSMS(mockDeviceId, 1, 10)

      expect(mockDeviceModel.findById).toHaveBeenCalledWith(mockDeviceId)
      expect(mockSmsModel.countDocuments).toHaveBeenCalledWith({
        device: mockDevice._id,
        type: SMSType.RECEIVED,
      })
      expect(mockSmsModel.find).toHaveBeenCalledWith(
        {
          device: mockDevice._id,
          type: SMSType.RECEIVED,
        },
        null,
        {
          sort: { receivedAt: -1 },
          limit: 10,
          skip: 0,
        },
      )
      expect(result).toHaveProperty('data', mockSmsData)
      expect(result).toHaveProperty('meta')
      expect(result.meta).toHaveProperty('total', 2)
    })

    it('should throw error if device does not exist', async () => {
      mockDeviceModel.findById.mockResolvedValue(null)

      await expect(service.getReceivedSMS(mockDeviceId)).rejects.toThrow(
        HttpException,
      )
    })
  })

  describe('getMessages', () => {
    const mockDeviceId = 'device123'
    const mockDevice = {
      _id: mockDeviceId,
    }
    const mockSmsData = [
      {
        _id: 'sms1',
        message: 'Hello 1',
        type: SMSType.SENT,
        recipient: '+123456789',
        createdAt: new Date(),
      },
      {
        _id: 'sms2',
        message: 'Hello 2',
        type: SMSType.RECEIVED,
        sender: '+987654321',
        createdAt: new Date(),
      },
    ]

    beforeEach(() => {
      mockDeviceModel.findById.mockResolvedValue(mockDevice)
      mockSmsModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(mockSmsData),
        }),
      })
      mockSmsModel.countDocuments.mockResolvedValue(2)
    })

    it('should get all messages with pagination', async () => {
      const result = await service.getMessages(mockDeviceId, '', 1, 10)

      expect(mockDeviceModel.findById).toHaveBeenCalledWith(mockDeviceId)
      expect(mockSmsModel.countDocuments).toHaveBeenCalledWith({
        device: mockDevice._id,
      })
      expect(mockSmsModel.find).toHaveBeenCalledWith(
        {
          device: mockDevice._id,
        },
        null,
        {
          sort: { createdAt: -1 },
          limit: 10,
          skip: 0,
        },
      )
      expect(result).toHaveProperty('data', mockSmsData)
      expect(result).toHaveProperty('meta')
      expect(result.meta).toHaveProperty('total', 2)
    })

    it('should get sent messages with pagination', async () => {
      await service.getMessages(mockDeviceId, 'sent', 1, 10)

      expect(mockSmsModel.countDocuments).toHaveBeenCalledWith({
        device: mockDevice._id,
        type: SMSType.SENT,
      })
      expect(mockSmsModel.find).toHaveBeenCalledWith(
        {
          device: mockDevice._id,
          type: SMSType.SENT,
        },
        null,
        expect.any(Object),
      )
    })

    it('should get received messages with pagination', async () => {
      await service.getMessages(mockDeviceId, 'received', 1, 10)

      expect(mockSmsModel.countDocuments).toHaveBeenCalledWith({
        device: mockDevice._id,
        type: SMSType.RECEIVED,
      })
      expect(mockSmsModel.find).toHaveBeenCalledWith(
        {
          device: mockDevice._id,
          type: SMSType.RECEIVED,
        },
        null,
        expect.any(Object),
      )
    })

    it('should throw error if device does not exist', async () => {
      mockDeviceModel.findById.mockResolvedValue(null)

      await expect(service.getMessages(mockDeviceId)).rejects.toThrow(
        HttpException,
      )
    })

    it('should search across message body, recipient and sender', async () => {
      await service.getMessages(mockDeviceId, '', 1, 10, 'alice')

      const expectedQuery = {
        device: mockDevice._id,
        $or: [
          { message: /alice/i },
          { recipient: /alice/i },
          { sender: /alice/i },
        ],
      }

      expect(mockSmsModel.countDocuments).toHaveBeenCalledWith(expectedQuery)
      expect(mockSmsModel.find).toHaveBeenCalledWith(
        expectedQuery,
        null,
        expect.any(Object),
      )
    })

    it('should combine search with the type filter', async () => {
      await service.getMessages(mockDeviceId, 'sent', 1, 10, 'alice')

      expect(mockSmsModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          device: mockDevice._id,
          type: SMSType.SENT,
          $or: expect.any(Array),
        }),
        null,
        expect.any(Object),
      )
    })

    it('should ignore an empty or whitespace-only search', async () => {
      await service.getMessages(mockDeviceId, '', 1, 10, '   ')

      expect(mockSmsModel.find).toHaveBeenCalledWith(
        { device: mockDevice._id },
        null,
        expect.any(Object),
      )
    })

    it('should escape regex metacharacters in the search term', async () => {
      // Unescaped, this throws a SyntaxError and fails the request.
      await expect(
        service.getMessages(mockDeviceId, '', 1, 10, '('),
      ).resolves.toBeDefined()

      // A wildcard must be matched literally, not treated as "any character".
      await service.getMessages(mockDeviceId, '', 1, 10, '.*')

      const call = mockSmsModel.find.mock.calls.at(-1)
      const messagePattern = call[0].$or[0].message as RegExp
      expect(messagePattern.test('anything at all')).toBe(false)
      expect(messagePattern.test('contains .* literally')).toBe(true)
    })
  })

  describe('getStatsForUser', () => {
    const mockUser = {
      _id: 'user123',
      name: 'Test User',
      email: 'test@example.com',
      password: 'password',
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as User

    const mockDevices = [
      {
        _id: 'device1',
        sentSMSCount: 10,
        receivedSMSCount: 5,
      },
      {
        _id: 'device2',
        sentSMSCount: 20,
        receivedSMSCount: 15,
      },
    ]
    const mockApiKeys = [
      { _id: 'key1', name: 'API Key 1' },
      { _id: 'key2', name: 'API Key 2' },
    ]

    beforeEach(() => {
      mockDeviceModel.find.mockResolvedValue(mockDevices)
      mockAuthService.getUserApiKeys.mockResolvedValue(mockApiKeys)
    })

    it('should return stats for user', async () => {
      const result = await service.getStatsForUser(mockUser)

      expect(mockDeviceModel.find).toHaveBeenCalledWith({ user: mockUser._id })
      expect(mockAuthService.getUserApiKeys).toHaveBeenCalledWith(mockUser)
      expect(result).toEqual({
        totalSentSMSCount: 30,
        totalReceivedSMSCount: 20,
        totalDeviceCount: 2,
        totalApiKeyCount: 2,
      })
    })
  })
})
