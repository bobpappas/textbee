import { GroupsController } from './groups.controller'

describe('GroupsController organization scoping', () => {
  it('passes the path organization and authenticated actor to group listing', async () => {
    const groups = { list: jest.fn().mockResolvedValue([]) }
    const controller = new GroupsController(groups as any, {} as any)
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
    const controller = new GroupsController(groups as any, {} as any)
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

  it('binds contact rename to the organization and managed group paths', async () => {
    const result = { contactId: 'contact-1', displayName: 'Real Name' }
    const groups = { renameContact: jest.fn().mockResolvedValue(result) }
    const controller = new GroupsController(groups as any, {} as any)
    const user = { _id: '64b7c42f18f0c31f8c9fd112' }
    await expect(
      controller.renameContact(
        '64b7c42f18f0c31f8c9fd111',
        '64b7c42f18f0c31f8c9fd201',
        '64b7c42f18f0c31f8c9fd501',
        { user },
        { displayName: 'Real Name', mobileNumber: '+19999999999' },
        'request-2',
      ),
    ).resolves.toEqual({ data: result })
    expect(groups.renameContact).toHaveBeenCalledWith(
      '64b7c42f18f0c31f8c9fd111',
      '64b7c42f18f0c31f8c9fd201',
      '64b7c42f18f0c31f8c9fd501',
      user,
      { displayName: 'Real Name', mobileNumber: '+19999999999' },
      'request-2',
    )
  })

  it('binds consent recording to path scope and authenticated actor', async () => {
    const result = { contactId: 'contact-1', consentStatus: 'ACTIVE' }
    const groups = {
      recordContactConsent: jest.fn().mockResolvedValue(result),
    }
    const controller = new GroupsController(groups as any, {} as any)
    const user = { _id: '64b7c42f18f0c31f8c9fd112' }
    const input = {
      affirmed: true,
      organizationId: 'forged',
      mobileNumber: '+12085550999',
    }

    await expect(
      controller.recordContactConsent(
        '64b7c42f18f0c31f8c9fd111',
        '64b7c42f18f0c31f8c9fd201',
        '64b7c42f18f0c31f8c9fd501',
        { user },
        input,
      ),
    ).resolves.toEqual({ data: result })
    expect(groups.recordContactConsent).toHaveBeenCalledWith(
      '64b7c42f18f0c31f8c9fd111',
      '64b7c42f18f0c31f8c9fd201',
      '64b7c42f18f0c31f8c9fd501',
      user,
      input,
    )
  })
})
