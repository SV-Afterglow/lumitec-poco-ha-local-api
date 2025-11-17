#!/usr/bin/with-contenv bashio

bashio::log.info "Starting Lumitec Poco HA Bridge..."

# Get config from HA add-on options
export POCO_HOST=$(bashio::config 'poco_host')
export MQTT_BROKER=$(bashio::config 'mqtt_broker')
export MQTT_PORT=$(bashio::config 'mqtt_port')
export MQTT_USERNAME=$(bashio::config 'mqtt_username')
export MQTT_PASSWORD=$(bashio::config 'mqtt_password')

bashio::log.info "Poco Controller: ${POCO_HOST}"
bashio::log.info "MQTT Broker: ${MQTT_BROKER}:${MQTT_PORT}"

# Start the Node.js application
cd /app
exec node src/index.js
