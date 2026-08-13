Feature: B018 and B023 SMS consent and Text-to-Join operator safeguards

  Scenario: Manual consent requires an affirmative operator action
    Given an authorized roster manager opens an active group roster
    When the manager enters a contact without affirming consent
    Then the Add person action remains unavailable

  Scenario: Manual consent evidence is submitted with the roster mutation
    Given an authorized roster manager opens an active group roster
    When the manager affirms the approved statement and adds a contact
    Then the request records the affirmation and optional consent method note

  Scenario: Text-to-Join consent is visible without exposing message content
    Given an authorized operator opens a roster containing a Text-to-Join contact
    When the roster is displayed
    Then Text-to-Join is identified as the consent source
    And no original inbound message body is displayed

  Scenario: Missing consent remains visible to authorized operators
    Given an authorized operator opens a roster containing a contact without active group consent
    When the roster is displayed
    Then the contact is labeled as having no active group consent

  Scenario: Join advertising includes the required consumer disclosure
    Given an authorized operator opens an active group
    When the join command is displayed
    Then the operator sees variable frequency charges STOP HELP and support disclosure guidance

  Scenario: Archived join instructions are not advertised as active
    Given an administrator opens an archived group
    When the join instruction is displayed
    Then the instruction is labeled inactive and roster changes are unavailable
