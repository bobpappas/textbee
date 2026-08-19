package com.vernu.sms.dtos

import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HeartbeatResponseDTOTest {
    @Test
    fun parsesApiIsoHeartbeatResponse() {
        val response = Gson().fromJson(
            """
                {
                  "success": true,
                  "fcmTokenUpdated": false,
                  "lastHeartbeat": "2026-08-19T23:31:04.123Z",
                  "name": "Gateway phone"
                }
            """.trimIndent(),
            HeartbeatResponseDTO::class.java
        )

        assertTrue(response.success)
        assertFalse(response.fcmTokenUpdated)
        assertEquals("2026-08-19T23:31:04.123Z", response.lastHeartbeat)
        assertEquals("Gateway phone", response.name)
    }
}
