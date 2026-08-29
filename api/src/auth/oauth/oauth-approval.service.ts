import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { UserRole } from '../../users/user-roles.enum'
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

const ACTOR = 'PRIVATE_SHELL_ADMIN'

export type ApprovalCommand = {
  provider: string
  email: string
  role: UserRole
  reason: string
  confirmPlatformAdmin?: boolean
}

@Injectable()
export class OAuthApprovalService {
  constructor(
    @InjectModel(OAuthApproval.name)
    private readonly approvals: Model<OAuthApprovalDocument>,
    @InjectModel(OAuthIdentityBinding.name)
    private readonly bindings: Model<OAuthIdentityBindingDocument>,
    @InjectModel(OAuthAuthenticationAuditEvent.name)
    private readonly audits: Model<OAuthAuthenticationAuditEventDocument>,
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

    const normalizedEmail = normalizeOAuthEmail(command.email)
    let approval = await this.approvals.findOne({
      providerKey: command.provider,
      normalizedEmail,
    })
    if (!approval) {
      approval = new this.approvals({
        providerKey: command.provider,
        normalizedEmail,
        role: command.role,
        state: OAuthApprovalState.PENDING,
        authorizationRevision: 1,
        approvedAt: new Date(),
        actorKind: ACTOR,
        reason: command.reason,
      })
    } else if (
      approval.state !== OAuthApprovalState.REVOKED &&
      approval.role === command.role
    ) {
      return this.safeApproval(approval)
    } else {
      approval.role = command.role
      approval.state = approval.boundSubject
        ? OAuthApprovalState.BOUND
        : OAuthApprovalState.PENDING
      approval.authorizationRevision += 1
      approval.approvedAt = new Date()
      approval.revokedAt = undefined
      approval.roleChangedAt = new Date()
      approval.actorKind = ACTOR
      approval.reason = command.reason
    }
    await approval.save()
    await this.audit(
      approval,
      OAuthAuthenticationAuditAction.APPROVAL_GRANTED,
      command.reason,
    )
    return this.safeApproval(approval)
  }

  async revoke(provider: string, email: string, reason: string) {
    const approval = await this.activeApproval(provider, email, reason)
    await this.protectLastAdministrator(approval)
    approval.state = OAuthApprovalState.REVOKED
    approval.revokedAt = new Date()
    approval.authorizationRevision += 1
    approval.reason = reason
    await approval.save()
    await this.audit(
      approval,
      OAuthAuthenticationAuditAction.APPROVAL_REVOKED,
      reason,
    )
    return this.safeApproval(approval)
  }

  async resetBinding(
    provider: string,
    email: string,
    reason: string,
    confirmed: boolean,
  ) {
    if (!confirmed) throw new Error('Binding reset requires --confirm-reset')
    const approval = await this.activeApproval(provider, email, reason)
    await this.protectLastAdministrator(approval)
    if (approval.boundSubject) {
      await this.bindings.deleteOne({ approvalId: approval._id })
    }
    approval.state = OAuthApprovalState.PENDING
    approval.boundSubject = undefined
    approval.userId = undefined
    approval.boundAt = undefined
    approval.authorizationRevision += 1
    approval.reason = reason
    await approval.save()
    await this.audit(
      approval,
      OAuthAuthenticationAuditAction.BINDING_RESET,
      reason,
    )
    return this.safeApproval(approval)
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

  private async activeApproval(
    provider: string,
    email: string,
    reason: string,
  ) {
    this.validateCommand(provider, email, reason)
    const approval = await this.approvals.findOne({
      providerKey: provider,
      normalizedEmail: normalizeOAuthEmail(email),
      state: { $ne: OAuthApprovalState.REVOKED },
    })
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

  private async protectLastAdministrator(approval: OAuthApprovalDocument) {
    if (
      approval.role === UserRole.ADMIN &&
      approval.state === OAuthApprovalState.BOUND &&
      (await this.approvals.countDocuments({
        role: UserRole.ADMIN,
        state: OAuthApprovalState.BOUND,
      })) <= 1
    ) {
      await this.audit(
        approval,
        OAuthAuthenticationAuditAction.COMMAND_DENIED,
        'last platform administrator safeguard',
        OAuthAuthenticationAuditOutcome.DENIED,
      )
      throw new Error('Cannot change the last usable platform administrator')
    }
  }

  private async audit(
    approval: OAuthApprovalDocument,
    action: OAuthAuthenticationAuditAction,
    reason: string,
    outcome = OAuthAuthenticationAuditOutcome.SUCCESS,
  ) {
    const event = await this.audits.create({
      providerKey: approval.providerKey,
      approvalId: approval._id,
      userId: approval.userId,
      action,
      outcome,
      verificationMetadata: {},
      actorKind: ACTOR,
      reason,
      authorizationRevision: approval.authorizationRevision,
      occurredAt: new Date(),
    })
    if (event?._id) {
      await this.approvals.updateOne(
        { _id: approval._id },
        { $addToSet: { auditEventIds: event._id } },
      )
    }
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
