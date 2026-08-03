import { OrganizationsController } from './organizations.controller'

describe('OrganizationsController current context', () => {
  it.each(['ACTIVE', 'NO_ACCESS', 'SELECTION_REQUIRED'])(
    'passes through the server-derived %s state',
    async (state) => {
      const context = { current: jest.fn().mockResolvedValue({ state }) }
      const controller = new OrganizationsController({} as any, context as any)
      const user = { _id: '507f1f77bcf86cd799439011' }

      await expect(controller.currentContext({ user })).resolves.toEqual({
        data: { state },
      })
      expect(context.current).toHaveBeenCalledWith(user, false)
    },
  )

  it('uses only the authenticated request identity and API-key marker', async () => {
    const organizations = {}
    const context = {
      current: jest.fn().mockResolvedValue({ state: 'NO_ACCESS' }),
    }
    const controller = new OrganizationsController(
      organizations as any,
      context as any,
    )
    const user = { _id: '507f1f77bcf86cd799439011', role: 'ADMIN' }

    await expect(
      controller.currentContext({
        user,
        apiKey: { _id: 'key' },
        query: { organizationId: 'forged' },
        body: { capabilities: ['organization:profile:manage'] },
      }),
    ).resolves.toEqual({ data: { state: 'NO_ACCESS' } })
    expect(context.current).toHaveBeenCalledWith(user, true)
  })
})
