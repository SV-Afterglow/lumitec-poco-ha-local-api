#!/usr/bin/env node
/**
 * Cleanup script to remove old Poco MQTT light entities
 * Publishes empty retained messages to discovery topics
 */

const mqtt = require('mqtt');

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://10.147.17.65';
const MQTT_PORT = process.env.MQTT_PORT || 1883;
const MQTT_USERNAME = process.env.MQTT_USERNAME || 'n2khabridge';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '!N2KMQTTBridge1';

const client = mqtt.connect(MQTT_BROKER, {
  port: MQTT_PORT,
  username: MQTT_USERNAME,
  password: MQTT_PASSWORD,
  clientId: 'poco-cleanup'
});

client.on('connect', () => {
  console.log('✅ Connected to MQTT broker');
  console.log('🧹 Removing old Poco light discovery messages...');

  // Remove discovery messages for all possible light IDs (0-10 should cover it)
  for (let id = 0; id <= 10; id++) {
    const topic = `homeassistant/light/poco/poco_light_${id}/config`;
    console.log(`   Clearing: ${topic}`);
    client.publish(topic, '', { qos: 1, retain: true });
  }

  setTimeout(() => {
    console.log('✅ Cleanup complete!');
    console.log('   Restart your Poco HA Bridge to rediscover lights.');
    client.end();
    process.exit(0);
  }, 2000);
});

client.on('error', (error) => {
  console.error('❌ MQTT Error:', error.message);
  process.exit(1);
});
