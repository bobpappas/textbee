import { ExecutionContext, INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request = require('supertest')
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { AuthGuard } from './guards/auth.guard'
import { UsersService } from '../users/users.service'
import { OAuthProviderRegistry } from './oauth/oauth-provider.registry'
import { OAuthAuthenticationOrchestrator } from './oauth/oauth-authentication.orchestrator'
import { OrganizationPolicyService } from '../organizations/organization-policy.service'
import { CanRegisterDevice } from '../gateway/guards/can-register-device.guard'

// Exercise the actual route guards and key persistence together: a successful
// dashboard key creation must produce a key that can register an Android gateway.
describe('Dashboard gateway API key creation', () => {
  const userId = '507f191e810c19729de860ea'
  const organizationId = '507f1f77bcf86cd799439011'
  let app: INestApplication
  let savedKey: any
  let apiKeyCaller: boolean
  const policy = { soleAdminOrganizationId: jest.fn() }
  const apiKeyModel: any = jest.fn().mockImplementation((doc) => {
    savedKey = { ...doc, save: jest.fn().mockResolvedValue(undefined) }
    return savedKey
  })

  beforeAll(async () => {
    const auth = new AuthService(
      {} as any,
      {} as any,
      apiKeyModel,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    )
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: UsersService, useValue: {} },
        { provide: OAuthProviderRegistry, useValue: {} },
        { provide: OAuthAuthenticationOrchestrator, useValue: {} },
        { provide: OrganizationPolicyService, useValue: policy },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({
        canActivate(context: ExecutionContext) {
          const req = context.switchToHttp().getRequest()
          req.user = { _id: userId }
          if (apiKeyCaller) {
            req.apiKey = {
              organizationId,
              purpose: 'GATEWAY',
              scopes: ['gateway:operate'],
            }
          }
          return true
        },
      })
      .compile()
    app = module.createNestApplication()
    await app.init()
  })

  beforeEach(() => {
    jest.clearAllMocks()
    savedKey = undefined
    apiKeyCaller = false
    policy.soleAdminOrganizationId.mockResolvedValue(organizationId)
  })

  afterAll(async () => {
    await app?.close()
  })

  it('creates an organization gateway key accepted by device registration', async () => {
    const result = await request(app.getHttpServer())
      .post('/auth/api-keys')
      .send({})
      .expect(201)
    expect(result.body.data).toEqual(expect.any(String))
    expect(policy.soleAdminOrganizationId).toHaveBeenCalledWith(userId)
    expect(String(savedKey.organizationId)).toBe(organizationId)
    expect(savedKey.purpose).toBe('GATEWAY')
    expect(savedKey.scopes).toEqual(['gateway:operate'])
    expect(savedKey.createdBy).toBe(userId)
    expect(savedKey.save).toHaveBeenCalledTimes(1)
    const gatewayRequest: any = { apiKey: savedKey }
    const context = {
      switchToHttp: () => ({ getRequest: () => gatewayRequest }),
    } as unknown as ExecutionContext
    await expect(
      new CanRegisterDevice(policy as any).canActivate(context),
    ).resolves.toBe(true)
    expect(gatewayRequest.organizationId).toBe(organizationId)
  })

  it('ignores a caller-supplied organization in favor of verified membership', async () => {
    await request(app.getHttpServer())
      .post('/auth/api-keys')
      .send({ organizationId: '507f1f77bcf86cd799439099' })
      .expect(201)
    expect(String(savedKey.organizationId)).toBe(organizationId)
  })

  it('does not persist a key when no sole administrator organization resolves', async () => {
    policy.soleAdminOrganizationId.mockResolvedValue(null)
    await request(app.getHttpServer())
      .post('/auth/api-keys')
      .send({ organizationId })
      .expect(404)
    expect(apiKeyModel).not.toHaveBeenCalled()
  })

  it('does not let a gateway key mint more credentials', async () => {
    apiKeyCaller = true
    await request(app.getHttpServer())
      .post('/auth/api-keys')
      .send({})
      .expect(404)
    expect(apiKeyModel).not.toHaveBeenCalled()
  })
})
