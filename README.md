# Lumitec Poco HA Bridge

Home Assistant add-on for controlling Lumitec Poco Digital Lighting Controller via MQTT.

## Features

- **Full light control** - On/Off, brightness, and color (HSB)
- **Real-time state updates** via WebSocket
- **Auto-discovery** of Poco external switches
- **Proper light entities** with full Home Assistant UI support
- **Color restoration** - Lights remember their color when turned back on
- **Availability tracking** - Entities show as unavailable when offline

## Installation

1. Navigate to **Settings** → **Add-ons** → **Add-on Store**
2. Click **⋮** menu (top right) → **Repositories**
3. Add: `https://github.com/The-Greg-O/lumitec-poco-ha-local-api`
4. Click **Add** → **Close**
5. Find **Lumitec Poco HA Bridge** in the store
6. Click **Install**

## Configuration

Configure via the add-on **Configuration** tab:

- **poco_host**: IP address or hostname of Poco (e.g., `poco.local` or `192.168.1.100`)
- **mqtt_broker**: MQTT broker URL (e.g., `mqtt://localhost`)
- **mqtt_port**: MQTT port (default: `1883`)
- **mqtt_username**: MQTT username
- **mqtt_password**: MQTT password

## Setup External Switches in Poco

Before using this add-on, you must create External Switches in the Poco UI:

1. Connect to Poco UI (`http://poco.local`)
2. Enter config menu (gear icon, passcode: `0000`)
3. Go to **Automation** tab
4. Click **+ Add Action**
5. Select the Virtual Switch to expose
6. Save

Each External Switch will appear as a light entity in Home Assistant.

## License

MIT
