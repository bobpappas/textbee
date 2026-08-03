Feature: B020 organization registry vertical slice

  Scenario Outline: Platform administrator creates a durable organization
    Given an authenticated platform administrator
    And an empty organization registry
    When the administrator opens the organization registry
    And creates organization <organization_name>
    Then organization <organization_name> appears after server confirmation
    And organization <organization_name> remains after a browser refresh

    Examples:
      | organization_name       |
      | Boise Church of Christ  |

  Scenario: Ordinary user is denied without disclosure
    Given an authenticated ordinary user
    And a forbidden organization registry API
    When the user opens the organization registry directly
    Then the organization registry shows access denied
    And no organization registry data is disclosed

  Scenario Outline: Organization administrator renames after server confirmation
    Given an authenticated platform administrator
    And an empty organization registry
    When the administrator opens the organization registry
    And creates organization <organization_name>
    And opens the created organization profile
    And renames the organization to <renamed_name>
    Then the profile shows server-confirmed name <renamed_name>
    And server-confirmed name <renamed_name> remains after a browser refresh

    Examples:
      | organization_name         | renamed_name  |
      | Boise Church of Christ    | Boise Church  |

  Scenario: Registry is keyboard reachable at 375 pixels
    Given an authenticated platform administrator
    And an empty organization registry
    When the administrator opens the organization registry at 375 pixels
    Then the registry has no horizontal page overflow
    And the Organizations command is keyboard searchable
