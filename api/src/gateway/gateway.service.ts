import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Device, DeviceDocument } from './schemas/device.schema'
import { Model, Types } from 'mongoose'
import * as firebaseAdmin from 'firebase-admin'
import {
  DeviceTombstone,
  DeviceTombstoneDocument,
} from './schemas/device-tombstone.schema'
import {
  ReceivedSMSDTO,
  RegisterDeviceInputDTO,
  SendBulkSMSInputDTO,
  SendSMSInputDTO,
  UpdateSMSStatusDTO,
  HeartbeatInputDTO,
  HeartbeatResponseDTO,
} from './gateway.dto'
import { User } from '../users/schemas/user.schema'
import { AuthService } from '../auth/auth.service'
import { SMS } from './schemas/sms.schema'
import { SMSType } from './sms-type.enum'
import { SMSBatch } from './schemas/sms-batch.schema'
import { BatchResponse, Message } from 'firebase-admin/messaging'
import { WebhookEvent } from '../webhook/webhook-event.enum'
import { WebhookService } from '../webhook/webhook.service'
import { BillingService } from '../billing/billing.service'
import { SmsQueueService } from './queue/sms-queue.service'
import { escapeRegExp } from '../common/escape-regexp'
import { ConsentService } from '../consent/consent.service'
import { DispatchPolicyContext } from '../consent/consent.enums'
import {
  SafetyKind,
  SelfHostedPolicyService,
} from '../billing/self-hosted-policy.service'
import {
  buildMessagingEligibilityDetails,
  ELIGIBILITY_CHANGED_MESSAGE,
  MessagingExclusionInput,
} from './messaging-eligibility'

@Injectable()
export class GatewayService {
  constructor(
    @InjectModel(Device.name) private deviceModel: Model<DeviceDocument>,
    @InjectModel(DeviceTombstone.name)
    private deviceTombstoneModel: Model<DeviceTombstoneDocument>,
    @InjectModel(SMS.name) private smsModel: Model<SMS>,
    @InjectModel(SMSBatch.name) private smsBatchModel: Model<SMSBatch>,
    private authService: AuthService,
    private webhookService: WebhookService,
    private billingService: BillingService,
    private smsQueueService: SmsQueueService,
    private consentService: ConsentService,
    private selfHostedPolicy: SelfHostedPolicyService,
  ) {}

  async previewMessagingEligibility(deviceId: string, recipients: string[]) {
    const device = await this.deviceModel.findById(deviceId)
    if (!device?.enabled)
      throw new HttpException(
        { error: 'Device does not exist or is not enabled' },
        HttpStatus.BAD_REQUEST,
      )
    if (!Array.isArray(recipients) || recipients.length === 0)
      throw new HttpException(
        { error: 'At least one recipient is required' },
        HttpStatus.BAD_REQUEST,
      )

    const decisions = await this.consentService.authorizeRecipients(
      device.user.toString(),
      recipients,
      { kind: 'ORDINARY' },
    )
    const excluded = decisions
      .map((item, index) => ({ item, position: index + 1 }))
      .filter(({ item }) => !item.eligible)
      .map(({ item, position }) => ({
        recipient: item.recipient,
        reason: item.reason,
        position,
      }))
    const details = buildMessagingEligibilityDetails(excluded)
    return {
      total: decisions.length,
      eligibleCount: decisions.filter((item) => item.eligible).length,
      excludedRecipients: details.excludedRecipients,
      exclusionSummary: details.exclusionSummary,
    }
  }

