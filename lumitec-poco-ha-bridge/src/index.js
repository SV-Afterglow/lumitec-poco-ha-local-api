require('dotenv').config();
const fs = require('fs');
const path = require('path');
const MQTTClient = require('./mqtt-client');
const PocoClient = require('./poco-client');
const LightDiscovery = require('./light-discovery');

// Load configuration
const configPath = path.join(__dirname, '..', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Override config with environment variables if provided
if (process.env.POCO_HOST) config.poco.host = process.env.POCO_HOST;
if (process.env.MQTT_BROKER) config.mqtt.broker = process.env.MQTT_BROKER;
if (process.env.MQTT_PORT) config.mqtt.port = parseInt(process.env.MQTT_PORT);
if (process.env.MQTT_USERNAME) config.mqtt.username = process.env.MQTT_USERNAME;
if (process.env.MQTT_PASSWORD) config.mqtt.password = process.env.MQTT_PASSWORD;

console.log('💡 Lumitec Poco HA Bridge starting...');
console.log(`📡 Poco Controller: ${config.poco.host}`);
console.log(`📡 MQTT Broker: ${config.mqtt.broker}:${config.mqtt.port}`);

// Initialize components
const mqttClient = new MQTTClient(config);
const pocoClient = new PocoClient(config);
let lightDiscovery;
let pocoDeviceInfo;

// Track discovered lights and their current states
const discoveredLights = new Set();
const previousLights = new Set(); // Track previous discovery to detect removals
const lightStates = new Map(); // id -> {state, brightness, hue, sat}

// Initialize Poco connection and discover lights
async function initializePoco() {
  try {
    console.log('📋 Fetching Poco device information...');
    pocoDeviceInfo = await pocoClient.getDeviceInfo();
    console.log(`✅ Found Poco: ${pocoDeviceInfo.name} (${pocoDeviceInfo.fw_ver})`);
    console.log(`   System ID: ${pocoDeviceInfo.sys_id}`);

    // Initialize light discovery with device info
    lightDiscovery = new LightDiscovery(config, mqttClient, pocoDeviceInfo);

    console.log('📋 Fetching external switches...');
    const switches = await pocoClient.getExternalSwitches();
    console.log(`✅ Found ${switches.length} external switches`);

    // Find switches that were removed (existed before but not now)
    const currentSwitchIds = new Set(switches.map(sw => sw.id));
    const removedSwitches = [...previousLights].filter(id => !currentSwitchIds.has(id));

    // Remove discovery messages for deleted switches
    removedSwitches.forEach(id => {
      const lightId = `poco_light_${id}`;
      const discoveryTopic = `${config.homeassistant.discoveryPrefix}/light/poco/${lightId}/config`;
      mqttClient.publish(discoveryTopic, '', { qos: 1, retain: true });
      console.log(`🗑️  Removed light: ID ${id}`);

      discoveredLights.delete(id);
      previousLights.delete(id);
      lightStates.delete(id);
    });

    // Discover each switch as a light in Home Assistant
    switches.forEach(sw => {
      lightDiscovery.publishLightDiscovery(sw);
      discoveredLights.add(sw.id);
      previousLights.add(sw.id);

      // Initialize state tracking
      lightStates.set(sw.id, {
        state: sw.state > 0 ? 'ON' : 'OFF',
        brightness: 255, // Default brightness (Poco doesn't report this)
        hue: 0,
        sat: 0
      });

      // Publish initial state
      publishLightState(sw.id);
    });

    // Connect to WebSocket for state updates
    pocoClient.connectWebSocket();

  } catch (error) {
    console.error('❌ Failed to initialize Poco:', error.message);
  }
}

/**
 * Publish light state to MQTT (JSON format)
 * @param {number} id - External switch ID
 */
function publishLightState(id) {
  const state = lightStates.get(id);
  if (!state) return;

  const stateTopic = lightDiscovery.getStateTopic(id);

  // Publish JSON state
  const statePayload = {
    state: state.state,
    brightness: state.brightness,
    color_mode: 'hs',
    color: {
      h: state.hue,
      s: state.sat
    }
  };

  mqttClient.publish(stateTopic, JSON.stringify(statePayload));
}

// Handle MQTT connection
mqttClient.on('connected', () => {
  console.log('✅ Connected to MQTT broker');

  // Publish availability status
  const availabilityTopic = `${config.homeassistant.discoveryPrefix}/light/poco/status`;
  mqttClient.publish(availabilityTopic, 'online', { qos: 1, retain: true });

  // Subscribe to command topics for all discovered lights
  discoveredLights.forEach(id => {
    const commandTopic = lightDiscovery.getCommandTopic(id);
    mqttClient.subscribe(commandTopic);
  });
});

mqttClient.on('error', (error) => {
  console.error('❌ MQTT Error:', error.message);
});

// Handle MQTT messages (commands from Home Assistant)
mqttClient.on('message', async (topic, message) => {
  try {
    const payload = message.toString();

    // Find which light this command is for
    for (const id of discoveredLights) {
      const commandTopic = lightDiscovery.getCommandTopic(id);

      if (topic === commandTopic) {
        // Parse JSON command
        const command = JSON.parse(payload);
        const state = lightStates.get(id);

        // Handle ON/OFF
        if (command.state) {
          if (command.state === 'ON') {
            // If brightness or color specified, set those too
            if (command.brightness !== undefined || command.color !== undefined) {
              const brightness = command.brightness !== undefined ? command.brightness : state.brightness;
              const hue = command.color?.h !== undefined ? command.color.h : state.hue;
              const sat = command.color?.s !== undefined ? command.color.s : state.sat;

              // Convert HA values to Poco values
              const pocoHue = Math.round((hue / 360) * 255);
              const pocoSat = Math.round((sat / 100) * 255);

              await pocoClient.setColor(id, pocoHue, pocoSat, brightness);

              state.state = 'ON';
              state.brightness = brightness;
              state.hue = hue;
              state.sat = sat;

              console.log(`💡 Set light ${id}: ON, Brightness=${brightness}, H=${hue}, S=${sat}`);
            } else {
              // Always restore last color/brightness when turning on
              const pocoHue = Math.round((state.hue / 360) * 255);
              const pocoSat = Math.round((state.sat / 100) * 255);

              await pocoClient.setColor(id, pocoHue, pocoSat, state.brightness);
              state.state = 'ON';
              console.log(`💡 Turned ON ${id} (restoring: Brightness=${state.brightness}, H=${state.hue}, S=${state.sat})`);
            }
          } else if (command.state === 'OFF') {
            await pocoClient.turnOff(id);
            state.state = 'OFF';
            console.log(`💡 Turned OFF: ${id}`);
          }

          publishLightState(id);
        }
        // Handle brightness-only change (while already on)
        else if (command.brightness !== undefined) {
          await pocoClient.setBrightness(id, command.brightness);
          state.brightness = command.brightness;
          publishLightState(id);
          console.log(`🔆 Set brightness ${id}: ${command.brightness}`);
        }
        // Handle color-only change (while already on)
        else if (command.color !== undefined) {
          const hue = command.color.h;
          const sat = command.color.s;

          // Convert HA hue (0-360) to Poco hue (0-255)
          const pocoHue = Math.round((hue / 360) * 255);
          const pocoSat = Math.round((sat / 100) * 255);

          await pocoClient.setColor(id, pocoHue, pocoSat, state.brightness);

          state.hue = hue;
          state.sat = sat;
          publishLightState(id);
          console.log(`🎨 Set color ${id}: H=${hue} S=${sat}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Error handling MQTT command:', error.message);
  }
});

// Handle Poco WebSocket state changes
pocoClient.on('stateChange', (switches) => {
  switches.forEach(sw => {
    const state = lightStates.get(sw.id);
    if (!state) return;

    const newState = sw.state > 0 ? 'ON' : 'OFF';
    if (state.state !== newState) {
      state.state = newState;
      publishLightState(sw.id);
      console.log(`🔄 State changed: ${sw.id} → ${newState}`);
    }
  });
});

pocoClient.on('configChanged', async () => {
  console.log('⚙️  Poco configuration changed, re-discovering switches...');
  await initializePoco();
});

pocoClient.on('heartbeat', (uptime) => {
  // Heartbeat every 10 seconds - could use for connectivity monitoring
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');

  // Publish offline status
  const availabilityTopic = `${config.homeassistant.discoveryPrefix}/light/poco/status`;
  mqttClient.publish(availabilityTopic, 'offline', { qos: 1, retain: true });

  pocoClient.disconnect();
  setTimeout(() => {
    mqttClient.disconnect();
    process.exit(0);
  }, 500);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down...');

  // Publish offline status
  const availabilityTopic = `${config.homeassistant.discoveryPrefix}/light/poco/status`;
  mqttClient.publish(availabilityTopic, 'offline', { qos: 1, retain: true });

  pocoClient.disconnect();
  setTimeout(() => {
    mqttClient.disconnect();
    process.exit(0);
  }, 500);
});

// Start the bridge
async function start() {
  mqttClient.connect();
  await initializePoco();
}

start().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
