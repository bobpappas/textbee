package com.vernu.sms;

import org.junit.Test;

import java.net.URI;

import static org.junit.Assert.*;

/**
 * Example local unit test, which will execute on the development machine (host).
 *
 * @see <a href="http://d.android.com/tools/testing">Testing documentation</a>
 */
public class ExampleUnitTest {
    @Test
    public void buildConfigurationMatchesFlavorContract() throws Exception {
        URI apiBaseUrl = new URI(BuildConfig.API_BASE_URL);

        assertTrue(apiBaseUrl.getScheme().equals("http") || apiBaseUrl.getScheme().equals("https"));
        assertNotNull(apiBaseUrl.getHost());
        assertTrue(apiBaseUrl.getPath().endsWith("/api/v1/"));

        if ("development".equals(BuildConfig.ENVIRONMENT)) {
            assertEquals("com.bobpappas.textbee.dev", BuildConfig.APPLICATION_ID);
            assertNotEquals("api.dev.textbee.dev", apiBaseUrl.getHost());
            assertNotEquals("api.textbee.dev", apiBaseUrl.getHost());
        } else {
            assertEquals("production", BuildConfig.ENVIRONMENT);
            assertEquals("com.bobpappas.textbee", BuildConfig.APPLICATION_ID);
            assertEquals("https://textbee.bobpappas.com/api/v1/", BuildConfig.API_BASE_URL);
        }
    }
}
