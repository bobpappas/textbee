import { Injectable } from '@nestjs/common'
import * as firebase from 'firebase-admin'
import { Message } from 'firebase-admin/messaging'
/** Transport boundary: the durable scheduler does not depend on Firebase results. */
@Injectable()
export class AndroidSmsTransport {
  async handoff(command: Message): Promise<'ACCEPTED' | 'REJECTED'> {
    const result = await firebase.messaging().sendEach([command])
    return result.responses[0]?.success ? 'ACCEPTED' : 'REJECTED'
  }
}
