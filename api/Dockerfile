FROM node:20-alpine

# Install build dependencies for better-sqlite3 and wget for healthcheck
RUN apk add --no-cache python3 make g++ wget

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --omit=dev

# Copy source
COPY index.js ./

# Create data directory
RUN mkdir -p /data

EXPOSE 3001

CMD ["node", "index.js"]
