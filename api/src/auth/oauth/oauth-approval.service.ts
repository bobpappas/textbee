import { Injectable } from '@nestjs/common'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import { ClientSession, Connection, Model } from 'mongoose'
import { UserRole } from '../../users/user-roles.enum'
import { User, UserDocument } from '../../users/schemas/user.schema'
import {
  OAuthApprovalState,
  OAuthAuthenticationAuditAction,
  OAuthAuthenticationAuditOutcome,
} from './oauth-authentication.enums'
import { OAuthProviderRegistry } from './oauth-provider.registry'
import { normalizeOAuthEmail } from './oauth-provider.types'
import {
  OAuthApproval,
  OAuthApprovalDocument,
} from './schemas/oauth-approval.schema'
import {
  OAuthAuthenticationAuditEvent,
  OAuthAuthenticationAuditEventDocument,
} from './schemas/oauth-authentication-audit-event.schema'
import {
  OAuthIdentityBinding,
  OAuthIdentityBindingDocument,
} from './schemas/oauth-identity-binding.schema'
import {
  OAuthPlatformAuthorityInvariant,
  OAuthPlatformAuthorityInvariantDocument,
} from './schemas/oauth-platform-authority-invariant.schema'

const PRIVATE_SHELL_ACTOR = 'PRIVATE_SHELL_ADMIN'
const SYSTEM_BOOTSTRAP_ACTOR = 'SYSTEM_BOOTSTRAP'
const PLATFORM_AUTHORITY_SCOPE = 'platform-administrator'
const LAST_ADMINISTRATOR_ERROR =
  'Cannot change the last usable platform administrator'

export type ApprovalCommand = {
  provider: string
  email: string
  role: UserRole
  reason: string
  confirmPlatformAdmin?: boolean
  systemBootstrap?: boolean
}

type CommandResult = {
  approval: OAuthApprovalDocument
  denied?: boolean
}

