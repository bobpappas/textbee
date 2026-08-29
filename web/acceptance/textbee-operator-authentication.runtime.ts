import { strict as assert } from 'node:assert'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

type Feature = { scenarios: readonly { name: string }[] }

const source = (relativePath: string) =>
  readFile(path.join(process.cwd(), '..', relativePath), 'utf8')

export async function runAcceptanceScenario(
  feature: Feature,
  scenarioIndex: number,
  _example: Readonly<Record<string, string>>,
  _fixtures: unknown,
) {
  const scenario = feature.scenarios[scenarioIndex]
  assert.ok(scenario, 'acceptance scenario must exist')

  const [controller, module, google, orchestrator, sessions, approvals, cli] =
    await Promise.all([
      source('api/src/auth/auth.controller.ts'),
      source('api/src/auth/auth.module.ts'),
      source('api/src/auth/oauth/google-oauth.provider.ts'),
      source('api/src/auth/oauth/oauth-authentication.orchestrator.ts'),
      source('api/src/auth/oauth/oauth-session-authorization.service.ts'),
      source('api/src/auth/oauth/oauth-approval.service.ts'),
      source('api/src/auth/oauth/oauth-approval.cli.ts'),
    ])

  switch (scenario.name) {
    case 'Provider architecture precedes Google enablement':
      assert.match(module, /OAuthProviderRegistry/)
      assert.match(module, /GoogleOAuthProvider/)
      assert.match(controller, /oauthProviders\.verify/)
      assert.match(controller, /oauthAuthentication\.authenticate/)
      return
    case 'Approved Google identity binds once':
      assert.match(google, /verifyIdToken/)
      assert.match(orchestrator, /bindPendingApproval/)
      assert.match(orchestrator, /jwtService\.sign/)
      return
    case 'Domain membership is not approval':
    case 'Approved external-domain account works':
      assert.doesNotMatch(google, /hostedDomain|hd:/)
      assert.match(orchestrator, /normalizedEmail: identity\.normalizedEmail/)
      return
    case 'Token validation fails closed':
      assert.match(google, /email_verified !== true/)
      assert.match(google, /accounts\.google\.com/)
      return
    case 'Stable subject prevents email takeover':
      assert.match(orchestrator, /approval\.boundSubject !== identity\.subject/)
      return
    case 'Concurrent first login has one winner':
      assert.match(orchestrator, /state: OAuthApprovalState\.PENDING/)
      assert.match(orchestrator, /approval already claimed/)
      return
    case 'Approval role is not organization authority':
      assert.doesNotMatch(orchestrator, /Organization|Membership|Grant/)
      return
    case 'Revocation invalidates existing sessions':
      assert.match(sessions, /authorizationRevision/)
      assert.match(sessions, /OAuthApprovalState\.BOUND/)
      return
    case 'Public account creation paths are disabled':
      assert.match(controller, /@Post\('\/oauth-login'\)/)
      for (const legacy of [
        '/login',
        '/google-login',
        '/register',
        '/request-password-reset',
        '/reset-password',
        '/verify-email',
        '/change-password',
      ]) {
        assert.doesNotMatch(
          controller,
          new RegExp(`@(?:Post|Get|Patch)\\('${legacy}'\\)`),
        )
      }
      return
    case 'Trusted shell restores platform authority':
      assert.match(cli, /--confirm-platform-admin/)
      assert.match(approvals, /PRIVATE_SHELL_ADMIN/)
      return
    case 'Routine last-administrator changes fail safe':
      assert.match(approvals, /protectLastAdministrator/)
      assert.match(approvals, /COMMAND_DENIED/)
      return
    case 'Public activation inventory has no legacy blocker':
      assert.match(controller, /oauthLogin\(@Body\(\) input: OAuthLoginDTO\)/)
      return
    default:
      assert.fail(`unhandled B009 scenario: ${scenario.name}`)
  }
}
