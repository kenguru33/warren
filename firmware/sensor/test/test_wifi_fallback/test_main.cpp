#include "mock_wifi.h"
#include "../../include/wifi_connect.h"
#include <unity.h>

WiFiClass WiFi;

void setUp() { WiFi.reset(); }
void tearDown() {}

void test_primary_succeeds() {
  WiFi.connectOnCall[0] = true;
  bool result = connectWithFallback("MyNetwork", "password");
  TEST_ASSERT_TRUE(result);
  TEST_ASSERT_EQUAL(1, WiFi.beginCallCount);
  TEST_ASSERT_EQUAL_STRING("MyNetwork", WiFi.lastSSID.c_str());
}

void test_fallback_when_primary_fails() {
  WiFi.connectOnCall[1] = true;
  bool result = connectWithFallback("MyNetwork", "password");
  TEST_ASSERT_TRUE(result);
  TEST_ASSERT_EQUAL(2, WiFi.beginCallCount);
  TEST_ASSERT_EQUAL_STRING("Wokwi-GUEST", WiFi.lastSSID.c_str());
}

void test_both_fail() {
  bool result = connectWithFallback("MyNetwork", "password");
  TEST_ASSERT_FALSE(result);
  TEST_ASSERT_EQUAL(2, WiFi.beginCallCount);
}

void test_empty_ssid_skips_to_fallback() {
  WiFi.connectOnCall[0] = true;
  bool result = connectWithFallback("", "");
  TEST_ASSERT_TRUE(result);
  TEST_ASSERT_EQUAL(1, WiFi.beginCallCount);
  TEST_ASSERT_EQUAL_STRING("Wokwi-GUEST", WiFi.lastSSID.c_str());
}

int main() {
  UNITY_BEGIN();
  RUN_TEST(test_primary_succeeds);
  RUN_TEST(test_fallback_when_primary_fails);
  RUN_TEST(test_both_fail);
  RUN_TEST(test_empty_ssid_skips_to_fallback);
  return UNITY_END();
}
