import { OrganizationOperationalGuard } from '../../organizations/organization-operational.guard'
import { CanModifyApiKey } from '../guards/can-modify-api-key.guard'
import { Test } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerModule } from '@nestjs/throttler'
import { JwtService } from '@nestjs/jwt'
import request = require('supertest')
import { AccessRequestController } from './access-request.controller'
import { AccessRequestService } from './access-request.service'
import { AuthController } from '../auth.controller'
import { AuthService } from '../auth.service'
import { UsersService } from '../../users/users.service'
import { AuthGuard } from '../guards/auth.guard'
import { ThrottlerByIpGuard } from '../guards/throttle-by-ip.guard'
import { OAuthSessionAuthorizationService } from './oauth-session-authorization.service'
import { OAuthProviderRegistry } from './oauth-provider.registry'
import { OAuthAuthenticationOrchestrator } from './oauth-authentication.orchestrator'

describe('Admission HTTP boundary and throttles', () => {
  let app: INestApplication
  const jwt = new JwtService({ secret: 'synthetic-http-test-secret' })
  const adminToken = jwt.sign({
    sub: 'admin',
    oauthProvider: 'google',
    authorizationRevision: 1,
  })
  const applicantToken = jwt.sign(
    { purpose: 'onboarding', requestId: 'synthetic' },
    { audience: 'textbee-onboarding' },
  )
  const service = {
    applicantId: (token: string) => { const claims = jwt.verify(token, { audience: 'textbee-onboarding' }); if (claims.purpose !== 'onboarding') throw new Error(); return claims.requestId },
    status: jest.fn(async () => ({ state: 'PENDING' })),
    list: jest.fn(async () => ({ items: [] })),
    options: jest.fn(async () => []),
    decide: jest.fn(async () => ({ state: 'APPROVED' })),
  }
  const verify = jest.fn(async () => ({
    providerKey: 'google',
    subject: 'synthetic',
    normalizedEmail: 'synthetic@example.test',
    emailVerified: true,
    auditMetadata: {},
  }))
  beforeEach(async () => {
    jest.clearAllMocks()
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 500 }])],
      controllers: [AccessRequestController, AuthController],
      providers: [
        AuthGuard,
        { provide: APP_GUARD, useClass: ThrottlerByIpGuard },
        { provide: JwtService, useValue: jwt },
        { provide: AccessRequestService, useValue: service },
        {
          provide: AuthService,
          useValue: {
            trackAccessLog: jest.fn(),
            findActiveApiKeyByClientKey: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: {
            findOne: async ({ _id }) =>
              _id === 'admin' ? { _id, role: 'ADMIN' } : null,
          },
        },
        {
          provide: OAuthSessionAuthorizationService,
          useValue: {
            isCurrent: async (claims) =>
              claims.sub === 'admin' &&
              claims.authorizationRevision === 1 &&
              !claims.purpose,
          },
        },
        { provide: OAuthProviderRegistry, useValue: { verify } },
        {
          provide: OAuthAuthenticationOrchestrator,
          useValue: {
            authenticate: async () => ({
              user: { admission: 'onboarding' },
              accessToken: applicantToken,
            }),
          },
        },
      ],
    })
      .overrideGuard(OrganizationOperationalGuard)
      .useValue({ canActivate: () => false })
      .overrideGuard(CanModifyApiKey)
      .useValue({ canActivate: () => false })
      .compile()
    app = module.createNestApplication()
    await app.init()
  })
  afterEach(async () => {
    await app?.close()
  })
  it('rejects anonymous, applicant, stale and API-key access to decisions', async () => {
    for (const token of [
      '',
      applicantToken,
      jwt.sign({ sub: 'admin', authorizationRevision: 0 }),
    ]) {
      await request(app.getHttpServer())
        .get('/auth/access-requests')
        .set('Authorization', `Bearer ${token}`)
        .expect(401)
    }
    await request(app.getHttpServer())
      .get('/auth/access-requests')
      .set('x-api-key', 'synthetic')
      .expect(401)
    expect(service.list).not.toHaveBeenCalled()
    await request(app.getHttpServer())
      .get('/auth/access-requests')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
    expect(service.list).toHaveBeenCalledTimes(1)
  })
  it('rejects privilege injection and malformed decision bodies before mutation', async () => {
    await request(app.getHttpServer())
      .post('/auth/access-requests/64b7c42f18f0c31f8c9fd203/decision')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'approve', reason: 'Test', version: 0, role: 'ADMIN' })
      .expect(400)
    expect(service.decide).not.toHaveBeenCalled()
  })
  it('limits sign-in attempts even when clients spoof forwarded IP headers', async () => {
    for (let i = 0; i < 10; i++)
      await request(app.getHttpServer())
        .post('/auth/oauth-login')
        .set('X-Forwarded-For', `192.0.2.${i}`)
        .send({ provider: 'google', idToken: 'synthetic' })
        .expect(200)
    const response = await request(app.getHttpServer())
      .post('/auth/oauth-login')
      .set('X-Forwarded-For', '192.0.2.100')
      .send({ provider: 'google', idToken: 'synthetic' })
      .expect(429)
    expect(response.headers['retry-after']).toBeDefined()
    expect(verify).toHaveBeenCalledTimes(10)
  })
  it('limits status checks per onboarding session and returns retry information', async () => {
    for (let i = 0; i < 30; i++)
      await request(app.getHttpServer())
        .get('/auth/access-requests/status')
        .set('Authorization', `Bearer ${applicantToken}`)
        .expect(200)
    const response = await request(app.getHttpServer())
      .get('/auth/access-requests/status')
      .set('Authorization', `Bearer ${applicantToken}`)
      .expect(429)
    expect(response.headers['retry-after']).toBeDefined()
    expect(service.status).toHaveBeenCalledTimes(30)
  })
})
