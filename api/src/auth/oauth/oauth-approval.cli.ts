import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../../app.module'
import { UserRole } from '../../users/user-roles.enum'
import { OAuthApprovalService } from './oauth-approval.service'

const value = (flag: string) => {
  const index = process.argv.indexOf(flag)
  return index < 0 ? undefined : process.argv[index + 1]
}

async function run() {
  const action = process.argv[2]
  const provider = value('--provider')
  if (!provider) throw new Error('--provider is required')

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  })
  try {
    const approvals = app.get(OAuthApprovalService)
    let result: unknown
    if (action === 'approve') {
      result = await approvals.approve({
        provider,
        email: value('--email') || '',
        role: value('--role') as UserRole,
        reason: value('--reason') || '',
        confirmPlatformAdmin: process.argv.includes('--confirm-platform-admin'),
      })
    } else if (action === 'revoke') {
      result = await approvals.revoke(
        provider,
        value('--email') || '',
        value('--reason') || '',
      )
    } else if (action === 'reset-binding') {
      result = await approvals.resetBinding(
        provider,
        value('--email') || '',
        value('--reason') || '',
        process.argv.includes('--confirm-reset'),
      )
    } else if (action === 'list') {
      result = await approvals.list(provider, value('--email'))
    } else {
      throw new Error('Unknown OAuth approval command')
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    await app.close()
  }
}

run().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'OAuth approval command failed'}\n`,
  )
  process.exitCode = 1
})
