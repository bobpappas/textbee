Feature: B014 organization operators and resource ownership

  Scenario: Organization administrator accesses an organization resource
    Given an active organization administrator in organization alpha
    When the operator requests an alpha device
    Then the request is authorized and attributed to that operator

  Scenario Outline: Membership status controls organization access
    Given an operator with <membership_status> membership in organization alpha
    When the operator requests an alpha message
    Then organization access is <access_result>

    Examples:
      | membership_status | access_result |
      | active            | authorized    |
      | suspended         | denied        |
      | revoked           | denied        |
      | absent            | denied        |

  Scenario Outline: Organization predicates isolate resources
    Given an active alpha operator requests a resource in <resource_organization>
    When the organization-scoped resource query runs
    Then the resource result is <resource_result>

    Examples:
      | resource_organization | resource_result |
      | alpha                 | returned        |
      | beta                  | undisclosed     |

  Scenario Outline: Client and legacy role claims are not authority
    Given a user without an organization grant supplies <client_claims> claims
    And the legacy user role is ADMIN
    When the user requests organization data
    Then the request is denied for <client_claims> claims

    Examples:
      | client_claims |
      | accurate      |
      | missing       |
      | forged        |

  Scenario: A contact remains separate from an application user
    Given a contact shares identity text with an application user
    When the contact is created or changed
    Then no login allowlist membership or grant changes

  Scenario Outline: Inactive membership invalidates an existing session
    Given an operator session contains a stale role claim
    When membership becomes <membership_status>
    Then the next organization request is denied and history remains attributed

    Examples:
      | membership_status |
      | suspended         |
      | revoked           |

  Scenario Outline: Gateway credentials are least privileged
    Given an alpha gateway key attempts <gateway_operation>
    When gateway scope and organization are evaluated
    Then the gateway operation is <access_result>

    Examples:
      | gateway_operation       | access_result |
      | alpha heartbeat         | authorized    |
      | beta heartbeat          | denied        |
      | operator administration | denied        |
      | contact export          | denied        |

  Scenario Outline: Last administrator protection is atomic
    Given administrator safety state <administrator_state>
    When an administrator demotion is attempted
    Then the demotion is <change_result> with a secret-safe audit event

    Examples:
      | administrator_state          | change_result |
      | another usable administrator | applied       |
      | last usable administrator    | rejected      |

  Scenario: Existing gateway data survives migration
    Given a development gateway key and message history exist
    When the records migrate to organization alpha
    Then identifiers and key hashes remain stable within alpha

  Scenario Outline: First organization migration is idempotent and safe
    Given migration state <migration_state>
    When the first organization migration runs
    Then migration reports <migration_result> without secrets

    Examples:
      | migration_state       | migration_result      |
      | dry run               | no writes             |
      | first apply           | assigned               |
      | identical rerun       | already assigned       |
      | ambiguous ownership   | rejected               |
      | partial failure       | rolled back            |
      | no usable administrator | rejected             |

  Scenario: Organization context controls dashboard navigation
    Given an authenticated operator with limited organization capabilities
    When the operator opens the dashboard
    Then only capability-authorized navigation is visible

  Scenario: No membership shows no organization access
    Given an approved user without active organization membership
    When the user opens the dashboard
    Then the no organization access state exposes only refresh and logout

  Scenario: Administrator manages an operator by exact email
    Given an organization administrator opens Operator Access
    When the administrator adds an approved exact email with a reason
    Then server-confirmed operator state is displayed

  Scenario: Access revocation clears a rendered dashboard
    Given an operator has rendered organization data
    When another administrator revokes that membership
    Then the next request clears cached data and privileged navigation

  Scenario: Group sender has send-only authority
    Given an operator is sender only for group alpha
    When the sender opens the assigned group
    Then minimum audience data is visible and roster controls are hidden

  Scenario: New operator starts without privilege
    Given an administrator adds an approved operator by normalized email
    When no role assignment accompanies the membership
    Then the dashboard shows No permissions assigned