@Injectable()
export class OAuthApprovalService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(OAuthApproval.name)
    private readonly approvals: Model<OAuthApprovalDocument>,
    @InjectModel(OAuthIdentityBinding.name)
    private readonly bindings: Model<OAuthIdentityBindingDocument>,
    @InjectModel(OAuthAuthenticationAuditEvent.name)
    private readonly audits: Model<OAuthAuthenticationAuditEventDocument>,
    @InjectModel(OAuthPlatformAuthorityInvariant.name)
    private readonly authorityInvariant: Model<OAuthPlatformAuthorityInvariantDocument>,
    @InjectModel(User.name)
    private readonly users: Model<UserDocument>,
    private readonly providers: OAuthProviderRegistry,
  ) {}

  async approve(command: ApprovalCommand) {
    this.validateCommand(command.provider, command.email, command.reason)
    if (!Object.values(UserRole).includes(command.role)) {
      throw new Error('Role must be REGULAR or ADMIN')
    }
    if (command.role === UserRole.ADMIN && !command.confirmPlatformAdmin) {
      throw new Error('ADMIN approval requires --confirm-platform-admin')
    }
    if (command.systemBootstrap && command.role !== UserRole.ADMIN) {
      throw new Error('System bootstrap requires an ADMIN approval')
    }

    const normalizedEmail = normalizeOAuthEmail(command.email)
    const actorKind = command.systemBootstrap
      ? SYSTEM_BOOTSTRAP_ACTOR
      : PRIVATE_SHELL_ACTOR
    const result = await this.serializedCommand(async (session, invariant) => {
      let approval = await this.approvals
        .findOne({ providerKey: command.provider, normalizedEmail })
        .session(session)

      if (command.systemBootstrap) {
        if (invariant.bootstrapCompleted) {
          if (
            approval?.actorKind === SYSTEM_BOOTSTRAP_ACTOR &&
            approval.role === UserRole.ADMIN &&
            approval.state !== OAuthApprovalState.REVOKED
          ) {
            return { approval }
          }
          throw new Error('System bootstrap has already completed')
        }
        const priorAdminApprovals = await this.approvals
          .countDocuments({ role: UserRole.ADMIN })
          .session(session)
        if (priorAdminApprovals > 0) {
          throw new Error('System bootstrap requires no prior ADMIN approval')
        }
        invariant.bootstrapCompleted = true
        await invariant.save({ session })
      }

      if (!approval) {
        approval = new this.approvals({
          providerKey: command.provider,
          normalizedEmail,
          role: command.role,
          state: OAuthApprovalState.PENDING,
          authorizationRevision: 1,
          approvedAt: new Date(),
          actorKind,
          reason: command.reason,
        })
      } else if (
        approval.state !== OAuthApprovalState.REVOKED &&
        approval.role === command.role
      ) {
        return { approval }
      } else {
        if (
          approval.role === UserRole.ADMIN &&
          command.role !== UserRole.ADMIN &&
          approval.state === OAuthApprovalState.BOUND &&
          (await this.isLastUsableAdministrator(approval, session))
        ) {
          await this.recordAudit(
            approval,
            OAuthAuthenticationAuditAction.COMMAND_DENIED,
            command.reason,
            OAuthAuthenticationAuditOutcome.DENIED,
            actorKind,
            session,
          )
          return { approval, denied: true }
        }
        approval.role = command.role
        approval.state = approval.boundSubject
          ? OAuthApprovalState.BOUND
          : OAuthApprovalState.PENDING
        approval.authorizationRevision += 1
        approval.approvedAt = new Date()
        approval.revokedAt = undefined
        approval.roleChangedAt = new Date()
        approval.actorKind = actorKind
        approval.reason = command.reason
      }

      await approval.save({ session })
      await this.recordAudit(
        approval,
        OAuthAuthenticationAuditAction.APPROVAL_GRANTED,
        command.reason,
        OAuthAuthenticationAuditOutcome.SUCCESS,
        actorKind,
        session,
      )
      return { approval }
    })
    return this.commandResult(result)
  }

  async revoke(provider: string, email: string, reason: string) {
    this.validateCommand(provider, email, reason)
    const result = await this.serializedCommand(async (session) => {
      const approval = await this.activeApproval(provider, email, session)
      if (await this.protectLastAdministrator(approval, reason, session)) {
        return { approval, denied: true }
      }
      approval.state = OAuthApprovalState.REVOKED
      approval.revokedAt = new Date()
      approval.authorizationRevision += 1
      approval.actorKind = PRIVATE_SHELL_ACTOR
      approval.reason = reason
      await approval.save({ session })
      await this.recordAudit(
        approval,
        OAuthAuthenticationAuditAction.APPROVAL_REVOKED,
        reason,
        OAuthAuthenticationAuditOutcome.SUCCESS,
        PRIVATE_SHELL_ACTOR,
        session,
      )
      return { approval }
    })
    return this.commandResult(result)
  }

  async resetBinding(
    provider: string,
    email: string,
    reason: string,
    confirmed: boolean,
  ) {
    if (!confirmed) throw new Error('Binding reset requires --confirm-reset')
    this.validateCommand(provider, email, reason)
    const result = await this.serializedCommand(async (session) => {
      const approval = await this.activeApproval(provider, email, session)
      if (await this.protectLastAdministrator(approval, reason, session)) {
        return { approval, denied: true }
      }
      if (approval.boundSubject) {
        await this.bindings.deleteOne({ approvalId: approval._id }, { session })
      }
      approval.state = OAuthApprovalState.PENDING
      approval.boundSubject = undefined
      approval.userId = undefined
      approval.boundAt = undefined
      approval.authorizationRevision += 1
      approval.actorKind = PRIVATE_SHELL_ACTOR
      approval.reason = reason
      await approval.save({ session })
      await this.recordAudit(
        approval,
        OAuthAuthenticationAuditAction.BINDING_RESET,
        reason,
        OAuthAuthenticationAuditOutcome.SUCCESS,
        PRIVATE_SHELL_ACTOR,
        session,
      )
      return { approval }
    })
    return this.commandResult(result)
  }

  async list(provider: string, email?: string) {
    if (!this.providers.isEnabled(provider))
      throw new Error('Provider unavailable')
    const filter: Record<string, string> = { providerKey: provider }
    if (email) filter.normalizedEmail = normalizeOAuthEmail(email)
    const approvals = await this.approvals
      .find(filter)
      .sort({ normalizedEmail: 1 })
    return approvals.map((approval) =>
      this.safeApproval(approval, Boolean(email)),
    )
  }

  private async serializedCommand<T>(
    command: (
      session: ClientSession,
      invariant: OAuthPlatformAuthorityInvariantDocument,
    ) => Promise<T>,
  ) {
    await this.ensureAuthorityInvariant()
    return this.connection.transaction(async (session) => {
      const invariant = await this.authorityInvariant.findOneAndUpdate(
        { scope: PLATFORM_AUTHORITY_SCOPE },
        { $inc: { serializationRevision: 1 } },
        { new: true, session },
      )
      if (!invariant)
        throw new Error('Platform authority invariant unavailable')
      return command(session, invariant)
    })
  }

  private async ensureAuthorityInvariant() {
    try {
      await this.authorityInvariant.updateOne(
        { scope: PLATFORM_AUTHORITY_SCOPE },
        {
          $setOnInsert: {
            scope: PLATFORM_AUTHORITY_SCOPE,
            serializationRevision: 0,
            bootstrapCompleted: false,
          },
        },
        { upsert: true },
      )
    } catch (error) {
      if (!this.isDuplicateKey(error)) throw error
    }
  }

  private isDuplicateKey(error: unknown) {
    return Boolean(
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 11000,
    )
  }

  private async activeApproval(
    provider: string,
    email: string,
    session: ClientSession,
  ) {
    const approval = await this.approvals
      .findOne({
        providerKey: provider,
        normalizedEmail: normalizeOAuthEmail(email),
        state: { $ne: OAuthApprovalState.REVOKED },
      })
      .session(session)
    if (!approval) throw new Error('Active approval not found')
    return approval
  }

  private validateCommand(provider: string, email: string, reason: string) {
    if (!this.providers.isEnabled(provider))
      throw new Error('Provider unavailable')
    const normalizedEmail = normalizeOAuthEmail(email || '')
    if (!normalizedEmail.includes('@')) throw new Error('Email is invalid')
    if (!reason?.trim()) throw new Error('Reason is required')
  }

  private async protectLastAdministrator(
    approval: OAuthApprovalDocument,
    reason: string,
    session: ClientSession,
  ) {
    if (
      approval.role !== UserRole.ADMIN ||
      approval.state !== OAuthApprovalState.BOUND ||
      !(await this.isLastUsableAdministrator(approval, session))
    ) {
      return false
    }
    await this.recordAudit(
      approval,
      OAuthAuthenticationAuditAction.COMMAND_DENIED,
      reason,
      OAuthAuthenticationAuditOutcome.DENIED,
      PRIVATE_SHELL_ACTOR,
      session,
    )
    return true
  }

  private async isLastUsableAdministrator(
    approval: OAuthApprovalDocument,
    session: ClientSession,
  ) {
    if (!approval.userId) return false
    const boundAdministrators = await this.approvals
      .find({
        role: UserRole.ADMIN,
        state: OAuthApprovalState.BOUND,
        userId: { $exists: true },
      })
      .select({ userId: 1 })
      .session(session)
    const usableUserIds = await this.users
      .find({
        _id: { $in: boundAdministrators.map((candidate) => candidate.userId) },
        isBanned: { $ne: true },
      })
      .distinct('_id')
      .session(session)
    return (
      usableUserIds.some((userId) => userId.equals(approval.userId)) &&
      usableUserIds.length <= 1
    )
  }

  private async recordAudit(
    approval: OAuthApprovalDocument,
    action: OAuthAuthenticationAuditAction,
    reason: string,
    outcome: OAuthAuthenticationAuditOutcome,
    actorKind: string,
    session: ClientSession,
  ) {
    const event = new this.audits({
      providerKey: approval.providerKey,
      approvalId: approval._id,
      userId: approval.userId,
      action,
      outcome,
      verificationMetadata: {},
      actorKind,
      reason,
      authorizationRevision: approval.authorizationRevision,
      occurredAt: new Date(),
    })
    await event.save({ session })
    approval.auditEventIds ||= []
    approval.auditEventIds.push(event._id)
    await approval.save({ session })
  }

  private commandResult(result: CommandResult) {
    if (result.denied) throw new Error(LAST_ADMINISTRATOR_ERROR)
    return this.safeApproval(result.approval)
  }

  private safeApproval(approval: OAuthApprovalDocument, revealEmail = false) {
    const email = approval.normalizedEmail
    const [local, domain] = email.split('@')
    return {
      provider: approval.providerKey,
      email: revealEmail
        ? email
        : `${local.slice(0, 1)}***@${domain || 'invalid'}`,
      role: approval.role,
      state: approval.state,
      authorizationRevision: approval.authorizationRevision,
    }
  }
}
