import asyncio
import sys
from loguru import logger
from src.bot.telegram_bot import start_bot
from src.config.config import settings

def setup_logging():
    logger.remove()
    logger.add(sys.stderr, level=settings.LOG_LEVEL)

async def main():
    setup_logging()
    try:
        await start_bot()
    except Exception as e:
        logger.error(f"Application failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())
