#include <Arduino.h>
  #include <WiFi.h>
  #include <HTTPClient.h>
  #include <PubSubClient.h>
  #include <ArduinoJson.h>
  #include <Preferences.h>
  #include <math.h>
  #include "DHTesp.h"
  #include "secrets.h"
  #include "wifi_connect.h"

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
  const int FAN_PIN = 19;
  const int HEATER_PIN = 4;

  // -------------------- Objects --------------------
  DHTesp dhtSensor;
  WiFiClient espClient;
  PubSubClient client(espClient);
  Preferences prefs;

  // -------------------- Queue --------------------
  QueueHandle_t sensorQueue;

  // -------------------- Data --------------------
  typedef struct {
    float temperature;
    float humidity;
  } SensorData;

  // -------------------- Device ID --------------------
  String deviceId;

  // -------------------- Runtime config --------------------
  struct SensorConfig {
    float refTemp             = NAN;  // NAN = use hardcoded fallback thresholds
    float heaterOnOffset      = 2.0f;
    float heaterOffOffset     = 2.0f;
    float fanThreshold        = 10.0f;
    int   pollInterval        = 5000;  // ms
    int   configFetchInterval = 60000; // ms
  };
  SensorConfig config;

  String getDeviceId() {
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char id[18];
    snprintf(id, sizeof(id), "esp32-%02x%02x%02x", mac[3], mac[4], mac[5]);
    return String(id);
  }

  // -------------------- NVS --------------------
  void loadConfigFromNVS() {
    prefs.begin("cfg", true); // read-only
    config.refTemp             = prefs.getFloat("refTemp", NAN);
    config.heaterOnOffset      = prefs.getFloat("heatOn",  2.0f);
    config.heaterOffOffset     = prefs.getFloat("heatOff", 2.0f);
    config.fanThreshold        = prefs.getFloat("fanThr",  10.0f);
    config.pollInterval        = prefs.getInt("pollMs",    5000);
    config.configFetchInterval = prefs.getInt("cfgMs",     60000);
    prefs.end();
    Serial.printf("[NVS] Loaded: refTemp=%.2f heatOn=%.2f heatOff=%.2f fan=%.2f poll=%d cfg=%d\n",
      (float)config.refTemp, (float)config.heaterOnOffset, (float)config.heaterOffOffset,
      (float)config.fanThreshold, (int)config.pollInterval, (int)config.configFetchInterval);
  }

  void saveConfigToNVS(const SensorConfig& c) {
    prefs.begin("cfg", false); // read-write
    prefs.putFloat("refTemp", c.refTemp);
    prefs.putFloat("heatOn",  c.heaterOnOffset);
    prefs.putFloat("heatOff", c.heaterOffOffset);
    prefs.putFloat("fanThr",  c.fanThreshold);
    prefs.putInt("pollMs",    c.pollInterval);
    prefs.putInt("cfgMs",     c.configFetchInterval);
    prefs.end();
    Serial.println("[NVS] Config saved");
  }

  // -------------------- Forward declarations --------------------
  void ensureWiFiConnected();
  bool ensureMQTTConnected();
  void mqttCallback(char* topic, byte* payload, unsigned int length);
  void fetchConfig();

  // -------------------- WiFi --------------------
  void ensureWiFiConnected() {
    if (WiFi.status() == WL_CONNECTED) return;
    connectWithFallback(ssid, password);
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

      float t = config.refTemp;
      float heaterOn, heaterOff, fanOn;
      if (!isnan(t)) {
        heaterOn  = t - config.heaterOnOffset;
        heaterOff = t + config.heaterOffOffset;
        fanOn     = t + config.fanThreshold;
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

  // -------------------- Config fetch --------------------
  void fetchConfig() {
    if (WiFi.status() != WL_CONNECTED) return;

    HTTPClient http;
    String url = String(BACKEND_URL) + "/api/sensors/config/" + deviceId;
    http.begin(url);
    int code = http.GET();

    if (code != 200) {
      Serial.printf("[Config] HTTP %d — keeping previous config\n", code);
      http.end();
      return;
    }

    String body = http.getString();
    http.end();

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, body);
    if (err) {
      Serial.printf("[Config] JSON parse error: %s\n", err.c_str());
      return;
    }

    SensorConfig next;
    next.refTemp             = doc["refTemp"].isNull() ? NAN : doc["refTemp"].as<float>();
    next.heaterOnOffset      = doc["heaterOnOffset"]      | 2.0f;
    next.heaterOffOffset     = doc["heaterOffOffset"]     | 2.0f;
    next.fanThreshold        = doc["fanThreshold"]        | 10.0f;
    next.pollInterval        = (doc["pollInterval"]       | 5) * 1000;
    next.configFetchInterval = (doc["configFetchInterval"]| 60) * 1000;

    // Only write NVS when values actually change
    bool changed =
      (isnan(next.refTemp) != isnan(config.refTemp)) ||
      (!isnan(next.refTemp) && next.refTemp != config.refTemp) ||
      next.heaterOnOffset      != config.heaterOnOffset  ||
      next.heaterOffOffset     != config.heaterOffOffset ||
      next.fanThreshold        != config.fanThreshold    ||
      next.pollInterval        != config.pollInterval    ||
      next.configFetchInterval != config.configFetchInterval;

    config = next;

    if (changed) {
      saveConfigToNVS(next);
      Serial.printf("[Config] Updated: refTemp=%.2f heatOn=%.2f heatOff=%.2f fan=%.2f poll=%d cfg=%d\n",
        next.refTemp, next.heaterOnOffset, next.heaterOffOffset,
        next.fanThreshold, next.pollInterval, next.configFetchInterval);
    } else {
      Serial.println("[Config] No change");
    }
  }

  // -------------------- TASK: CONFIG FETCH --------------------
  void taskFetchConfig(void *pvParameters) {
    while (true) {
      if (WiFi.status() == WL_CONNECTED) {
        fetchConfig();
      }
      vTaskDelay(pdMS_TO_TICKS(config.configFetchInterval));
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

      vTaskDelay(pdMS_TO_TICKS(config.pollInterval));
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

        // Apply relay control directly from own sensor reading
        float t = config.refTemp;
        float heaterOn, heaterOff, fanOn;
        if (!isnan(t)) {
          heaterOn  = t - config.heaterOnOffset;
          heaterOff = t + config.heaterOffOffset;
          fanOn     = t + config.fanThreshold;
        } else {
          heaterOn = 18.0; heaterOff = 22.0; fanOn = 30.0;
        }

        digitalWrite(FAN_PIN, data.temperature > fanOn ? HIGH : LOW);

        if (data.temperature <= heaterOn) {
          digitalWrite(HEATER_PIN, HIGH);
          Serial.println("[Relay] Heater ON");
        } else if (data.temperature >= heaterOff) {
          digitalWrite(HEATER_PIN, LOW);
          Serial.println("[Relay] Heater OFF");
        }
        // In the comfort zone: leave heater unchanged (hysteresis)
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

    loadConfigFromNVS();

    ensureWiFiConnected();
    deviceId = getDeviceId();
    if (strcmp(WiFi.SSID().c_str(), "Wokwi-GUEST") == 0) {
      deviceId = "wokwi-sensor";
    }
    Serial.printf("[Device] ID: %s\n", deviceId.c_str());

    xTaskCreatePinnedToCore(taskReadSensor,  "SensorTask", 4096, NULL, 1, NULL, 1);
    xTaskCreatePinnedToCore(taskMQTT,        "MQTTTask",   6144, NULL, 1, NULL, 0);
    xTaskCreatePinnedToCore(taskFetchConfig, "CfgTask",    6144, NULL, 1, NULL, 0);
  }

  // -------------------- LOOP --------------------
  void loop() {
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
