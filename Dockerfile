FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./

# Build native dependencies if any
RUN npm ci --omit=dev && npm cache clean --force

# Copy source
COPY src/ ./src/

# Non-root user for security
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

ENV PORT=8080
ENV HOST=0.0.0.0

EXPOSE 8080

CMD ["node", "src/server.js"]
