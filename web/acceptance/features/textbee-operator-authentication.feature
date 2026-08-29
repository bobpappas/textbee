Feature: B009 administrator-approved operator authentication

  Scenario: Provider architecture precedes Google enablement
    Given the provider-neutral authentication core is installed
    When Google is enabled as the only configured provider
    Then all credentials pass through the shared approval orchestrator

  Scenario: Approved Google identity binds once
    Given an exact pending Google approval
    When a valid verified Google identity authenticates
    Then one stable provider subject is bound before a session is issued

  Scenario: Domain membership is not approval
    Given no exact approval for a verified Google identity
    When the identity belongs to any hosted domain
    Then authentication fails without creating a user or approval

  Scenario: Approved external-domain account works
    Given an exact approval outside boisecoc.org
    When its Google token matches the configured audience
    Then it follows the same approval and binding flow

  Scenario: Token validation fails closed
    Given a malformed or unverifiable Google token
    When Google verification is attempted
    Then one generic failure is returned without identity mutation

  Scenario: Stable subject prevents email takeover
    Given an approval bound to one Google subject
    When the same email is presented by a different subject
    Then authentication fails without replacing the binding

  Scenario: Concurrent first login has one winner
    Given one pending approval receives competing subjects
    When both first-login transactions run
    Then unique bindings and conditional approval update allow at most one winner

  Scenario: Approval role is not organization authority
    Given a Google operator has an application approval
    When no organization membership grants access
    Then authentication creates no organization membership or grant

  Scenario: Revocation invalidates existing sessions
    Given an approved operator has an issued API session
    When the approval revision changes or is revoked
    Then the next protected request rejects the stale session

  Scenario: Public account creation paths are disabled
    Given the public Google login page
    When password registration reset verification and legacy Google paths are inspected
    Then only the approval-gated OAuth login remains usable

  Scenario: Trusted shell restores platform authority
    Given no usable platform administrator remains
    When the trusted shell explicitly approves a Google ADMIN identity
    Then the approval is audited without creating a password or session

  Scenario: Routine last-administrator changes fail safe
    Given one usable platform administrator remains
    When a routine revoke or binding reset is attempted
    Then the change is denied and audited

  Scenario: Public activation inventory has no legacy blocker
    Given the reviewed B037 TextBee candidate
    When the operations route inventory runs in activation mode
    Then one typed OAuth approval login and no legacy auth route are present
