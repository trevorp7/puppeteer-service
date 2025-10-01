FROM ghcr.io/puppeteer/puppeteer:21.6.1

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (skip Chromium download since base image has it)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN npm ci --only=production

# Copy app files
COPY . .

# Expose port
EXPOSE 10000

# Start the server
CMD ["npm", "start"]
