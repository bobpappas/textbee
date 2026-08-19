package com.vernu.sms.helpers

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DispatchAttemptValidatorTest {
    @Test
    fun acceptsOnlyIdentifiedUnexpiredAttempts() {
        assertTrue(DispatchAttemptValidator.isFresh("attempt-1", "120001", 120000))
        assertFalse(DispatchAttemptValidator.isFresh("attempt-1", "120000", 120000))
        assertFalse(DispatchAttemptValidator.isFresh(null, "120001", 120000))
        assertFalse(DispatchAttemptValidator.isFresh("attempt-1", "invalid", 120000))
    }
}
