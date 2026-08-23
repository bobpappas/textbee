Feature: B017 unified organization and group messaging workspace

  Background:
    Given an authenticated B017 organization administrator with synthetic messaging data

  Scenario: B017.1 Communications is the primary messaging workspace
    When primary messaging navigation is rendered
    Then Communications opens on Unread and Message History remains diagnostic

  Scenario: B017.2 Group navigation describes the whole workspace
    When the administrator opens the groups list
    Then active group actions say Open group and expose authorized workspace sections

  Scenario: B017.3 One group composer is reused
    When the administrator starts a new group message from Communications
    Then the exact join-code prefix and one-group preview controls are shown

  Scenario: B017.4 Conversation is chronological and durable
    When the administrator opens a synthetic contact conversation
    Then sent and received entries appear in chronological order with group context

  Scenario: B017.5 Organization boundary precedes inference
    When the administrator opens the synthetic organization inbox
    Then no foreign-organization contact or group is rendered

  Scenario: B017.6 Exact quote produces Confirmed attribution
    When the administrator opens a conversation with exact-message evidence
    Then Confirmed and the exact-message explanation are shown

  Scenario: B017.7 Recent send produces only Likely attribution
    When the administrator opens a conversation with recent-send evidence
    Then Likely and the inference explanation are shown

  Scenario: B017.8 Ambiguous and Unassigned remain honest
    When the administrator opens the ambiguity queue
    Then Ambiguous or Unassigned is shown without a Confirmed claim

  Scenario: B017.9 Unknown sender is restricted
    When the administrator opens the unassigned queue
    Then the unknown sender is masked and reply controls are absent

  Scenario: B017.10 Multi-group contact does not leak a conversation
    When a Group B operator opens Group B messages
    Then Group A-only message content is absent

  Scenario: B017.11 Group sender has bounded reply authority
    When a group sender opens the assigned group workspace
    Then Messages is available while People Settings and full numbers are absent

  Scenario: B017.12 Manual attribution is constrained and audited
    When an owner opens an Ambiguous candidate for the owned group
    Then the assign-to-group action is available before replying

  Scenario: B017.13 Commands win over conversation routing
    When command-classified synthetic history is opened
    Then no ordinary unread reply or reply composer is created for the command

  Scenario: B017.14 Reply rechecks every safety decision
    When an authorized operator previews an ineligible reply
    Then actionable eligibility guidance is shown and the draft remains

  Scenario: B017.15 Reply is prefixed and duplicate-safe
    When an authorized operator previews a valid individual reply
    Then the exact join-code-prefixed text is shown before confirmation

  Scenario: B017.16 Unread is personal and resolution is shared
    When an authorized operator opens group work
    Then Mark unread assignment and resolution controls are available

  Scenario: B017.17 Concurrent work fails clearly
    When a stale work-state update is rejected
    Then current work is refreshed without showing raw 409 or losing a draft

  Scenario: B017.18 Revocation clears visible data
    When the current group grant is revoked before refresh
    Then the thread becomes non-disclosing access denied

  Scenario: B017.19 Legacy history is not guessed into conversations
    When legacy diagnostic history has no durable group-delivery link
    Then it is absent from group conversations and remains in Message History

  Scenario: B017.20 Mobile and accessible states are complete
    When the operator opens a thread at 320 CSS pixels using keyboard controls
    Then the back control labels and live result regions are usable without horizontal overflow
