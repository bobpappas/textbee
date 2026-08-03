Feature: B022 organization context shell

  Scenario: One active membership displays server context
    Given an authenticated operator with one active organization context
    When the operator opens the dashboard
    Then the shell displays the active organization name and role
    And Organization profile navigation is available

  Scenario: Platform authority does not create organization context
    Given an authenticated platform administrator without organization access
    When the administrator opens the dashboard
    Then no organization identity or profile navigation is displayed
    And the platform Organizations registry remains available

  Scenario: Multiple memberships stop without selection
    Given an authenticated operator requiring organization selection
    When the operator opens an organization-aware route directly
    Then the page shows Organization selection required
    And no organization identity is disclosed

  Scenario: Revocation clears context and profile data
    Given an authenticated operator whose organization access will be revoked
    When the active organization profile is opened and context refreshes
    Then the page shows No organization access
    And stale organization identity and profile navigation are absent

  Scenario: A denied profile refresh never flashes cached identity
    Given an authenticated operator whose profile request is denied after context loads
    When the operator opens the denied organization profile
    Then loading hides the cached organization identity
    And the refreshed page shows No organization access

  Scenario: Mobile context is accessible without overflow
    Given an authenticated operator with one active organization context
    When the operator opens account navigation at 320 pixels
    Then mobile organization identity and profile navigation are available
    And the page has no horizontal overflow

  Scenario: Legacy requests remain organization-neutral
    Given an authenticated operator with one active organization context
    When the operator opens legacy message history
    Then legacy backend requests contain no organization selector
