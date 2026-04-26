#pragma once

#ifndef UNIT_TEST
#  include <WiFi.h>
#  define WIFI_POLL_DELAY() delay(500)
#else
#  define WIFI_POLL_DELAY()
#endif

#ifndef WIFI_PRIMARY_TIMEOUT_MS
#  define WIFI_PRIMARY_TIMEOUT_MS 15000
#endif
#ifndef WIFI_FALLBACK_TIMEOUT_MS
#  define WIFI_FALLBACK_TIMEOUT_MS 10000
#endif

#define FALLBACK_SSID "Wokwi-GUEST"
#define FALLBACK_PASS ""

static bool tryConnectSSID(const char* ssid, const char* pass, unsigned long timeoutMs) {
  if (!ssid || ssid[0] == '\0') return false;
  WiFi.begin(ssid, pass);
  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < timeoutMs) {
    WIFI_POLL_DELAY();
    Serial.print(".");
  }
  return WiFi.status() == WL_CONNECTED;
}

static bool connectWithFallback(const char* ssid, const char* pass) {
  WiFi.mode(WIFI_STA);
  Serial.printf("[WiFi] Connecting to %s...\n", ssid && ssid[0] ? ssid : "(none)");

  if (tryConnectSSID(ssid, pass, WIFI_PRIMARY_TIMEOUT_MS)) {
    Serial.printf("\n[WiFi] Connected to %s, IP: %s\n",
                  WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
    return true;
  }

  Serial.printf("\n[WiFi] Primary failed, trying %s...\n", FALLBACK_SSID);
  WiFi.disconnect();

  if (tryConnectSSID(FALLBACK_SSID, FALLBACK_PASS, WIFI_FALLBACK_TIMEOUT_MS)) {
    Serial.printf("\n[WiFi] Connected to %s, IP: %s\n",
                  WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
    return true;
  }

  Serial.println("[WiFi] ERROR: Could not connect to any network");
  return false;
}
