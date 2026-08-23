import { Injectable } from '@nestjs/common'
import { OnEvent } from '@nestjs/event-emitter'
import { CommunicationsService } from './communications.service'

@Injectable()
export class CommunicationsListener {
  constructor(private readonly communications: CommunicationsService) {}

  @OnEvent('sms.inbound.ordinary', { async: true })
  classifyInbound(event: { smsId: string }) {
    return this.communications.classifyInboundSms(event.smsId)
  }

  @OnEvent('group.message.confirmed', { async: true })
  linkGroupSend(event: { sendId: string }) {
    return this.communications.linkGroupSend(event.sendId)
  }
}
