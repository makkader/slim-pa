FROM python:3.11-slim

# Install Node.js
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install system dependencies if needed
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install npm package
RUN npm install -g @mariozechner/pi-coding-agent

# Copy pyproject.toml and install dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Copy the source code
COPY src/ ./src/
COPY models.json /root/.pi/agent/models.json
COPY AGENTS.md ./AGENTS.md
COPY .pi/ ./.pi/

# Set environment variables
ENV PYTHONPATH=/app

# Run the application
CMD ["python", "src/main.py"]
