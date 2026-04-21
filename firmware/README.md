# HomeNut ESP32

ESP32 firmware for the HomeNut home automation system. Two independent projects:

- **sensor/** — climate sensor (DHT22) + fan/heater relay control via MQTT
- **camera/** — MJPEG stream + snapshot server (AI Thinker ESP32-CAM)

## Prerequisites

- [PlatformIO CLI](https://docs.platformio.org/en/latest/core/installation/index.html) or PlatformIO IDE extension for VS Code
- Docker + Docker Compose (for the backend stack)
- The [HomeNut Nuxt app](../nuxt-app) running for camera auto-discovery

---

## 1. Start the backend stack

The sensor project includes the full IoT infrastructure:

```bash
cd sensor/iot-stack
docker-compose up -d
```

| Service     | Address              |
|-------------|----------------------|
| Mosquitto   | localhost:1883       |
| Node-RED    | http://localhost:1880 |
| InfluxDB    | http://localhost:8086 |
| Grafana     | http://localhost:3000 |

---

## 2. Sensor (DHT22 + relay control)

### Configure secrets

```bash
cp sensor/include/secrets.h.example sensor/include/secrets.h
```

Edit `sensor/include/secrets.h`:

```c
#define SECRET_SSID  "your-wifi-ssid"
#define SECRET_PASS  "your-wifi-password"
#define MQTT_SERVER  "192.168.1.100"   // host running the Docker stack
#define MQTT_USER    ""
#define MQTT_PASS    ""
```

### Build and flash

```bash
cd sensor
pio run -e esp-wrover-kit -t upload
pio device monitor -b 115200
```

The device publishes readings every 5 seconds to:
- `homenut/sensors/{deviceId}/temperature`
- `homenut/sensors/{deviceId}/humidity`

**Wiring:**

| Pin    | Connected to     |
|--------|-----------------|
| GPIO 21 | DHT22 data     |
| GPIO 4  | Fan relay      |
| GPIO 19 | Heater relay   |

### Simulate without hardware (Wokwi)

The `sensor/diagram.json` schematic and `sensor/wokwi.toml` are pre-configured for the [Wokwi](https://wokwi.com) simulator. `secrets.h` already uses `Wokwi-GUEST` WiFi by default.

---

## 3. Camera (AI Thinker ESP32-CAM)

### Configure secrets

```bash
cp camera/include/secrets.h.example camera/include/secrets.h
```

Edit `camera/include/secrets.h`:

```c
#define SECRET_SSID  "your-wifi-ssid"
#define SECRET_PASS  "your-wifi-password"
#define BACKEND_URL  "http://192.168.1.100:3000"  // Nuxt app address
```

### Build and flash

The ESP32-CAM has no onboard USB-UART bridge. Use a USB-to-serial adapter and hold the `IO0` button during upload to enter flash mode.

```bash
cd camera
pio run -e esp32cam -t upload
pio device monitor -b 115200
```

On boot the serial monitor will print:

```
Stream:   http://192.168.x.x/stream
Snapshot: http://192.168.x.x/capture
```

### Add to the frontend

1. Open the HomeNut dashboard
2. Click **Add Sensor** in any room
3. The camera appears under **Discovered devices** with its stream and snapshot URLs pre-filled
4. Select it and save — the live stream is accessible from the camera card

The camera re-announces its URLs to the backend automatically on every WiFi reconnect, so IP changes are handled without manual reconfiguration.

### Simulate without hardware (Wokwi)

`camera/diagram.json` and `camera/wokwi.toml` are pre-configured for the [Wokwi](https://wokwi.com) simulator using `board-esp32-devkit-c-v4` (Wokwi has no ESP32-CAM board type). `secrets.h` defaults to `Wokwi-GUEST` WiFi. The camera will fail to initialize in simulation — `Camera init failed` will appear on the serial monitor — since there is no camera hardware to simulate. WiFi connectivity and the HTTP server boot sequence can still be tested if the firmware is adapted to skip camera init.
