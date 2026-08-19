package com.vernu.sms.services

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.vernu.sms.AppConstants
import com.vernu.sms.R
import com.vernu.sms.activities.MainActivity
import com.vernu.sms.helpers.HeartbeatHelper
import com.vernu.sms.helpers.HeartbeatManager
import com.vernu.sms.helpers.SharedPreferenceHelper
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit

class StickyNotificationService : Service() {
    companion object {
        private const val TAG = "StickyNotificationService"
        private const val NOTIFICATION_CHANNEL_ID = "stickyNotificationChannel"
        private const val NOTIFICATION_ID = 1
        private const val HEARTBEAT_INTERVAL_MINUTES = 15L
    }

    private var heartbeatExecutor: ScheduledExecutorService? = null

    override fun onBind(intent: Intent): IBinder? {
        Log.i(TAG, "Service onBind ${intent.action}")
        return null
    }

    override fun onCreate() {
        super.onCreate()
        Log.i(TAG, "Service Started")
        SharedPreferenceHelper.setSharedPreferenceBoolean(
            applicationContext,
            AppConstants.SHARED_PREFS_RELIABILITY_SERVICE_ACTIVE_KEY,
            false
        )

        val gatewayEnabled = SharedPreferenceHelper.getSharedPreferenceBoolean(
            applicationContext, AppConstants.SHARED_PREFS_GATEWAY_ENABLED_KEY, false
        )

        if (gatewayEnabled) {
            val notification = createNotification()
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_REMOTE_MESSAGING)
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
                SharedPreferenceHelper.setSharedPreferenceBoolean(
                    applicationContext,
                    AppConstants.SHARED_PREFS_RELIABILITY_SERVICE_ACTIVE_KEY,
                    true
                )
                HeartbeatManager.scheduleHeartbeat(applicationContext)
                startHeartbeatLoop()
                Log.i(TAG, "Started required gateway reliability service")
            } catch (e: Exception) {
                // ForegroundServiceStartNotAllowedException on API 31+ when app is in background
                Log.w(TAG, "Cannot start foreground service (likely background restriction): ${e.message}")
                stopSelf()
            }
        } else {
            Log.i(TAG, "Gateway disabled; reliability service stopping")
            stopSelf()
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.i(TAG, "Received start id $startId: $intent")
        return START_STICKY
    }

    override fun onDestroy() {
        heartbeatExecutor?.shutdownNow()
        SharedPreferenceHelper.setSharedPreferenceBoolean(
            applicationContext,
            AppConstants.SHARED_PREFS_RELIABILITY_SERVICE_ACTIVE_KEY,
            false
        )
        super.onDestroy()
        Log.i(TAG, "StickyNotificationService destroyed")
    }

    private fun startHeartbeatLoop() {
        val deviceId = SharedPreferenceHelper.getSharedPreferenceString(
            applicationContext, AppConstants.SHARED_PREFS_DEVICE_ID_KEY, ""
        ) ?: ""
        val apiKey = SharedPreferenceHelper.getSharedPreferenceString(
            applicationContext, AppConstants.SHARED_PREFS_API_KEY_KEY, ""
        ) ?: ""
        heartbeatExecutor = Executors.newSingleThreadScheduledExecutor()
        heartbeatExecutor?.scheduleWithFixedDelay(
            {
                if (HeartbeatHelper.isDeviceEligibleForHeartbeat(applicationContext)) {
                    HeartbeatHelper.sendHeartbeat(applicationContext, deviceId, apiKey)
                }
            },
            0,
            HEARTBEAT_INTERVAL_MINUTES,
            TimeUnit.MINUTES
        )
    }

    private fun createNotification(): Notification {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                NOTIFICATION_CHANNEL_ID, "Gateway Reliability", NotificationManager.IMPORTANCE_LOW
            ).apply {
                enableVibration(false)
                setShowBadge(false)
            }
            notificationManager.createNotificationChannel(channel)

            val pendingIntent = PendingIntent.getActivity(
                this, 0,
                Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            Notification.Builder(this, NOTIFICATION_CHANNEL_ID)
                .setContentTitle("TextBee Active")
                .setContentText("SMS gateway service is active")
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setSmallIcon(R.mipmap.ic_launcher)
                .build()
        } else {
            @Suppress("DEPRECATION")
            NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
                .setContentTitle("TextBee Active")
                .setContentText("SMS gateway service is active")
                .setOngoing(true)
                .setSmallIcon(R.mipmap.ic_launcher)
                .build()
        }
    }
}
