import 'dotenv/config'
import { NestFactory } from '@nestjs/core'
import { FirstOrganizationMigrationModule } from './first-organization-migration.module'
import { FirstOrganizationMigrationService } from './first-organization-migration.service'

function values(flag: string) {
  return process.argv.flatMap((value, index, args) =>
    value === flag && args[index + 1] ? [args[index + 1]] : [],
  )
}

async function main() {
  const organizationId = values('--organization-id')[0] ?? ''
  const administratorEmails = values('--admin-email')
  const apply = process.argv.includes('--apply')
  const backupConfirmed = process.argv.includes('--backup-confirmed')
  const rollbackPath = values('--rollback-path')[0]
  const app = await NestFactory.createApplicationContext(
    FirstOrganizationMigrationModule,
    { logger: ['error'] },
  )
  try {
    const result = await app.get(FirstOrganizationMigrationService).run({
      organizationId,
      administratorEmails,
      apply,
      backupConfirmed,
      rollbackPath,
    })
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  } finally {
    await app.close()
  }
}

main().catch((error) => {
  const message =
    error?.response?.error || error?.message || 'Migration did not complete'
  const code = error?.response?.code
  process.stderr.write(
    `${JSON.stringify({ ...(code ? { code } : {}), error: message })}\n`,
  )
  process.exitCode = 1
})
