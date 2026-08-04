Feature: B024 organization group roster management

  Scenario: Organization administrator creates a group
    Given an active organization administrator has one available receiving number
    When the administrator creates a valid group with a join code and selected owners
    Then one active organization-scoped group is displayed with its receiving number and canonical join command
    And no contact, SMS, application user, or operator approval is created

  Scenario: Group owner scope is limited
    Given an operator actively owns group A but not group B in the same organization
    When the operator lists groups or requests either roster
    Then group A and its roster are available without disclosing group B
    And ownership grants no organization-settings or operator-administration access

  Scenario: Cross-organization identifiers do not leak
    Given an authorized operator belongs to organization A
    When the operator supplies a group identifier from organization B
    Then the request receives the same non-disclosing result as an unknown identifier

  Scenario: Owner assignment is scoped and idempotent
    Given an organization administrator manages an active group
    When the administrator assigns an active organization operator twice and revokes one owner
    Then one active assignment exists and other owners remain unchanged

  Scenario: Contact is created without an account
    Given an authorized roster manager enters a valid display name and US number
    When the person is added to an active group
    Then one phone-only roster membership is displayed
    And no email, credential, Google identity, application user, or dashboard access is created

  Scenario: Existing contact is reused safely
    Given a contact in the organization already owns the normalized mobile number
    When an authorized roster manager adds that number to another authorized group
    Then the stored contact name is not silently overwritten and no duplicate is displayed

  Scenario: Removing a membership preserves the contact
    Given one contact belongs to two groups
    When an authorized manager removes the contact from one group with a reason
    Then only that group membership disappears and the confirmation preserves the organization contact

  Scenario: Phone validation is deterministic
    Given equivalent valid US phone formats and invalid non-US extension short-code or malformed values
    When contact input is validated
    Then invalid values do not produce a confirmed roster mutation

  Scenario: Join code uniqueness uses the receiving number
    Given two groups may belong to different organizations
    When both request the same canonical code on the same normalized receiving number
    Then the interface describes uniqueness for the gateway number without disclosing another group

  Scenario: Archived codes remain reserved
    Given an active group is archived by an organization administrator
    When the administrator views archived groups
    Then the archived command is labeled inactive and its settings remain visible

  Scenario: Archived groups are read-only
    Given a group is archived
    When an owner or administrator opens the archived group
    Then roster owner rename and join-setting changes are disabled and reactivation is offered to the administrator

  Scenario: Join settings change atomically
    Given an active organization administrator edits an active group
    When a valid available receiving-number and code pair is saved
    Then the exact updated command is displayed consistently

  Scenario: Revoked authority clears group data
    Given an owner has group and roster data rendered
    When the owner assignment or organization membership is revoked
    Then the next protected request is denied and stale group data is absent

  Scenario: Group management is responsive and accessible
    Given an authorized operator uses keyboard navigation at a 320-pixel viewport
    When the operator lists groups opens a roster and starts adding a person
    Then controls remain labeled and the page has no horizontal scrolling

  Scenario: B024 does not process text to join
    Given a group displays an active receiving number and join command
    When B024 group management is used
    Then no inbound SMS parser acknowledgement consent decision or automatic membership action is presented
