import { ExecutionContext, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request = require('supertest')
import { GatewayController } from './gateway.controller'
import { GatewayService } from './gateway.service'
import { WebhookController } from '../webhook/webhook.controller'
import { WebhookService } from '../webhook/webhook.service'
import { OrganizationPolicyService } from '../organizations/organization-policy.service'
import { AuthGuard } from '../auth/guards/auth.guard'

const org = '507f1f77bcf86cd799439011'
const deviceId = '507f191e810c19729de860ea'
describe('Administrator testing HTTP authorization', () => {
  let app: INestApplication
  let principal: any
  let device: any
  const policy = {
    activeAdminMembership: jest.fn(),
    soleAdminOrganizationId: jest.fn(),
  }
  const gateway: any = {
    getDeviceById: jest.fn(() => device),
    sendSMS: jest.fn(),
    sendBulkSMS: jest.fn(),
    getMessages: jest.fn(),
    getReceivedSMS: jest.fn(),
    getSMSById: jest.fn(),
    getSmsBatchById: jest.fn(),
    previewMessagingEligibility: jest.fn(),
    heartbeat: jest.fn(),
    receiveSMS: jest.fn(),
    claimSMSDispatch: jest.fn(),
    updateSMSStatus: jest.fn(),
    updateDevice: jest.fn(),
  }
  const webhooks: any = Object.fromEntries(
    [
      'findWebhooksForUser',
      'findWebhookNotificationsForUser',
      'findOne',
      'create',
      'update',
      'remove',
    ].map((name) => [name, jest.fn()]),
  )
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [GatewayController, WebhookController],
      providers: [
        { provide: GatewayService, useValue: gateway },
        { provide: WebhookService, useValue: webhooks },
        { provide: OrganizationPolicyService, useValue: policy },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          Object.assign(context.switchToHttp().getRequest(), principal)
          return true
        },
      })
      .compile()
    app = module.createNestApplication()
    await app.init()
  })
  afterAll(async () => {
    await app?.close()
  })
  beforeEach(() => {
    jest.clearAllMocks()
    principal = { user: { _id: 'operator', role: 'ADMIN' } }
    device = { organizationId: org, user: 'operator' }
    policy.activeAdminMembership.mockResolvedValue(null)
    policy.soleAdminOrganizationId.mockResolvedValue(null)
  })
  const cases = [
    ['post', 'send-sms', 'sendSMS'],
    ['post', 'sendSMS', 'sendSMS'],
    ['post', 'send-bulk-sms', 'sendBulkSMS'],
    ['post', 'messaging-eligibility', 'previewMessagingEligibility'],
    ['get', 'messages', 'getMessages'],
    ['get', 'get-received-sms', 'getReceivedSMS'],
    ['get', 'getReceivedSMS', 'getReceivedSMS'],
    ['get', 'sms/message-id', 'getSMSById'],
    ['get', 'sms-batch/batch-id', 'getSmsBatchById'],
  ]
  it.each(cases)(
    'denies non-admin %s %s before business logic',
    async (method, route, handler) => {
      await request(app.getHttpServer())
        [method](`/gateway/devices/${deviceId}/${route}`)
        .send({ recipients: [], message: 'synthetic' })
        .expect(404)
      expect(gateway[handler]).not.toHaveBeenCalled()
    },
  )
  it('rejects legacy ownership even for a platform ADMIN', async () => {
    device = { user: 'operator' }
    await request(app.getHttpServer())
      .post(`/gateway/devices/${deviceId}/send-sms`)
      .send({})
      .expect(404)
    expect(gateway.sendSMS).not.toHaveBeenCalled()
  })
  it('permits an organization administrator to use individual and bulk testing', async () => {
    policy.activeAdminMembership.mockResolvedValue({ id: 'membership' })
    for (const route of ['send-sms', 'send-bulk-sms'])
      await request(app.getHttpServer())
        .post(`/gateway/devices/${deviceId}/${route}`)
        .send({})
        .expect(201)
    expect(gateway.sendSMS).toHaveBeenCalledTimes(1)
    expect(gateway.sendBulkSMS).toHaveBeenCalledTimes(1)
  })
  it.each([
    ['get', '', 'findWebhooksForUser'],
    ['get', '/notifications', 'findWebhookNotificationsForUser'],
    ['get', '/subscription', 'findOne'],
    ['post', '', 'create'],
    ['patch', '/subscription', 'update'],
    ['delete', '/subscription', 'remove'],
  ])('denies non-admin webhook %s %s', async (method, route, handler) => {
    await request(app.getHttpServer())
      [method](`/webhooks${route}`)
      .send({})
      .expect(404)
    expect(webhooks[handler]).not.toHaveBeenCalled()
  })
  it('permits administrator webhook management', async () => {
    policy.soleAdminOrganizationId.mockResolvedValue(org)
    await request(app.getHttpServer()).get('/webhooks').expect(200)
    expect(webhooks.findWebhooksForUser).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: org }),
    )
  })
  it.each([
    ['post', 'heartbeat', 200, 'heartbeat'],
    ['post', 'receive-sms', 200, 'receiveSMS'],
    ['post', 'sms/message-id/claim', 200, 'claimSMSDispatch'],
    ['patch', 'sms-status', 200, 'updateSMSStatus'],
    ['get', 'sms/message-id', 200, 'getSMSById'],
    ['patch', '', 200, 'updateDevice'],
  ])('preserves gateway-key %s %s', async (method, route, status, handler) => {
    principal.apiKey = {
      organizationId: org,
      purpose: 'GATEWAY',
      scopes: ['gateway:operate'],
    }
    await request(app.getHttpServer())
      [method](`/gateway/devices/${deviceId}${route ? '/' + route : ''}`)
      .send({})
      .expect(status)
    expect(gateway[handler]).toHaveBeenCalledTimes(1)
    principal.apiKey.organizationId = deviceId
    await request(app.getHttpServer())
      [method](`/gateway/devices/${deviceId}${route ? '/' + route : ''}`)
      .send({})
      .expect(404)
    expect(gateway[handler]).toHaveBeenCalledTimes(1)
  })
})
