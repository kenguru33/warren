#include <Arduino.h>
  #include <WiFi.h>
  #include <PubSubClient.h>
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

      digitalWrite(FAN_PIN, tempValue > 30.0 ? HIGH : LOW);
      Serial.println(tempValue > 30.0 ? "[MQTT] Fan ON" : "[MQTT] Fan OFF");

      if (tempValue > 18.0 && tempValue < 22.0) {
        Serial.println("[MQTT] Temperature is comfortable");
      } else if (tempValue <= 18.0) {
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

        String base = "homenut/sensors/" + deviceId + "/";
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
    Serial.printf("[Device] ID: %s\n", deviceId.c_str());

    xTaskCreatePinnedToCore(taskReadSensor, "SensorTask", 4096, NULL, 1, NULL, 1);
    xTaskCreatePinnedToCore(taskMQTT,       "MQTTTask",   6144, NULL, 1, NULL, 0);
  }

  // -------------------- LOOP --------------------
  void loop() {
    vTaskDelay(pdMS_TO_TICKS(1000));
  }