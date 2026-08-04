import { GroupsController } from './groups.controller'

describe('GroupsController organization scoping', () => {
  it('passes the path organization and authenticated actor to group listing', async () => {
    const groups = { list: jest.fn().mockResolvedValue([]) }
    const controller = new GroupsController(groups as any)
    const user = { _id: '64b7c42f18f0c31f8c9fd112' }

    await expect(
      controller.list('64b7c42f18f0c31f8c9fd111', { user }, 'true'),
    ).resolves.toEqual({ data: [] })
    expect(groups.list).toHaveBeenCalledWith(
      '64b7c42f18f0c31f8c9fd111',
      user,
      true,
    )
  })

  it('never accepts organization identity from roster input', async () => {
    const result = { id: 'membership-1' }
    const groups = { addPerson: jest.fn().mockResolvedValue(result) }
    const controller = new GroupsController(groups as any)
    const user = { _id: '64b7c42f18f0c31f8c9fd112' }
    const input = {
      organizationId: 'forged-organization',
      displayName: 'Synthetic Contact',
      mobileNumber: '(208) 555-0123',
    }

    await expect(
      controller.addPerson(
        '64b7c42f18f0c31f8c9fd111',
        '64b7c42f18f0c31f8c9fd201',
        { user },
        input,
        'request-1',
      ),
    ).resolves.toEqual({ data: result })
    expect(groups.addPerson).toHaveBeenCalledWith(
      '64b7c42f18f0c31f8c9fd111',
      '64b7c42f18f0c31f8c9fd201',
      user,
      input,
      'request-1',
    )
  })
})