  // Blocks creating or re-enabling a device when the user's plan device limit
  // is reached. Effective limit comes from the subscription override or the
  // plan (deviceLimit of -1 or missing means unlimited). Only enabled devices
  // count toward the limit. Fails open if the limit lookup itself errors.
  private async assertDeviceLimitNotReached(
    userId: Types.ObjectId | string,
    { excludeDeviceId }: { excludeDeviceId?: Types.ObjectId | string } = {},
  ): Promise<void> {
    let deviceLimit: number
    try {
      const limits = await this.billingService.getUserLimits(userId?.toString())
      deviceLimit = limits?.deviceLimit ?? -1
    } catch (error) {
      console.error('assertDeviceLimitNotReached: failed to load limits', error)
      return
    }

    if (deviceLimit == null || deviceLimit === -1) {
      return
    }

    const filter: any = { user: userId, enabled: true }
    if (excludeDeviceId) {
      filter._id = { $ne: excludeDeviceId }
    }
    const activeDeviceCount = await this.deviceModel.countDocuments(filter)

    if (activeDeviceCount >= deviceLimit) {
      this.billingService
        .notifyDeviceLimitReached(userId, deviceLimit, activeDeviceCount)
        .catch((error) => {
          console.error('failed to send device limit notification', error)
        })

      throw new HttpException(
        {
          message: this.isSelfHosted()
            ? `Active device limit reached — local policy allows up to ${deviceLimit} active device(s) and you have ${activeDeviceCount}. Disable or delete another device before connecting another.`
            : `Active device limit reached — your plan allows up to ${deviceLimit} active device(s) and you have ${activeDeviceCount}. Disable or delete another device, or upgrade your plan at https://textbee.dev/pricing`,
          hasReachedLimit: true,
          deviceLimit,
          activeDeviceCount,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }
  }

  async registerDevice(
    input: RegisterDeviceInputDTO,
    user: User,
  ): Promise<any> {
    // Mongoose 9.6's strict types collide on the reserved `model` field name
    // (it expects Mongoose's `Model<any>` shape, not the device's `model`
    // schema field). Cast the filter to bypass the type check; runtime
    // behavior is unchanged.
    const deviceFilter = {
      user: user._id,
      model: input.model,
      buildId: input.buildId,
    } as any
    const device = await this.deviceModel.findOne(deviceFilter)

    const now = new Date()
    const deviceData: any = { ...input, user }

    // Set default name to "brand model" if not provided
    if (!deviceData.name && input.brand && input.model) {
      deviceData.name = `${input.brand} ${input.model}`
    }

    // Handle simInfo if provided
    if (input.simInfo) {
      deviceData.simInfo = {
        ...input.simInfo,
        lastUpdated: input.simInfo.lastUpdated || now,
      }
    }

    if (input.fcmToken) {
      deviceData.fcmTokenUpdatedAt = now
      deviceData.fcmTokenInvalidatedAt = undefined
      deviceData.fcmTokenInvalidReason = undefined
    }

    if (device && device.appVersionCode <= 11) {
      // re-enable path: updateDevice enforces the device limit on the
      // disabled -> enabled transition
      return await this.updateDevice(device._id.toString(), {
        ...deviceData,
        enabled: true,
      })
    } else {
      await this.assertDeviceLimitNotReached(user._id)
      deviceData.enabled = input.enabled ?? true
      return await this.deviceModel.create(deviceData)
    }
  }

  async getDevicesForUser(user: User): Promise<any> {
    // Exclude the push credential and hardware serial from the client response.
    return await this.deviceModel.find({ user: user._id }, '-fcmToken -serial')
  }

  async getDeviceById(deviceId: string): Promise<any> {
    return await this.deviceModel.findById(deviceId)
  }

  async updateDevice(
    deviceId: string,
    input: RegisterDeviceInputDTO,
  ): Promise<any> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device) {
      throw new HttpException(
        {
          error: 'Device not found',
        },
        HttpStatus.NOT_FOUND,
      )
    }

    if (input.enabled !== false) {
      input.enabled = true
    }

    // enforce the device limit only on the disabled -> enabled transition so
    // routine updates of already-enabled devices are never blocked
    if (!device.enabled && input.enabled) {
      await this.assertDeviceLimitNotReached(device.user as Types.ObjectId, {
        excludeDeviceId: device._id,
      })
    }

    const now = new Date()
    const updateData: any = { ...input }

    // Handle simInfo if provided
    if (input.simInfo) {
      updateData.simInfo = {
        ...input.simInfo,
        lastUpdated: input.simInfo.lastUpdated || now,
      }
    }

    if (input.fcmToken && input.fcmToken !== device.fcmToken) {
      updateData.fcmTokenUpdatedAt = now
      updateData.fcmTokenInvalidatedAt = undefined
      updateData.fcmTokenInvalidReason = undefined
    }

    return await this.deviceModel.findByIdAndUpdate(
      deviceId,
      { $set: updateData },
      { new: true },
    )
  }

