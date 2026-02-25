# Use Node.js 20 slim (Debian-based) for better Python compatibility
FROM node:20-slim

# Install Python3, pip, and ffmpeg (required for yt-dlp)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp via pip (globally)
# Use --break-system-packages on newer Debian/Python versions or use venv
# Here we use --break-system-packages as we are in a container environment
RUN python3 -m pip install -U yt-dlp --break-system-packages

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY . .

# Ensure permissions (optional, if running as non-root user later)
# RUN chown -R node:node /app
# USER node

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "index.js"]
