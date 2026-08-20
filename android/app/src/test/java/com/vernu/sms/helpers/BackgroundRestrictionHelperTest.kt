package com.vernu.sms.helpers

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class BackgroundRestrictionHelperTest {
    @Test
    fun defaultOptimizedProfileIsReadyWhenAndroidAllowsBackgroundWork() {
        assertFalse(
            BackgroundRestrictionHelper.isRestricted(
                platformBackgroundRestricted = false,
                appStandbyBucket = 10,
                restrictedBucket = 45
            )
        )
    }

    @Test
    fun reportsPlatformAndRestrictedStandbyStates() {
        assertTrue(
            BackgroundRestrictionHelper.isRestricted(
                platformBackgroundRestricted = true,
                appStandbyBucket = 10,
                restrictedBucket = 45
            )
        )
        assertTrue(
            BackgroundRestrictionHelper.isRestricted(
                platformBackgroundRestricted = false,
                appStandbyBucket = 45,
                restrictedBucket = 45
            )
        )
    }
}
