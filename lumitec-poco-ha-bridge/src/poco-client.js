const fetch = require('node-fetch');
const WebSocket = require('ws');
const EventEmitter = require('events');

/**
 * Lumitec Poco HTTP API and WebSocket Client
 * Implements External Switch API v3.3.0
 */
class PocoClient extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.baseUrl = `http://${config.poco.host}`;
    this.ws = null;
    this.reconnectInterval = 5000;
    this.shouldReconnect = true;
  }

  /**
   * Get all external switches and their states
   * @returns {Promise<Array>} - Array of external switch objects
   */
  async getExternalSwitches() {
    try {
      const response = await fetch(`${this.baseUrl}/v3/extsw?q=1`);
      const data = await response.json();

      if (!data.success) {
        throw new Error('Poco API returned success=false');
      }

      return data.extsw || [];
    } catch (error) {
      console.error('❌ Error fetching external switches:', error.message);
      throw error;
    }
  }

  /**
   * Get Poco device information
   * @returns {Promise<Object>} - Device info object
   */
  async getDeviceInfo() {
    try {
      const response = await fetch(`${this.baseUrl}/v2/info`);
      return await response.json();
    } catch (error) {
      console.error('❌ Error fetching device info:', error.message);
      throw error;
    }
  }

  /**
   * Send action to an external switch
   * @param {number} id - External switch ID
   * @param {number} action - Action ID (1=Off, 2=On, 3=DimDn, 4=DimUp, etc.)
   * @param {Object} params - Optional parameters (delta, hue, sat, bright, pid)
   * @returns {Promise<Object>} - API response
   */
  async sendAction(id, action, params = {}) {
    try {
      const queryParams = new URLSearchParams({
        q: 1,
        id: id,
        act: action,
        ...params
      });

      const url = `${this.baseUrl}/v3/extsw?${queryParams}`;
      console.log(`   → API call: ${url}`);
      const response = await fetch(url);
      const data = await response.json();

      if (!data.success) {
        console.error(`   ❌ Poco returned success=false for: ${url}`);
        throw new Error('Poco action failed');
      }

      return data;
    } catch (error) {
      console.error(`❌ Error sending action to switch ${id}:`, error.message);
      throw error;
    }
  }

  /**
   * Turn switch ON
   * @param {number} id - External switch ID
   */
  async turnOn(id) {
    return this.sendAction(id, 2); // Action 2 = On
  }

  /**
   * Turn switch OFF
   * @param {number} id - External switch ID
   */
  async turnOff(id) {
    return this.sendAction(id, 1); // Action 1 = Off
  }

  /**
   * Toggle switch
   * @param {number} id - External switch ID
   */
  async toggle(id) {
    return this.sendAction(id, 0); // Action 0 = Toggle
  }

  /**
   * Dim down by 10%
   * @param {number} id - External switch ID
   */
  async dimDown(id) {
    return this.sendAction(id, 3); // Action 3 = DimDn
  }

  /**
   * Dim up by 10%
   * @param {number} id - External switch ID
   */
  async dimUp(id) {
    return this.sendAction(id, 4); // Action 4 = DimUp
  }

  /**
   * Set brightness (0-255)
   * @param {number} id - External switch ID
   * @param {number} brightness - Brightness 0-255
   */
  async setBrightness(id, brightness) {
    return this.sendAction(id, 10, { bright: brightness }); // Action 10 = T2B
  }

  /**
   * Set color (HSB)
   * @param {number} id - External switch ID
   * @param {number} hue - Hue 0-255 (0=Red, 85=Green, 170=Blue)
   * @param {number} sat - Saturation 0-255
   * @param {number} brightness - Brightness 0-255
   */
  async setColor(id, hue, sat, brightness) {
    return this.sendAction(id, 8, { hue, sat, bright: brightness }); // Action 8 = T2HSB
  }

  /**
   * Connect to Poco WebSocket for state updates
   */
  connectWebSocket() {
    const wsUrl = `ws://${this.config.poco.host}/websocket/ws.cgi`;

    console.log(`Connecting to Poco WebSocket: ${wsUrl}`);

    this.ws = new WebSocket(wsUrl);

    this.ws.on('open', () => {
      console.log('✅ Connected to Poco WebSocket');
      this.emit('connected');
    });

    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleWebSocketMessage(message);
      } catch (error) {
        console.error('❌ Error parsing Poco WebSocket message:', error.message);
      }
    });

    this.ws.on('error', (error) => {
      console.error('❌ Poco WebSocket error:', error.message);
      this.emit('error', error);
    });

    this.ws.on('close', () => {
      console.log('🔌 Poco WebSocket connection closed');
      this.emit('disconnected');

      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });
  }

  /**
   * Handle WebSocket messages from Poco
   * @param {Object} message - Parsed JSON message
   */
  handleWebSocketMessage(message) {
    // Type 3 = External switch state changes
    if (message.typ === 3 && message.extsw) {
      this.emit('stateChange', message.extsw);
    }
    // Type 2 = Configuration changed
    else if (message.typ === 2 && message.confc === 'refresh') {
      this.emit('configChanged');
    }
    // Type 0 = Heartbeat/uptime
    else if (message.typ === 0) {
      this.emit('heartbeat', message.uptime);
    }
  }

  /**
   * Schedule WebSocket reconnection
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    console.log(`🔄 Reconnecting to Poco WebSocket in ${this.reconnectInterval / 1000}s...`);
    this.reconnectTimer = setTimeout(() => {
      this.connectWebSocket();
    }, this.reconnectInterval);
  }

  /**
   * Disconnect from Poco
   */
  disconnect() {
    this.shouldReconnect = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

module.exports = PocoClient;
