#include <Arduino.h>
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <PubSubClient.h>
  #include <ArduinoJson.h>
  #include <math.h>
  #include "DHTesp.h"
  #include "secrets.h"

  // -------------------- WiFi --------------------
  const char* ssid = SECRET_SSID;
  const char* password = SECRET_PASS;

  // -------------------- MQTT --------------------
  const char* mqtt_server = MQTT_SERVER;
  const char* mqtt_user = MQTT_USER;
  const char* mqtt_password = MQTT_PASS;
  const uint16_t mqtt_port = 1883;

  // -------------------- Pins --------------------
  const int DHT_PIN = 21;
  const int FAN_PIN = 4;
  const int HEATER_PIN = 19;

  // -------------------- Objects --------------------
  DHTesp dhtSensor;
  WiFiClient espClient;
  PubSubClient client(espClient);

  // -------------------- Queue --------------------
  QueueHandle_t sensorQueue;

  // -------------------- Data --------------------
  typedef struct {
    float temperature;
    float humidity;
  } SensorData;

  // -------------------- Device ID --------------------
  String deviceId;

  // -------------------- Target (from backend) --------------------
  // NAN means "no target, use hardcoded fallback thresholds"
  volatile float targetTemp = NAN;

  String getDeviceId() {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char id[18];
    snprintf(id, sizeof(id), "esp32-%02x%02x%02x", mac[3], mac[4], mac[5]);
    return String(id);
  }

  // -------------------- Forward declarations --------------------
  void ensureWiFiConnected();
  bool ensureMQTTConnected();
  void mqttCallback(char* topic, byte* payload, unsigned int length);
  void fetchTargetTemp();

  // -------------------- WiFi --------------------
  void ensureWiFiConnected() {
    if (WiFi.status() == WL_CONNECTED) return;

    Serial.println("[WiFi] Connecting...");
    WiFi.mode(WIFI_STA);
    WiFi.begin(ssid, password);

    unsigned long startAttemptTime = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startAttemptTime < 15000) {
      vTaskDelay(pdMS_TO_TICKS(500));
      Serial.print(".");
    }

    if (WiFi.status() == WL_CONNECTED) {
      Serial.println();
      Serial.println("[WiFi] Connected");
      Serial.print("[WiFi] IP: ");
      Serial.println(WiFi.localIP());
    } else {
      Serial.println();
      Serial.println("[WiFi] Failed to connect");
    }
  }

  // -------------------- MQTT --------------------
  bool ensureMQTTConnected() {
    if (client.connected()) return true;
    if (WiFi.status() != WL_CONNECTED) return false;

    Serial.println("[MQTT] Connecting...");

    String clientId = "ESP32Client-";
    clientId += String((uint32_t)ESP.getEfuseMac(), HEX);

    bool ok = client.connect(clientId.c_str(), mqtt_user, mqtt_password);

    if (ok) {
      Serial.println("[MQTT] Connected");
      client.subscribe("home/temperature");
      client.subscribe("home/humidity");
      client.subscribe("home/cmd/#");
      return true;
    } else {
      Serial.print("[MQTT] Failed, rc=");
      Serial.println(client.state());
      return false;
    }
  }

  void mqttCallback(char* topic, byte* payload, unsigned int length) {
    Serial.print("[MQTT] Received on ");
    Serial.print(topic);
    Serial.print(": ");
    for (unsigned int i = 0; i < length; i++) Serial.print((char)payload[i]);
    Serial.println();

    if (strcmp(topic, "home/temperature") == 0 && length > 0) {
      float tempValue = String((char*)payload, length).toFloat();

      float t = targetTemp;
      float heaterOn, heaterOff, fanOn;
      if (!isnan(t)) {
        heaterOn  = t - 2.0;
        heaterOff = t + 2.0;
        fanOn     = t + 10.0;
      } else {
        heaterOn = 18.0; heaterOff = 22.0; fanOn = 30.0;
      }

      digitalWrite(FAN_PIN, tempValue > fanOn ? HIGH : LOW);
      Serial.println(tempValue > fanOn ? "[MQTT] Fan ON" : "[MQTT] Fan OFF");

      if (tempValue > heaterOn && tempValue < heaterOff) {
        Serial.println("[MQTT] Temperature is comfortable");
      } else if (tempValue <= heaterOn) {
        Serial.println("[MQTT] Temperature is too cold");
        digitalWrite(HEATER_PIN, HIGH);
      } else {
        Serial.println("[MQTT] Temperature is too hot");
        digitalWrite(HEATER_PIN, LOW);
      }
    } else if (strcmp(topic, "home/humidity") == 0) {
      // Handle humidity command
    } else if (strncmp(topic, "home/cmd/", 9) == 0) {
      // Handle other commands
    }
  }

  // -------------------- Target fetch --------------------
  void fetchTargetTemp() {
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    String url = String(BACKEND_URL) + "/api/sensors/target/" + deviceId;
    http.begin(url);
    int code = http.GET();

    if (code != 200) {
      Serial.printf("[Target] HTTP %d — keeping previous target\n", code);
      http.end();
      return;
    }

    String body = http.getString();
    http.end();

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, body);
    if (err) {
      Serial.printf("[Target] JSON parse error: %s\n", err.c_str());
      return;
    }

    if (doc["refTemp"].isNull()) {
      targetTemp = NAN;
      Serial.println("[Target] no target (null) — using hardcoded fallback");
    } else {
      targetTemp = doc["refTemp"].as<float>();
      Serial.printf("[Target] fetched refTemp=%.2f\n", (float)targetTemp);
    }
  }

  // -------------------- TASK: TARGET --------------------
  void taskFetchTarget(void *pvParameters) {
    while (true) {
      if (WiFi.status() == WL_CONNECTED) {
        fetchTargetTemp();
      }
      vTaskDelay(pdMS_TO_TICKS(60000));
    }
  }

  // -------------------- TASK: SENSOR --------------------
  void taskReadSensor(void *pvParameters) {
    SensorData data;

    while (true) {
      TempAndHumidity values = dhtSensor.getTempAndHumidity();
      data.temperature = values.temperature;
      data.humidity = values.humidity;

      if (!isnan(data.temperature) && !isnan(data.humidity)) {
        if (xQueueSend(sensorQueue, &data, pdMS_TO_TICKS(100)) != pdPASS) {
          Serial.println("[Sensor] Queue full, dropping sample");
        } else {
          Serial.printf("[Sensor] Read T=%.2f H=%.2f\n", data.temperature, data.humidity);
        }
      } else {
        Serial.println("[Sensor] Failed to read from DHT");
      }

      vTaskDelay(pdMS_TO_TICKS(5000));
    }
  }

  // -------------------- TASK: MQTT --------------------
  void taskMQTT(void *pvParameters) {
    SensorData data;
    unsigned long lastReconnectAttempt = 0;

    while (true) {
      if (WiFi.status() != WL_CONNECTED) {
        ensureWiFiConnected();
        vTaskDelay(pdMS_TO_TICKS(1000));
        continue;
      }

      if (!client.connected()) {
        unsigned long now = millis();
        if (now - lastReconnectAttempt >= 3000) {
          lastReconnectAttempt = now;
          ensureMQTTConnected();
        }
        vTaskDelay(pdMS_TO_TICKS(250));
        continue;
      }

      client.loop();

      if (xQueueReceive(sensorQueue, &data, pdMS_TO_TICKS(100)) == pdPASS) {
        char tempStr[16];
        char humStr[16];
        snprintf(tempStr, sizeof(tempStr), "%.2f", data.temperature);
        snprintf(humStr, sizeof(humStr), "%.2f", data.humidity);

        String base = "warren/sensors/" + deviceId + "/";
        bool tOk = client.publish((base + "temperature").c_str(), tempStr, true);
        bool hOk = client.publish((base + "humidity").c_str(), humStr, true);

        if (tOk && hOk) {
          Serial.printf("[MQTT] Published T=%s H=%s to %s\n", tempStr, humStr, base.c_str());
        } else {
          Serial.println("[MQTT] Publish failed");
        }
      }

      vTaskDelay(pdMS_TO_TICKS(10));
    }
  }

  // -------------------- SETUP --------------------
  void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println();
    Serial.println("Starting...");

    pinMode(FAN_PIN, OUTPUT);
    pinMode(HEATER_PIN, OUTPUT);

    WiFi.mode(WIFI_STA);

    client.setServer(mqtt_server, mqtt_port);
    client.setCallback(mqttCallback);
    client.setKeepAlive(15);
    client.setSocketTimeout(5);

    dhtSensor.setup(DHT_PIN, DHTesp::DHT22);

    sensorQueue = xQueueCreate(5, sizeof(SensorData));
    if (sensorQueue == NULL) {
      Serial.println("Failed to create queue");
      while (true) delay(1000);
    }

    ensureWiFiConnected();
    deviceId = getDeviceId();
    if (strcmp(ssid, "Wokwi-GUEST") == 0) {
      deviceId = "wokwi-" + String(random(1000, 9999));
    }
    Serial.printf("[Device] ID: %s\n", deviceId.c_str());

    xTaskCreatePinnedToCore(taskReadSensor,  "SensorTask", 4096, NULL, 1, NULL, 1);
    xTaskCreatePinnedToCore(taskMQTT,        "MQTTTask",   6144, NULL, 1, NULL, 0);
    xTaskCreatePinnedToCore(taskFetchTarget, "TargetTask", 6144, NULL, 1, NULL, 0);
  }

  // -------------------- LOOP --------------------
  void loop() {
    vTaskDelay(pdMS_TO_TICKS(1000));
  }