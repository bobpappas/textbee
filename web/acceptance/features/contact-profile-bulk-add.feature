Feature: B015 contact profile and group bulk add

  Scenario: Authorized operator renames a contact without editing its phone
    Given an authorized operator opens an active managed group roster
    When the operator changes a contact display name
    Then the updated name is shown and the mobile number remains read-only

  Scenario: CSV preview classifies every row without applying it
    Given an authorized operator selects a CSV with ready invalid and duplicate rows
    When the operator creates a bulk-add preview
    Then every row has an explicit classification and Apply requires consent affirmation

  Scenario: Affirmed ready rows apply with durable individual results
    Given a bulk-add preview contains one ready row
    When the operator affirms consent and applies the preview
    Then the final result reports the added invalid and duplicate rows separately
    And no login invitation email or SMS action is presented

  Scenario: Contact maintenance remains accessible on a narrow viewport
    Given an authorized operator uses a 320-pixel viewport
    When the operator opens contact rename and bulk-add controls
    Then the mobile number is labeled read-only and the page has no horizontal scrolling
