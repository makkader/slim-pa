FROM python:3.11-slim

WORKDIR /app

# Install system dependencies if needed
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy pyproject.toml and install dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Copy the source code
COPY src/ ./src/

# Set environment variables
ENV PYTHONPATH=/app

# Run the application
CMD ["python", "src/main.py"]
