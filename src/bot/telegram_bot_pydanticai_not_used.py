from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart, Command
from aiogram import F
from src.config.config import settings
from src.agent.ai_agent import agent
from src.memory.memory import memory
from loguru import logger
from pydantic_ai.exceptions import UnexpectedModelBehavior


dp = Dispatcher()


@dp.message(Command("new"))
async def command_new(message: types.Message) -> None:
    memory.reset(message.chat.id)
    await message.answer(f"Hello, Lets start new chat (id: {message.chat.id}). How can I help you today?")


@dp.message(CommandStart())
async def command_start_handler(message: types.Message) -> None:
    await message.answer(f"Hello, {message.from_user.full_name}! I am your AI agent. How can I help you today?")

@dp.message()
async def message_handler(message: types.Message) -> None:
    if not message.text:
        return

    chat_id = message.chat.id
    logger.info(f"Received message from {chat_id}: {message.text}")

    # Get history from memory
    history = memory.get_messages(chat_id)

    try:
        # Run agent with history
        result = await agent.run(message.text, message_history=history)
        print("result",result.output)
        
        # Update memory with new messages
        memory.add_messages(chat_id, result.new_messages())
        
        await message.answer(result.output)
    except UnexpectedModelBehavior as e:

        logger.exception("Error processing message, UnexpectedModelBehavior: %s", e)
        await message.answer(f"Sorry, UnexpectedModelBehavior: {str(e)}")
    except Exception as e:
        logger.exception("Error processing message")
        await message.answer(f"Sorry, I encountered an error: {str(e)}")

async def start_bot():
    bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
    logger.info("Starting Telegram bot...")
    await dp.start_polling(bot)
