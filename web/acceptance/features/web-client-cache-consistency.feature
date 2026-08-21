Feature: B031 web client cache consistency

  Scenario: Message history refreshes without duplicating rows
    Given an authenticated organization operator using mocked history data
    When the operator opens message history and requests a refresh
    Then exactly one additional message request is made
    And each server message is rendered once

  Scenario: Webhook history keys represent the complete request
    Given an authenticated organization operator using mocked history data
    When the operator opens webhook delivery history and requests a refresh
    Then the webhook request contains every active filter dimension
    And exactly one additional webhook request is made
