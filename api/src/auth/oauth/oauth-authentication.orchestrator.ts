import { Injectable, UnauthorizedException } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import { ClientSession, Connection, Model } from 'mongoose'
import { User, UserDocument } from '../../users/schemas/user.schema'
import {
  OAuthApprovalState,
  OAuthAuthenticationAuditAction,
  OAuthAuthenticationAuditOutcome,
} from './oauth-authentication.enums'
import { VerifiedOAuthIdentity } from './oauth-provider.types'
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

const GENERIC_FAILURE = 'Authentication unavailable'

type AuthenticationRecord = {
  user: UserDocument
  authorizationRevision: number
}

@Injectable()
export class OAuthAuthenticationOrchestrator {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(OAuthApproval.name)
    private readonly approvals: Model<OAuthApprovalDocument>,
    @InjectModel(OAuthIdentityBinding.name)
    private readonly bindings: Model<OAuthIdentityBindingDocument>,
    @InjectModel(OAuthAuthenticationAuditEvent.name)
    private readonly audits: Model<OAuthAuthenticationAuditEventDocument>,
    @InjectModel(User.name) private readonly users: Model<UserDocument>,
    private readonly jwtService: JwtService,
  ) {}

  async authenticate(identity: VerifiedOAuthIdentity) {
    let record: AuthenticationRecord | undefined
    try {
      record = await this.connection.transaction((session) =>
        this.authenticateWithinTransaction(identity, session),
      )
    } catch {
      record = undefined
    }

    if (!record) {
      await this.recordDenied(identity)
      throw new UnauthorizedException(GENERIC_FAILURE)
    }

    const payload = {
      email: record.user.email,
      sub: record.user._id,
      oauthProvider: identity.providerKey,
      authorizationRevision: record.authorizationRevision,
    }
    return {
      accessToken: this.jwtService.sign(payload),
      user: this.safeUser(record.user),
    }
  }

  private async authenticateWithinTransaction(
    identity: VerifiedOAuthIdentity,
    session: ClientSession,
  ): Promise<AuthenticationRecord | undefined> {
    const approval = await this.approvals
      .findOne({
        providerKey: identity.providerKey,
        normalizedEmail: identity.normalizedEmail,
        state: {
          $in: [OAuthApprovalState.PENDING, OAuthApprovalState.BOUND],
        },
      })
      .session(session)
    if (!approval) return undefined

    let user: UserDocument
    let action = OAuthAuthenticationAuditAction.LOGIN_SUCCEEDED
    if (approval.state === OAuthApprovalState.PENDING) {
      user = await this.bindPendingApproval(identity, approval, session)
      action = OAuthAuthenticationAuditAction.IDENTITY_BOUND
    } else {
      user = await this.loadBoundUser(identity, approval, session)
    }

    user.role = approval.role
    user.lastLoginAt = new Date()
    if (!user.emailVerifiedAt) user.emailVerifiedAt = new Date()
    await user.save({ session })

    const audit = new this.audits({
      providerKey: identity.providerKey,
      approvalId: approval._id,
      userId: user._id,
      action,
      outcome: OAuthAuthenticationAuditOutcome.SUCCESS,
      verificationMetadata: identity.auditMetadata,
      occurredAt: new Date(),
    })
    await audit.save({ session })
    await this.approvals.updateOne(
      { _id: approval._id },
      { $addToSet: { auditEventIds: audit._id } },
      { session },
    )

    return {
      user,
      authorizationRevision: approval.authorizationRevision,
    }
  }

  private async bindPendingApproval(
    identity: VerifiedOAuthIdentity,
    approval: OAuthApprovalDocument,
    session: ClientSession,
  ) {
    // MongoDB does not support parallel operations on one transaction session.
    // Keep these conflict checks sequential so the replica-set deployment has
    // one deterministic operation in flight per session.
    const subjectBinding = await this.bindings
      .findOne({
        providerKey: identity.providerKey,
        providerSubject: identity.subject,
      })
      .session(session)
    const emailUser = await this.users
      .findOne({ email: identity.normalizedEmail })
      .session(session)
    // Existing email alone is never authority to link provider identities.
    if (subjectBinding || emailUser) throw new Error('identity conflict')

    const user = new this.users({
      email: identity.normalizedEmail,
      name: identity.normalizedEmail.split('@')[0],
      role: approval.role,
      emailVerifiedAt: new Date(),
      lastLoginAt: new Date(),
    })
    await user.save({ session })

    const binding = new this.bindings({
      providerKey: identity.providerKey,
      providerSubject: identity.subject,
      approvalId: approval._id,
      userId: user._id,
      boundAt: new Date(),
    })
    await binding.save({ session })

    const bound = await this.approvals.findOneAndUpdate(
      {
        _id: approval._id,
        state: OAuthApprovalState.PENDING,
        boundSubject: { $exists: false },
      },
      {
        $set: {
          state: OAuthApprovalState.BOUND,
          boundSubject: identity.subject,
          userId: user._id,
          boundAt: new Date(),
        },
      },
      { new: true, session },
    )
    if (!bound) throw new Error('approval already claimed')
    approval.state = bound.state
    approval.boundSubject = bound.boundSubject
    approval.userId = bound.userId
    approval.boundAt = bound.boundAt
    return user
  }

  private async loadBoundUser(
    identity: VerifiedOAuthIdentity,
    approval: OAuthApprovalDocument,
    session: ClientSession,
  ) {
    if (approval.boundSubject !== identity.subject || !approval.userId) {
      throw new Error('identity conflict')
    }
    const binding = await this.bindings
      .findOne({
        providerKey: identity.providerKey,
        providerSubject: identity.subject,
        approvalId: approval._id,
        userId: approval.userId,
      })
      .session(session)
    if (!binding) throw new Error('identity conflict')
    const user = await this.users.findById(approval.userId).session(session)
    if (!user || user.isBanned) throw new Error('identity unavailable')
    return user
  }

  private async recordDenied(identity: VerifiedOAuthIdentity) {
    try {
      await this.audits.create({
        providerKey: identity.providerKey,
        action: OAuthAuthenticationAuditAction.LOGIN_DENIED,
        outcome: OAuthAuthenticationAuditOutcome.DENIED,
        verificationMetadata: identity.auditMetadata,
        occurredAt: new Date(),
      })
    } catch {
      // Authentication remains fail-closed even if restricted audit storage is down.
    }
  }

  private safeUser(user: UserDocument) {
    const value = user.toObject()
    delete value.password
    return value
  }
}
