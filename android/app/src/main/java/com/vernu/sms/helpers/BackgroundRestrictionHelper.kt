package com.vernu.sms.helpers

import android.app.ActivityManager
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Build

object BackgroundRestrictionHelper {
    fun isRestricted(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return false

        val activityManager = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val usageStatsManager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        return isRestricted(
            activityManager.isBackgroundRestricted,
            usageStatsManager.appStandbyBucket,
            UsageStatsManager.STANDBY_BUCKET_RESTRICTED
        )
    }

    fun isRestricted(
        platformBackgroundRestricted: Boolean,
        appStandbyBucket: Int,
        restrictedBucket: Int
    ): Boolean = platformBackgroundRestricted || appStandbyBucket >= restrictedBucket
}
