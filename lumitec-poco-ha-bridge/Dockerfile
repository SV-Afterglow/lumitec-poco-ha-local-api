ARG BUILD_FROM=ghcr.io/hassio-addons/base:15.0.1
FROM ${BUILD_FROM}

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install Node.js (latest available in Alpine)
RUN \
    apk add --no-cache \
        nodejs \
        npm

# Copy application files
WORKDIR /app
COPY package*.json ./
COPY src ./src
COPY config.json ./

# Install dependencies
RUN npm ci --only=production

# Copy run script
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
