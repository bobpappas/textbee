package com.vernu.sms.helpers

object DispatchAttemptValidator {
    fun isFresh(attemptId: String?, expiresAt: String?, nowMillis: Long): Boolean {
        if (attemptId.isNullOrBlank() || expiresAt.isNullOrBlank()) return false
        val expiresAtMillis = expiresAt.toLongOrNull() ?: return false
        return expiresAtMillis > nowMillis
    }
}
