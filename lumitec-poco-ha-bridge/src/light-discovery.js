/**
 * Home Assistant MQTT Light Discovery for Lumitec Poco
 * Creates HA light entities with dimming and color support
 */
class LightDiscovery {
  constructor(config, mqttClient, pocoDeviceInfo) {
    this.config = config;
    this.mqttClient = mqttClient;
    this.pocoDeviceInfo = pocoDeviceInfo;
  }

  /**
   * Publish MQTT Discovery for a Poco external switch as a light
   * @param {Object} extSwitch - External switch object from Poco API
   */
  publishLightDiscovery(extSwitch) {
    const lightId = `poco_light_${extSwitch.id}`;
    const discoveryTopic = `${this.config.homeassistant.discoveryPrefix}/light/poco/${lightId}/config`;

    const discoveryPayload = {
      name: extSwitch.txt || `Poco Light ${extSwitch.id}`,
      unique_id: lightId,
      object_id: lightId,
      schema: 'json',

      // State and command use JSON payloads
      state_topic: `${this.config.homeassistant.discoveryPrefix}/light/poco/${lightId}/state`,
      command_topic: `${this.config.homeassistant.discoveryPrefix}/light/poco/${lightId}/set`,

      // Availability tracking
      availability_topic: `${this.config.homeassistant.discoveryPrefix}/light/poco/status`,
      payload_available: 'online',
      payload_not_available: 'offline',

      // Enable brightness
      brightness: true,
      brightness_scale: 255,

      // Enable color support if switch supports it
      ...(this.supportsColor(extSwitch) && {
        color_mode: true,
        supported_color_modes: ['hs']
      }),

      // Device grouping
      device: {
        identifiers: [`poco_${this.pocoDeviceInfo.sys_id}`],
        name: this.pocoDeviceInfo.name || 'Lumitec Poco',
        manufacturer: this.pocoDeviceInfo.manuf || 'Lumitec LLC',
        model: this.pocoDeviceInfo.model || 'Poco Digital Lighting Controller',
        sw_version: this.pocoDeviceInfo.fw_ver,
        hw_version: this.pocoDeviceInfo.hw_ver,
        configuration_url: `http://${this.config.poco.host}/`
      },

      icon: 'mdi:lighthouse-on'
    };

    // Publish discovery with retain flag
    this.mqttClient.publish(discoveryTopic, discoveryPayload, { qos: 1, retain: true });

    console.log(`🔍 Discovered light: ${extSwitch.txt} (ID: ${extSwitch.id})`);
  }

  /**
   * Check if external switch supports color control
   * @param {Object} extSwitch - External switch object
   * @returns {boolean}
   */
  supportsColor(extSwitch) {
    // Check if switch has T2HSB (action 8) or T2HS (action 9) in its actions
    return extSwitch.acts && (extSwitch.acts.includes(8) || extSwitch.acts.includes(9));
  }

  /**
   * Get state topic for a light
   * @param {number} id - External switch ID
   * @returns {string}
   */
  getStateTopic(id) {
    const lightId = `poco_light_${id}`;
    return `${this.config.homeassistant.discoveryPrefix}/light/poco/${lightId}/state`;
  }

  /**
   * Get command topic for a light
   * @param {number} id - External switch ID
   * @returns {string}
   */
  getCommandTopic(id) {
    const lightId = `poco_light_${id}`;
    return `${this.config.homeassistant.discoveryPrefix}/light/poco/${lightId}/set`;
  }
}

module.exports = LightDiscovery;
