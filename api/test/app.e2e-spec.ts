import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import { AppModule } from './../src/app.module'
import { OrganizationsService } from './../src/organizations/organizations.service'

describe('Application startup (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('constructs the complete application including organizations', () => {
    expect(app.get(OrganizationsService)).toBeInstanceOf(OrganizationsService)
  })
})