  async deleteDevice(deviceId: string): Promise<any> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device) {
      throw new HttpException(
        {
          error: 'Device not found',
        },
        HttpStatus.NOT_FOUND,
      )
    }

    await this.deviceTombstoneModel.updateOne(
      { deviceId: new Types.ObjectId(deviceId) },
      {
        $setOnInsert: {
          deviceId: new Types.ObjectId(deviceId),
          userId: device.user,
          deletedAt: new Date(),
        },
      },
      { upsert: true },
    )

    await this.deviceModel.findByIdAndDelete(deviceId)

    return { success: true }
  }

  private calculateDelayFromScheduledAt(
    scheduledAt?: string,
  ): number | undefined {
    if (!scheduledAt) {
      return undefined
    }

    try {
      const scheduledDate = new Date(scheduledAt)

      // Check if date is valid
      if (isNaN(scheduledDate.getTime())) {
        throw new HttpException(
          {
            success: false,
            error:
              'Invalid scheduledAt format. Must be a valid ISO 8601 date string.',
          },
          HttpStatus.BAD_REQUEST,
        )
      }

      const now = Date.now()
      const scheduledTime = scheduledDate.getTime()
      const delayMs = scheduledTime - now

      // Reject past dates
      if (delayMs < 0) {
        throw new HttpException(
          {
            success: false,
            error: 'scheduledAt must be a future date',
          },
          HttpStatus.BAD_REQUEST,
        )
      }

      return delayMs
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      throw new HttpException(
        {
          success: false,
          error:
            'Invalid scheduledAt format. Must be a valid ISO 8601 date string.',
        },
        HttpStatus.BAD_REQUEST,
      )
    }
  }

  async sendSMS(
    deviceId: string,
    smsData: SendSMSInputDTO,
    policyContext: DispatchPolicyContext = { kind: 'ORDINARY' },
    includeDispatchMetadata = false,
  ): Promise<any> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device?.enabled) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist or is not enabled',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    const message = smsData.message || smsData.smsBody
    const requestedRecipients = smsData.recipients || smsData.receivers

    if (!message) {
      throw new HttpException(
        {
          success: false,
          error: 'Message cannot be blank',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    if (
      !Array.isArray(requestedRecipients) ||
      requestedRecipients.length === 0
    ) {
      throw new HttpException(
        {
          success: false,
          error: 'Invalid recipients',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    const recipientPolicy = await this.consentService.authorizeRecipients(
      device.user.toString(),
      requestedRecipients,
      policyContext,
    )
    const eligibleRecipients = recipientPolicy.filter((item) => item.eligible)
    const recipients = eligibleRecipients.map((item) => item.recipient)
    const excludedRecipients = recipientPolicy
      .map((item, index) => ({ item, position: index + 1 }))
      .filter(({ item }) => !item.eligible)
      .map(({ item, position }) => ({
        recipient: item.recipient,
        reason: item.reason,
        position,
      }))
    const eligibilityDetails =
      buildMessagingEligibilityDetails(excludedRecipients)
    if (recipients.length === 0) {
      throw new HttpException(
        {
          success: false,
          error: 'No recipients are eligible for messaging',
          ...eligibilityDetails,
        },
        HttpStatus.CONFLICT,
      )
    }

    // Calculate delay from scheduledAt if provided
    const delayMs = this.calculateDelayFromScheduledAt(smsData.scheduledAt)

    // Validate that scheduling requires queue to be enabled
    if (delayMs !== undefined && !this.smsQueueService.isQueueEnabled()) {
      throw new HttpException(
        {
          success: false,
          error: 'SMS scheduling requires queue to be enabled',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    if (policyContext.kind === 'ORDINARY')
      await this.billingService.canPerformAction(
        device.user.toString(),
        'send_sms',
        recipients.length,
      )

    const safetyKind: SafetyKind =
      policyContext.kind === 'ORDINARY' ? 'ORDINARY' : 'COMPLIANCE'
    const safetyReservation = this.isSelfHosted()
      ? await this.selfHostedPolicy.reserve({
          deviceId: device._id,
          kind: safetyKind,
          messages: [{ message, recipientCount: recipients.length }],
          effectiveAt:
            delayMs === undefined ? undefined : new Date(Date.now() + delayMs),
        })
      : undefined

    // TODO: Implement a queue to send the SMS if recipients are too many

    let smsBatch: SMSBatch

    try {
      smsBatch = await this.smsBatchModel.create({
        user: device.user,
        device: device._id,
        message,
        recipientCount: recipients.length,
        recipientPreview: this.getRecipientsPreview(recipients),
        status: 'pending',
      })
    } catch (e) {
      if (safetyReservation)
        await this.selfHostedPolicy.release(
          device._id,
          safetyReservation.reservationId,
          safetyKind,
        )
      throw new HttpException(
        {
          success: false,
          error: 'Failed to create SMS batch',
          additionalInfo: e,
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    const fcmMessages: Message[] = []

    for (let recipient of recipients) {
      recipient = recipient.replace(/\s+/g, '')
      const decision = eligibleRecipients.find(
        (item) => item.recipient === recipient,
      )
      let sms: SMS
      try {
        sms = await this.smsModel.create({
          user: device.user,
          device: device._id,
          smsBatch: smsBatch._id,
          message: message,
          type: SMSType.SENT,
          recipient,
          requestedAt: new Date(),
          status: 'pending',
          metadata: {
            organizationId: decision?.organizationId,
            groupId: decision?.groupId,
            policyContext,
          },
          ...(smsData.simSubscriptionId !== undefined && {
            simSubscriptionId: smsData.simSubscriptionId,
          }),
        })
      } catch (error) {
        if (safetyReservation)
          await this.selfHostedPolicy.release(
            device._id,
            safetyReservation.reservationId,
            safetyKind,
          )
        await this.smsBatchModel.findByIdAndUpdate(smsBatch._id, {
          $set: { status: 'failed', error: error.message },
        })
        throw error
      }
      const updatedSMSData = {
        smsId: sms._id,
        smsBatchId: smsBatch._id,
        message,
        recipients: [recipient],
        ...(smsData.simSubscriptionId !== undefined && {
          simSubscriptionId: smsData.simSubscriptionId,
        }),

        // Legacy fields to be removed in the future
        smsBody: message,
        receivers: [recipient],
        policyContext,
      }
      const stringifiedSMSData = JSON.stringify(updatedSMSData)

      const fcmMessage: Message = {
        data: {
          smsData: stringifiedSMSData,
        },
        token: device.fcmToken,
        android: {
          priority: 'high',
        },
      }
      fcmMessages.push(fcmMessage)
    }

    // Check if we should use the queue
    if (this.smsQueueService.isQueueEnabled()) {
      try {
        // Update batch status to processing
        await this.smsBatchModel.findByIdAndUpdate(smsBatch._id, {
          $set: { status: 'processing' },
        })

        // Add to queue
        await this.smsQueueService.addSendSmsJob(
          deviceId,
          fcmMessages,
          smsBatch._id.toString(),
          delayMs,
          safetyReservation,
        )

        return {
          success: true,
          message: 'SMS added to queue for processing',
          smsBatchId: smsBatch._id,
          recipientCount: recipients.length,
          excludedRecipients: eligibilityDetails.excludedRecipients,
          exclusionSummary: eligibilityDetails.exclusionSummary,
          ...(includeDispatchMetadata ? { queued: true } : {}),
        }
      } catch (e) {
        if (safetyReservation)
          await this.selfHostedPolicy.release(
            device._id,
            safetyReservation.reservationId,
            safetyKind,
          )
        // Update batch status to failed
        await this.smsBatchModel.findByIdAndUpdate(smsBatch._id, {
          $set: { status: 'failed', error: e.message },
        })

        // Update all SMS in batch to failed
        await this.smsModel.updateMany(
          { smsBatch: smsBatch._id },
          { $set: { status: 'failed', error: e.message } },
        )

        throw new HttpException(
          {
            success: false,
            error: 'Failed to add SMS to queue',
            additionalInfo: e,
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        )
      }
    }

    try {
      const dispatchableMessages = await this.filterDispatchableMessages(
        device.user.toString(),
        fcmMessages,
        policyContext,
      )
      if (dispatchableMessages.length === 0) {
        if (safetyReservation)
          await this.selfHostedPolicy.release(
            device._id,
            safetyReservation.reservationId,
            safetyKind,
          )
        throw new HttpException(
          {
            success: false,
            error: 'Recipients became ineligible before dispatch',
            message: ELIGIBILITY_CHANGED_MESSAGE,
            code: 'MESSAGING_ELIGIBILITY_CHANGED',
          },
          HttpStatus.CONFLICT,
        )
      }
      if (safetyReservation)
        await this.selfHostedPolicy.consume(
          device._id,
          safetyReservation.reservationId,
          safetyKind,
        )
      const response = await firebaseAdmin
        .messaging()
        .sendEach(dispatchableMessages)

      console.log(response)

      if (response.successCount === 0) {
        throw new HttpException(
          {
            success: false,
            error: 'Failed to send SMS',
            additionalInfo: response,
          },
          HttpStatus.BAD_REQUEST,
        )
      }

      this.deviceModel
        .findByIdAndUpdate(deviceId, {
          $inc: { sentSMSCount: response.successCount },
        })
        .exec()
        .catch((e) => {
          console.log('Failed to update sentSMSCount')
          console.log(e)
        })

      this.smsBatchModel
        .findByIdAndUpdate(smsBatch._id, {
          $set: { status: 'completed' },
        })
        .exec()
        .catch(() => {
          console.error('failed to update sms batch status to completed')
        })

      const dispatchResult = excludedRecipients.length
        ? {
            ...response,
            excludedRecipients: eligibilityDetails.excludedRecipients,
            exclusionSummary: eligibilityDetails.exclusionSummary,
          }
        : response
      return includeDispatchMetadata
        ? {
            ...dispatchResult,
            queued: false,
            smsBatchId: smsBatch._id,
            recipientCount: recipients.length,
          }
        : dispatchResult
    } catch (e) {
      this.smsBatchModel
        .findByIdAndUpdate(smsBatch._id, {
          $set: { status: 'failed', error: e.message },
        })
        .exec()
        .catch(() => {
          console.error('failed to update sms batch status to failed')
        })
      if (e instanceof HttpException) throw e
      throw new HttpException(
        {
          success: false,
          error: 'Failed to send SMS',
          additionalInfo: e,
        },
        HttpStatus.BAD_REQUEST,
      )
    }
  }

  async sendBulkSMS(deviceId: string, body: SendBulkSMSInputDTO): Promise<any> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device?.enabled) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist or is not enabled',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    if (
      !Array.isArray(body.messages) ||
      body.messages.length === 0 ||
      body.messages.map((m) => m.recipients).flat().length === 0
    ) {
      throw new HttpException(
        {
          success: false,
          error: 'Invalid message list',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    const eligibleMessages: SendBulkSMSInputDTO['messages'] = []
    const excludedRecipients: MessagingExclusionInput[] = []
    let recipientPosition = 0
    for (const message of body.messages) {
      const decisions = await this.consentService.authorizeRecipients(
        device.user.toString(),
        message.recipients,
        { kind: 'ORDINARY' },
      )
      const recipients = decisions
        .filter((item) => item.eligible)
        .map((item) => item.recipient)
      excludedRecipients.push(
        ...decisions
          .map((item, index) => ({
            item,
            position: recipientPosition + index + 1,
          }))
          .filter(({ item }) => !item.eligible)
          .map(({ item, position }) => ({
            recipient: item.recipient,
            reason: item.reason,
            position,
          })),
      )
      recipientPosition += message.recipients.length
      if (recipients.length > 0)
        eligibleMessages.push({ ...message, recipients })
    }
    const eligibilityDetails =
      buildMessagingEligibilityDetails(excludedRecipients)
    if (eligibleMessages.length === 0)
      throw new HttpException(
        {
          success: false,
          error: 'No recipients are eligible for messaging',
          ...eligibilityDetails,
        },
        HttpStatus.CONFLICT,
      )

    await this.billingService.canPerformAction(
      device.user.toString(),
      'bulk_send_sms',
      eligibleMessages.map((m) => m.recipients).flat().length,
    )

    // Check if any message has scheduledAt and validate queue is enabled
    const hasScheduledMessages = eligibleMessages.some((m) => m.scheduledAt)
    if (hasScheduledMessages && !this.smsQueueService.isQueueEnabled()) {
      throw new HttpException(
        {
          success: false,
          error: 'SMS scheduling requires queue to be enabled',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    const { messageTemplate } = body
    const messages = eligibleMessages

    const effectiveTimes = messages
      .map((message) => message.scheduledAt && new Date(message.scheduledAt))
      .filter((value): value is Date => Boolean(value))
    const safetyReservation = this.isSelfHosted()
      ? await this.selfHostedPolicy.reserve({
          deviceId: device._id,
          kind: 'ORDINARY',
          messages: messages.map((item) => ({
            message: item.message,
            recipientCount: item.recipients.length,
          })),
          effectiveAt: effectiveTimes.length ? effectiveTimes[0] : undefined,
        })
      : undefined

    let smsBatch: SMSBatch
    try {
      smsBatch = await this.smsBatchModel.create({
        user: device.user,
        device: device._id,
        message: messageTemplate,
        recipientCount: messages
          .map((m) => m.recipients.length)
          .reduce((a, b) => a + b, 0),
        recipientPreview: this.getRecipientsPreview(
          messages.map((m) => m.recipients).flat(),
        ),
        status: 'pending',
      })
    } catch (error) {
      if (safetyReservation)
        await this.selfHostedPolicy.release(
          device._id,
          safetyReservation.reservationId,
          'ORDINARY',
        )
      throw error
    }

    // Track FCM messages with their calculated delays for grouping
    const fcmMessagesWithDelays: Array<{ message: Message; delayMs?: number }> =
      []
    const smsDocumentsToInsert: Array<Record<string, any>> = []
    const smsToFcmMetadata: Array<{
      recipient: string
      message: string
      simSubscriptionId?: number
      delayMs?: number
    }> = []

    for (const smsData of messages) {
      const message = smsData.message
      const recipients = smsData.recipients

      if (!message) {
        continue
      }

      if (!Array.isArray(recipients) || recipients.length === 0) {
        continue
      }

      // Calculate delay for this message's scheduledAt
      const delayMs = this.calculateDelayFromScheduledAt(smsData.scheduledAt)

      for (let recipient of recipients) {
        recipient = recipient.replace(/\s+/g, '')
        smsDocumentsToInsert.push({
          user: device.user,
          device: device._id,
          smsBatch: smsBatch._id,
          message: message,
          type: SMSType.SENT,
          recipient,
          requestedAt: new Date(),
          status: 'pending',
          ...(smsData.simSubscriptionId !== undefined && {
            simSubscriptionId: smsData.simSubscriptionId,
          }),
        })
        smsToFcmMetadata.push({
          recipient,
          message,
          ...(smsData.simSubscriptionId !== undefined && {
            simSubscriptionId: smsData.simSubscriptionId,
          }),
          delayMs,
        })
      }
    }

    const insertChunkSize = 500
    const insertedSmsDocs: any[] = []
    const hasInsertMany =
      typeof (this.smsModel as any).insertMany === 'function'
    try {
      for (let i = 0; i < smsDocumentsToInsert.length; i += insertChunkSize) {
        const chunk = smsDocumentsToInsert.slice(i, i + insertChunkSize)
        if (hasInsertMany) {
          const insertedChunk = await (this.smsModel as any).insertMany(chunk, {
            ordered: true,
          })
          insertedSmsDocs.push(...insertedChunk)
          continue
        }

        // Fallback for mocked/non-standard models that don't expose insertMany
        for (const smsDocument of chunk) {
          const createdSmsDoc = await this.smsModel.create(smsDocument)
          insertedSmsDocs.push(createdSmsDoc)
        }
      }
    } catch (error) {
      if (safetyReservation)
        await this.selfHostedPolicy.release(
          device._id,
          safetyReservation.reservationId,
          'ORDINARY',
        )
      await this.smsBatchModel.findByIdAndUpdate(smsBatch._id, {
        $set: { status: 'failed', error: error.message },
      })
      throw error
    }

    if (insertedSmsDocs.length !== smsToFcmMetadata.length) {
      if (safetyReservation)
        await this.selfHostedPolicy.release(
          device._id,
          safetyReservation.reservationId,
          'ORDINARY',
        )
      throw new HttpException(
        {
          success: false,
          error: 'Failed to map created SMS records to queue payload',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      )
    }

    for (let i = 0; i < insertedSmsDocs.length; i++) {
      const sms = insertedSmsDocs[i]
      const metadata = smsToFcmMetadata[i]
      const updatedSMSData = {
        smsId: sms._id,
        smsBatchId: smsBatch._id,
        message: metadata.message,
        recipients: [metadata.recipient],
        ...(metadata.simSubscriptionId !== undefined && {
          simSubscriptionId: metadata.simSubscriptionId,
        }),

        // Legacy fields to be removed in the future
        smsBody: metadata.message,
        receivers: [metadata.recipient],
        policyContext: { kind: 'ORDINARY' },
      }
      const stringifiedSMSData = JSON.stringify(updatedSMSData)

      const fcmMessage: Message = {
        data: {
          smsData: stringifiedSMSData,
        },
        token: device.fcmToken,
        android: {
          priority: 'high',
        },
      }
      fcmMessagesWithDelays.push({
        message: fcmMessage,
        delayMs: metadata.delayMs,
      })
    }

    // Check if we should use the queue
    if (this.smsQueueService.isQueueEnabled()) {
      try {
        // Group messages by delay (undefined delay means immediate, group together)
        const messagesByDelay = new Map<number | undefined, Message[]>()
        for (const { message, delayMs } of fcmMessagesWithDelays) {
          const delayKey = delayMs !== undefined ? delayMs : undefined
          if (!messagesByDelay.has(delayKey)) {
            messagesByDelay.set(delayKey, [])
          }
          messagesByDelay.get(delayKey)!.push(message)
        }

        // Queue each group with its respective delay
        for (const [delayMs, messages] of messagesByDelay.entries()) {
          await this.smsQueueService.addSendSmsJob(
            deviceId,
            messages,
            smsBatch._id.toString(),
            delayMs,
            safetyReservation,
          )
        }

        return {
          success: true,
          message: 'Bulk SMS added to queue for processing',
          smsBatchId: smsBatch._id,
          recipientCount: messages.map((m) => m.recipients).flat().length,
          excludedRecipients: eligibilityDetails.excludedRecipients,
          exclusionSummary: eligibilityDetails.exclusionSummary,
        }
      } catch (e) {
        if (safetyReservation)
          await this.selfHostedPolicy.release(
            device._id,
            safetyReservation.reservationId,
            'ORDINARY',
          )
        // Update batch status to failed
        await this.smsBatchModel.findByIdAndUpdate(smsBatch._id, {
          $set: {
            status: 'failed',
            error: e.message,
            successCount: 0,
            failureCount: fcmMessagesWithDelays.length,
          },
        })

        // Update all SMS in batch to failed
        await this.smsModel.updateMany(
          { smsBatch: smsBatch._id },
          { $set: { status: 'failed', error: e.message } },
        )

        throw new HttpException(
          {
            success: false,
            error: 'Failed to add bulk SMS to queue',
            additionalInfo: e,
          },
          HttpStatus.INTERNAL_SERVER_ERROR,
        )
      }
    }

    // For non-queue path, convert back to simple array
    const fcmMessages = fcmMessagesWithDelays.map(({ message }) => message)
    const dispatchableMessages = await this.filterDispatchableMessages(
      device.user.toString(),
      fcmMessages,
      { kind: 'ORDINARY' },
    )
    if (dispatchableMessages.length === 0) {
      if (safetyReservation)
        await this.selfHostedPolicy.release(
          device._id,
          safetyReservation.reservationId,
          'ORDINARY',
        )
      throw new HttpException(
        {
          success: false,
          error: 'Recipients became ineligible before dispatch',
          message: ELIGIBILITY_CHANGED_MESSAGE,
          code: 'MESSAGING_ELIGIBILITY_CHANGED',
        },
        HttpStatus.CONFLICT,
      )
    }
    const fcmMessagesBatches = dispatchableMessages.map((message) => [message])
    const fcmResponses: BatchResponse[] = []

    if (safetyReservation)
      await this.selfHostedPolicy.consume(
        device._id,
        safetyReservation.reservationId,
        'ORDINARY',
      )

    for (const batch of fcmMessagesBatches) {
      try {
        const response = await firebaseAdmin.messaging().sendEach(batch)

        console.log(response)
        fcmResponses.push(response)

        this.deviceModel
          .findByIdAndUpdate(deviceId, {
            $inc: { sentSMSCount: response.successCount },
          })
          .exec()
          .catch((e) => {
            console.log('Failed to update sentSMSCount')
            console.log(e)
          })

        this.smsBatchModel
          .findByIdAndUpdate(smsBatch._id, {
            $set: { status: 'completed' },
          })
          .exec()
          .catch(() => {
            console.error('failed to update sms batch status to completed')
          })
      } catch (e) {
        console.log('Failed to send SMS: FCM')
        console.log(e)

        this.smsBatchModel
          .findByIdAndUpdate(smsBatch._id, {
            $set: { status: 'failed', error: e.message },
          })
          .exec()
          .catch(() => {
            console.error('failed to update sms batch status to failed')
          })
      }
    }

    const successCount = fcmResponses.reduce(
      (acc, m) => acc + m.successCount,
      0,
    )
    const failureCount = fcmResponses.reduce(
      (acc, m) => acc + m.failureCount,
      0,
    )
    const response = {
      success: successCount > 0,
      successCount,
      failureCount,
      fcmResponses,
    }
    return excludedRecipients.length
      ? {
          ...response,
          excludedRecipients: eligibilityDetails.excludedRecipients,
          exclusionSummary: eligibilityDetails.exclusionSummary,
        }
      : response
  }

  private isSelfHosted() {
    return process.env.TEXTBEE_BILLING_MODE === 'self_hosted'
  }

  async receiveSMS(deviceId: string, dto: ReceivedSMSDTO): Promise<any> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    if (
      (!dto.receivedAt && !dto.receivedAtInMillis) ||
      !dto.sender ||
      !dto.message
    ) {
      console.error('receiveSMS: Invalid received SMS envelope')
      throw new HttpException(
        {
          success: false,
          error: 'Invalid received SMS data',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    await this.billingService.canPerformAction(
      device.user.toString(),
      'receive_sms',
      1,
    )

    const receivedAt = dto.receivedAtInMillis
      ? new Date(dto.receivedAtInMillis)
      : dto.receivedAt

    // Deduplication: Check for existing SMS with same device, sender, message, and receivedAt (within ±5 seconds tolerance)
    const toleranceMs = 5000 // 5 seconds
    const toleranceStart = new Date(receivedAt.getTime() - toleranceMs)
    const toleranceEnd = new Date(receivedAt.getTime() + toleranceMs)

    const existingSMS = await this.smsModel.findOne({
      device: device._id,
      type: SMSType.RECEIVED,
      sender: dto.sender,
      message: dto.message,
      receivedAt: {
        $gte: toleranceStart,
        $lte: toleranceEnd,
      },
    })

    if (existingSMS) {
      console.log(
        `Duplicate inbound SMS detected for device ${deviceId}; returning existing record ${existingSMS._id}`,
      )
      return existingSMS
    }

    const sms = await this.smsModel.create({
      user: device.user,
      device: device._id,
      message: dto.message,
      type: SMSType.RECEIVED,
      status: 'received',
      sender: dto.sender,
      receivedAt,
      metadata: {
        receivingNumber: process.env.TEXTBEE_DEFAULT_RECEIVING_NUMBER,
      },
    })

    const command = await this.consentService.processInbound({
      sender: dto.sender,
      body: dto.message,
      inboundSmsId: sms._id,
      receivedAt,
    })

    if (command.handled) {
      if (command.acknowledgment) {
        await this.sendSMS(
          deviceId,
          {
            message: command.acknowledgment.body,
            recipients: [dto.sender],
            smsBody: command.acknowledgment.body,
            receivers: [dto.sender],
          },
          {
            kind: 'ACKNOWLEDGMENT',
            organizationId: command.acknowledgment.organizationId,
            groupId: command.acknowledgment.groupId,
            acknowledgmentKind: command.acknowledgment.kind,
          },
        ).catch((error) => {
          console.error(
            `Failed to queue command acknowledgment for inbound SMS ${sms._id}`,
            error?.message,
          )
        })
      }
      return sms
    }

    this.deviceModel
      .findByIdAndUpdate(deviceId, {
        $inc: { receivedSMSCount: 1 },
      })
      .exec()
      .catch((e) => {
        console.log('Failed to update receivedSMSCount')
        console.log(e)
      })

    this.webhookService
      .deliverNotification({
        sms,
        user: device.user,
        event: WebhookEvent.MESSAGE_RECEIVED,
      })
      .catch((e) => {
        console.log(e)
      })

    return sms
  }

  private async filterDispatchableMessages(
    userId: string,
    fcmMessages: Message[],
    fallbackContext: DispatchPolicyContext,
  ) {
    const dispatchable: Message[] = []
    for (const fcmMessage of fcmMessages) {
      const payload = JSON.parse(fcmMessage.data.smsData)
      const context = payload.policyContext || fallbackContext
      const [decision] = await this.consentService.authorizeRecipients(
        userId,
        payload.recipients,
        context,
      )
      if (decision?.eligible) dispatchable.push(fcmMessage)
      else
        await this.smsModel.updateOne(
          { _id: payload.smsId },
          {
            $set: {
              status: 'failed',
              failedAt: new Date(),
              errorCode: decision?.reason || 'RECIPIENT_INELIGIBLE',
              errorMessage: ELIGIBILITY_CHANGED_MESSAGE,
            },
          },
        )
    }
    return dispatchable
  }

  async getReceivedSMS(
    deviceId: string,
    page = 1,
    limit = 50,
  ): Promise<{ data: any[]; meta: any }> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit

    // Get total count for pagination metadata
    const total = await this.smsModel.countDocuments({
      device: device._id,
      type: SMSType.RECEIVED,
    })

    const data = await this.smsModel
      .find(
        {
          device: device._id,
          type: SMSType.RECEIVED,
        },
        null,
        {
          sort: { receivedAt: -1 },
          limit: limit,
          skip: skip,
        },
      )
      .populate({
        path: 'device',
        select: '_id brand model buildId enabled',
      })
      .lean() // Use lean() to return plain JavaScript objects instead of Mongoose documents

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit)

    return {
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
      data,
    }
  }

  async getMessages(
    deviceId: string,
    type = '',
    page = 1,
    limit = 50,
    search = '',
  ): Promise<{ data: any[]; meta: any }> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device) {
      throw new HttpException(
        {
          success: false,
          error: 'Device does not exist',
        },
        HttpStatus.BAD_REQUEST,
      )
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit

    // Build query based on type filter
    const query: any = { device: device._id }

    if (type === 'sent') {
      query.type = SMSType.SENT
    } else if (type === 'received') {
      query.type = SMSType.RECEIVED
    }

    // Free-text search across the message body and either party's number.
    // The input is escaped before it reaches RegExp: an unescaped "(" throws
    // and fails the request, and a crafted pattern is a ReDoS vector.
    const trimmedSearch = search?.trim()
    if (trimmedSearch) {
      const pattern = new RegExp(escapeRegExp(trimmedSearch), 'i')
      query.$or = [
        { message: pattern },
        { recipient: pattern },
        { sender: pattern },
      ]
    }

    // Get total count for pagination metadata
    const total = await this.smsModel.countDocuments(query)

    const data = await this.smsModel
      .find(query, null, {
        // Sort by the most recent timestamp (receivedAt for received, sentAt for sent)
        sort: { createdAt: -1 },
        limit: limit,
        skip: skip,
      })
      .populate({
        path: 'device',
        select: '_id brand model buildId enabled',
      })
      .lean() // Use lean() to return plain JavaScript objects instead of Mongoose documents

    // Calculate pagination metadata
    const totalPages = Math.ceil(total / limit)

    return {
      meta: {
        page,
        limit,
        total,
        totalPages,
      },
      data,
    }
  }

  async updateSMSStatus(
    deviceId: string,
    dto: UpdateSMSStatusDTO,
  ): Promise<any> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device) {
      throw new HttpException(
        {
          success: false,
          error: 'Device not found',
        },
        HttpStatus.NOT_FOUND,
      )
    }

    const sms = await this.smsModel.findById(dto.smsId)

    if (!sms) {
      throw new HttpException(
        {
          success: false,
          error: 'SMS not found',
        },
        HttpStatus.NOT_FOUND,
      )
    }

    // Verify the SMS belongs to this device
    if (sms.device.toString() !== deviceId) {
      throw new HttpException(
        {
          success: false,
          error: 'SMS does not belong to this device',
        },
        HttpStatus.FORBIDDEN,
      )
    }

    // Normalize status to lowercase for comparison
    const normalizedStatus = dto.status.toLowerCase()

    const updateData: any = {
      status: normalizedStatus, // Store normalized status
    }

    // Update timestamps based on status
    if (normalizedStatus === 'sent' && dto.sentAtInMillis) {
      updateData.sentAt = new Date(dto.sentAtInMillis)
    } else if (normalizedStatus === 'delivered' && dto.deliveredAtInMillis) {
      updateData.deliveredAt = new Date(dto.deliveredAtInMillis)
    } else if (normalizedStatus === 'failed' && dto.failedAtInMillis) {
      updateData.failedAt = new Date(dto.failedAtInMillis)
      updateData.errorCode = dto.errorCode
      updateData.errorMessage = dto.errorMessage || 'Unknown error'
    }

    // Update the SMS
    const updatedSms = await this.smsModel.findByIdAndUpdate(
      dto.smsId,
      { $set: updateData },
      { new: true },
    )

    // Check if all SMS in batch have the same status, then update batch status
    if (dto.smsBatchId) {
      const smsBatch = await this.smsBatchModel.findById(dto.smsBatchId)
      if (smsBatch) {
        const allSmsInBatch = await this.smsModel.find({
          smsBatch: dto.smsBatchId,
        })

        // Check if all SMS in batch have the same status (case insensitive)
        const allHaveSameStatus = allSmsInBatch.every(
          (sms) => sms.status.toLowerCase() === normalizedStatus,
        )

        if (allHaveSameStatus) {
          const smsBatchStatus =
            normalizedStatus === 'failed' ? 'failed' : 'completed'
          await this.smsBatchModel.findByIdAndUpdate(dto.smsBatchId, {
            $set: { status: smsBatchStatus },
          })
        }
      }
    }

    // Trigger webhook event for SMS status update
    try {
      let event: WebhookEvent
      switch (normalizedStatus) {
        case 'sent':
          event = WebhookEvent.MESSAGE_SENT
          break
        case 'delivered':
          event = WebhookEvent.MESSAGE_DELIVERED
          break
        case 'failed':
          event = WebhookEvent.MESSAGE_FAILED
          break
        case 'received':
          event = WebhookEvent.MESSAGE_RECEIVED
          break
        default:
          event = WebhookEvent.UNKNOWN_STATE
      }
      this.webhookService.deliverNotification({
        sms: updatedSms,
        user: device.user,
        event,
      })
    } catch (error) {
      console.error('Failed to trigger webhook event:', error)
    }

    return {
      success: true,
      message: 'SMS status updated successfully',
    }
  }

  async getStatsForUser(user: User) {
    const devices = await this.deviceModel.find({ user: user._id })
    const apiKeys = await this.authService.getUserApiKeys(user)

    const totalSentSMSCount = devices.reduce((acc, device) => {
      return acc + (device.sentSMSCount || 0)
    }, 0)

    const totalReceivedSMSCount = devices.reduce((acc, device) => {
      return acc + (device.receivedSMSCount || 0)
    }, 0)

    const totalDeviceCount = devices.length
    const totalApiKeyCount = apiKeys.length

    return {
      totalSentSMSCount,
      totalReceivedSMSCount,
      totalDeviceCount,
      totalApiKeyCount,
    }
  }

  private getRecipientsPreview(recipients: string[]): string {
    if (recipients.length === 0) {
      return null
    } else if (recipients.length === 1) {
      return recipients[0]
    } else if (recipients.length === 2) {
      return `${recipients[0]} and ${recipients[1]}`
    } else if (recipients.length === 3) {
      return `${recipients[0]}, ${recipients[1]}, and ${recipients[2]}`
    } else {
      return `${recipients[0]}, ${recipients[1]}, and ${
        recipients.length - 2
      } others`
    }
  }

  async getSMSById(smsId: string): Promise<any> {
    const sms = await this.smsModel.findById(smsId)

    if (!sms) {
      throw new HttpException(
        {
          success: false,
          error: 'SMS not found',
        },
        HttpStatus.NOT_FOUND,
      )
    }

    return sms
  }

  async getSmsBatchById(smsBatchId: string): Promise<any> {
    const smsBatch = await this.smsBatchModel.findById(smsBatchId)

    if (!smsBatch) {
      throw new HttpException(
        {
          success: false,
          error: 'SMS batch not found',
        },
        HttpStatus.NOT_FOUND,
      )
    }

    // Find all SMS messages that belong to this batch
    const smsMessages = await this.smsModel.find({
      smsBatch: new Types.ObjectId(smsBatchId),
      device: smsBatch.device,
    })

    // Return both the batch and its SMS messages
    return {
      batch: smsBatch,
      messages: smsMessages,
    }
  }

  async heartbeat(
    deviceId: string,
    input: HeartbeatInputDTO,
  ): Promise<HeartbeatResponseDTO> {
    const device = await this.deviceModel.findById(deviceId)

    if (!device) {
      throw new HttpException(
        {
          success: false,
          error: 'Device not found',
        },
        HttpStatus.NOT_FOUND,
      )
    }

    const now = new Date()
    const updateData: any = {
      lastHeartbeat: now,
    }

    let fcmTokenUpdated = false

    // Update FCM token if provided and different
    if (input.fcmToken && input.fcmToken !== device.fcmToken) {
      updateData.fcmToken = input.fcmToken
      updateData.fcmTokenUpdatedAt = now
      updateData.fcmTokenInvalidatedAt = undefined
      updateData.fcmTokenInvalidReason = undefined
      fcmTokenUpdated = true
    }

    // Update receiveSMSEnabled if provided and different
    if (
      input.receiveSMSEnabled !== undefined &&
      input.receiveSMSEnabled !== device.receiveSMSEnabled
    ) {
      updateData.receiveSMSEnabled = input.receiveSMSEnabled
    }

    // Update smsSendDelaySeconds if provided (clamp 0-3600)
    if (input.smsSendDelaySeconds !== undefined) {
      const clamped = Math.min(
        3600,
        Math.max(0, Math.floor(Number(input.smsSendDelaySeconds))),
      )
      updateData.smsSendDelaySeconds = clamped
    }

    // Update batteryInfo if provided
    if (
      input.batteryPercentage !== undefined ||
      input.isCharging !== undefined
    ) {
      if (input.batteryPercentage !== undefined) {
        updateData['batteryInfo.percentage'] = input.batteryPercentage
      }
      if (input.isCharging !== undefined) {
        updateData['batteryInfo.isCharging'] = input.isCharging
      }
      updateData['batteryInfo.lastUpdated'] = now
    }

    // Update networkInfo if provided
    if (input.networkType !== undefined) {
      updateData['networkInfo.networkType'] = input.networkType
      updateData['networkInfo.lastUpdated'] = now
    }

    // Update appVersionInfo if provided
    if (
      input.appVersionName !== undefined ||
      input.appVersionCode !== undefined
    ) {
      if (input.appVersionName !== undefined) {
        updateData['appVersionInfo.versionName'] = input.appVersionName
      }
      if (input.appVersionCode !== undefined) {
        updateData['appVersionInfo.versionCode'] = input.appVersionCode
      }
      updateData['appVersionInfo.lastUpdated'] = now
    }

    // Update deviceUptimeInfo if provided
    if (input.deviceUptimeMillis !== undefined) {
      updateData['deviceUptimeInfo.uptimeMillis'] = input.deviceUptimeMillis
      updateData['deviceUptimeInfo.lastUpdated'] = now
    }

    // Update systemInfo if timezone or locale provided
    if (input.timezone !== undefined || input.locale !== undefined) {
      if (input.timezone !== undefined) {
        updateData['systemInfo.timezone'] = input.timezone
      }
      if (input.locale !== undefined) {
        updateData['systemInfo.locale'] = input.locale
      }
      updateData['systemInfo.lastUpdated'] = now
    }

    // Update simInfo if provided
    if (input.simInfo !== undefined) {
      updateData.simInfo = {
        ...input.simInfo,
        lastUpdated: input.simInfo.lastUpdated || now,
      }
    }

    // Update device with all changes
    await this.deviceModel.findByIdAndUpdate(deviceId, {
      $set: updateData,
    })

    // Fetch updated device to get current name
    const updatedDevice = await this.deviceModel.findById(deviceId)

    return {
      success: true,
      fcmTokenUpdated,
      lastHeartbeat: now,
      name: updatedDevice?.name,
    }
  }
}
