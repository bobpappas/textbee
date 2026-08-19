import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { SMS } from '../schemas/sms.schema'
import { SMSBatch } from '../schemas/sms-batch.schema'

@Injectable()
export class SmsStatusUpdateTask {
  private readonly logger = new Logger(SmsStatusUpdateTask.name)

  constructor(
    @InjectModel(SMS.name) private smsModel: Model<SMS>,
    @InjectModel(SMSBatch.name) private smsBatchModel: Model<SMSBatch>,
  ) {}

  /**
   * Cron job that runs every 5 minutes to update the status of SMS messages
   * that have been pending or dispatched for more than 20 minutes without any status updates.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handlePendingSmsTimeout() {
    this.logger.log(
      'Running cron job to update stale pending and dispatched SMS messages',
    )

    const now = new Date()
    const twentyMinutesAgo = new Date()
    twentyMinutesAgo.setMinutes(twentyMinutesAgo.getMinutes() - 20)

    try {
      const timedOutSms = await this.smsModel
        .find({
          status: 'pending',
          dispatchExpiresAt: { $lt: now },
        })
        .select('smsBatch')
        .lean()
      const pendingResult = await this.smsModel.updateMany(
        {
          status: 'pending',
          dispatchExpiresAt: { $lt: now },
        },
        {
          $set: {
            status: 'failed',
            failedAt: new Date(),
            errorCode: 'GATEWAY_UNAVAILABLE',
            errorMessage:
              'Gateway unavailable - the phone did not claim this command within 2 minutes',
          },
        },
      )
      this.logger.log(
        `Updated ${pendingResult.modifiedCount} unclaimed SMS messages from 'pending' to 'failed' status`,
      )

      const timedOutBatchIds = [
        ...new Set(
          timedOutSms.map((sms) => sms.smsBatch?.toString()).filter(Boolean),
        ),
      ]
      if (timedOutBatchIds.length > 0) {
        await this.smsBatchModel.updateMany(
          { _id: { $in: timedOutBatchIds } },
          {
            $set: {
              status: 'failed',
              error:
                'Gateway unavailable - a dispatch command was not claimed within 2 minutes',
            },
          },
        )
      }

      const dispatchedResult = await this.smsModel.updateMany(
        {
          status: 'dispatched',
          dispatchedAt: { $lt: twentyMinutesAgo },
        },
        {
          $set: {
            status: 'unknown',
            errorMessage:
              'Status update timeout - no response from device after dispatch',
          },
        },
      )
      this.logger.log(
        `Updated ${dispatchedResult.modifiedCount} SMS messages from 'dispatched' to 'unknown' status`,
      )

      const batchResult = await this.smsBatchModel.updateMany(
        {
          status: 'pending',
          createdAt: { $lt: twentyMinutesAgo },
        },
        {
          $set: {
            status: 'unknown',
            error:
              'Status update timeout - no response received after 20 minutes',
          },
        },
      )
      this.logger.log(
        `Updated ${batchResult.modifiedCount} SMS batches from 'pending' to 'unknown' status`,
      )
    } catch (error) {
      this.logger.error('Error updating stale pending SMS messages', error)
    }
  }
}
