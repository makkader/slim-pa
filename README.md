# Slim-PA: AI Agent with Telegram Integration

A production-grade AI agent built with Pydantic AI and aiogram.

## Features
- **Pydantic AI Framework**: Robust agentic logic.
- **Telegram Integration**: Chat with your agent via Telegram.
- **Web Search & Fetch**: Agent can search the web (DuckDuckGo) and fetch webpage content (Trafilatura).
- **Memory**: Basic in-memory chat history.
- **Multi-Model Support**: Easily switch between Google Gemini, OpenAI, or local models (LM Studio, Ollama).
- **Dockerized**: Ready for production deployment with Docker Compose.

## Setup

1. **Clone the repository**
2. **Create a `.env` file** (copy from `.env.example`)
   ```bash
   cp .env.example .env
   ```
3. **Configure your keys**:
   - `TELEGRAM_BOT_TOKEN`: Get it from [@BotFather](https://t.me/BotFather).
   - `GOOGLE_API_KEY`: Get it from [Google AI Studio](https://aistudio.google.com/).
   - (Optional) Configure `LLM_PROVIDER` and `LLM_BASE_URL` for local models.

## Running the Application

### Using Docker Compose (Recommended)
```bash
docker-compose up --build
```

### Local Development
1. Install dependencies:
   ```bash
   pip install .
   ```
2. Run the application:
   ```bash
   python src/main.py
   ```

## Project Structure
- `src/agent/`: AI Agent definition and tools.
- `src/bot/`: Telegram bot logic using aiogram.
- `src/config/`: Configuration management.
- `src/memory/`: Chat history and memory logic.
- `src/tools/`: Custom tools (web search, fetching).
