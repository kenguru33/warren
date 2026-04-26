#include <Arduino.h>
#include "esp_camera.h"
#include "esp_http_server.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include "secrets.h"
#include "wifi_connect.h"

// AI Thinker ESP32-CAM pin map
#define PWDN_GPIO_NUM   32
#define RESET_GPIO_NUM  -1
#define XCLK_GPIO_NUM    0
#define SIOD_GPIO_NUM   26
#define SIOC_GPIO_NUM   27
#define Y9_GPIO_NUM     35
#define Y8_GPIO_NUM     34
#define Y7_GPIO_NUM     39
#define Y6_GPIO_NUM     36
#define Y5_GPIO_NUM     21
#define Y4_GPIO_NUM     19
#define Y3_GPIO_NUM     18
#define Y2_GPIO_NUM      5
#define VSYNC_GPIO_NUM  25
#define HREF_GPIO_NUM   23
#define PCLK_GPIO_NUM   22
#define FLASH_LED_PIN    4

static httpd_handle_t camera_httpd = NULL;

static String getDeviceId() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char id[24];
  snprintf(id, sizeof(id), "esp32cam-%02X%02X%02X", mac[3], mac[4], mac[5]);
  return String(id);
}

static bool initCamera() {
  camera_config_t config = {};
  config.ledc_channel    = LEDC_CHANNEL_0;
  config.ledc_timer      = LEDC_TIMER_0;
  config.pin_d0          = Y2_GPIO_NUM;
  config.pin_d1          = Y3_GPIO_NUM;
  config.pin_d2          = Y4_GPIO_NUM;
  config.pin_d3          = Y5_GPIO_NUM;
  config.pin_d4          = Y6_GPIO_NUM;
  config.pin_d5          = Y7_GPIO_NUM;
  config.pin_d6          = Y8_GPIO_NUM;
  config.pin_d7          = Y9_GPIO_NUM;
  config.pin_xclk        = XCLK_GPIO_NUM;
  config.pin_pclk        = PCLK_GPIO_NUM;
  config.pin_vsync       = VSYNC_GPIO_NUM;
  config.pin_href        = HREF_GPIO_NUM;
  config.pin_sscb_sda    = SIOD_GPIO_NUM;
  config.pin_sscb_scl    = SIOC_GPIO_NUM;
  config.pin_pwdn        = PWDN_GPIO_NUM;
  config.pin_reset       = RESET_GPIO_NUM;
  config.xclk_freq_hz    = 20000000;
  config.pixel_format    = PIXFORMAT_JPEG;

  if (psramFound()) {
    config.frame_size   = FRAMESIZE_SVGA;  // 800x600 — good balance of quality vs FPS
    config.jpeg_quality = 12;              // 10=highest quality/largest file; 12 cuts size ~30%
    config.fb_count     = 3;              // 3 buffers reduces stalls when frames queue up
  } else {
    config.frame_size   = FRAMESIZE_QVGA;  // 320x240 — fits in SRAM
    config.jpeg_quality = 15;
    config.fb_count     = 1;
  }

  if (esp_camera_init(&config) != ESP_OK) return false;

  // Disable CPU-intensive processing that doesn't help for live streaming
  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    s->set_lenc(s, 0);       // lens distortion correction — adds ~5 ms/frame
    s->set_raw_gma(s, 1);    // gamma correction in sensor hardware (free)
    s->set_aec2(s, 0);       // disable AEC DSP step — sensor AEC is enough
    s->set_gainceiling(s, GAINCEILING_4X);  // allow higher gain so shutter can be faster
  }

  return true;
}

static void connectWiFi() {
  connectWithFallback(SECRET_SSID, SECRET_PASS);
}

static esp_err_t streamHandler(httpd_req_t *req) {
  esp_err_t res;
  char header[80];

  httpd_resp_set_type(req, "multipart/x-mixed-replace; boundary=frame");
  httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");

  while (true) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) break;

    size_t hlen = snprintf(header, sizeof(header),
      "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %zu\r\n\r\n",
      fb->len);

    res = httpd_resp_send_chunk(req, header, hlen);
    if (res == ESP_OK)
      res = httpd_resp_send_chunk(req, (const char *)fb->buf, fb->len);
    if (res == ESP_OK)
      res = httpd_resp_send_chunk(req, "\r\n", 2);

    esp_camera_fb_return(fb);
    if (res != ESP_OK) break;
  }
  return res;
}

static esp_err_t captureHandler(httpd_req_t *req) {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Camera capture failed");
    return ESP_FAIL;
  }
  httpd_resp_set_type(req, "image/jpeg");
  httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
  httpd_resp_set_hdr(req, "Content-Disposition", "inline; filename=capture.jpg");
  esp_err_t res = httpd_resp_send(req, (const char *)fb->buf, fb->len);
  esp_camera_fb_return(fb);
  return res;
}

static void startServer() {
  httpd_config_t config   = HTTPD_DEFAULT_CONFIG();
  config.server_port      = 80;
  config.max_open_sockets = 5;
  config.lru_purge_enable = true;

  if (httpd_start(&camera_httpd, &config) != ESP_OK) {
    Serial.println("HTTP server failed to start");
    return;
  }

  const httpd_uri_t stream_uri  = {"/stream",  HTTP_GET, streamHandler,  NULL};
  const httpd_uri_t capture_uri = {"/capture", HTTP_GET, captureHandler, NULL};

  httpd_register_uri_handler(camera_httpd, &stream_uri);
  httpd_register_uri_handler(camera_httpd, &capture_uri);
}

static void announceToBackend() {
  if (WiFi.status() != WL_CONNECTED) return;

  String ip        = WiFi.localIP().toString();
  String deviceId  = getDeviceId();
  String streamUrl = "http://" + ip + "/stream";
  String snapUrl   = "http://" + ip + "/capture";
  String payload   =
    "{\"deviceId\":\"" + deviceId + "\","
    "\"type\":\"camera\","
    "\"streamUrl\":\"" + streamUrl + "\","
    "\"snapshotUrl\":\"" + snapUrl + "\"}";

  Serial.println("Registering with backend...");
  Serial.printf("  Device ID:   %s\n", deviceId.c_str());
  Serial.printf("  Stream URL:  %s\n", streamUrl.c_str());
  Serial.printf("  Snapshot URL:%s\n", snapUrl.c_str());
  Serial.printf("  Backend:     %s\n", BACKEND_URL);

  HTTPClient http;
  http.begin(String(BACKEND_URL) + "/api/sensors/announce");
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);
  Serial.printf("  Response:    HTTP %d\n", code);
  http.end();
}

void setup() {
  Serial.begin(115200);
  pinMode(FLASH_LED_PIN, OUTPUT);
  digitalWrite(FLASH_LED_PIN, LOW);

  if (!initCamera()) {
    Serial.println("Camera init failed — check module and wiring");
    return;
  }

  connectWiFi();
  startServer();

  Serial.printf("Stream:   http://%s/stream\n",   WiFi.localIP().toString().c_str());
  Serial.printf("Snapshot: http://%s/capture\n",  WiFi.localIP().toString().c_str());

  announceToBackend();
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
    announceToBackend();
  }
  delay(5000);
}
