#pragma once
#include <cstdarg>
#include <cstdio>
#include <cstring>
#include <chrono>
#include <string>

inline unsigned long millis() {
  using namespace std::chrono;
  return (unsigned long)duration_cast<milliseconds>(
    steady_clock::now().time_since_epoch()
  ).count();
}

struct MockSerial {
  void print(const char*) {}
  void print(char) {}
  void println(const char* = "") {}
  void printf(const char*, ...) {}
};
inline MockSerial Serial;

struct IPAddress {
  std::string toString() const { return "192.168.1.1"; }
};

enum wl_status_t { WL_CONNECTED = 3, WL_DISCONNECTED = 6 };
enum WiFiMode_t { WIFI_STA = 1 };

class WiFiClass {
public:
  int beginCallCount = 0;
  std::string lastSSID;
  bool connectOnCall[8] = {};

  void reset() {
    beginCallCount = 0;
    lastSSID.clear();
    for (auto& b : connectOnCall) b = false;
  }

  void begin(const char* ssid, const char*) {
    lastSSID = ssid ? ssid : "";
    beginCallCount++;
  }

  wl_status_t status() const {
    int idx = beginCallCount - 1;
    if (idx >= 0 && idx < 8 && connectOnCall[idx]) return WL_CONNECTED;
    return WL_DISCONNECTED;
  }

  void mode(WiFiMode_t) {}
  void disconnect() {}
  std::string SSID() const { return lastSSID; }
  IPAddress localIP() const { return {}; }
};

extern WiFiClass WiFi;
