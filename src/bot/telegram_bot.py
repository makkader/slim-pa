from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart, Command
from aiogram import F
from src.config.config import settings
from src.agent.pi_rpc_client_full import CompleteRPCClient
from src.agent.rpc_client_helper import send_prompt_get_response

from loguru import logger

# Initialize a single RPC client instance for the bot
pi_client = CompleteRPCClient(
        provider="lmstudio",#settings.PROVIDER,
        #model=settings.MODEL,
        no_session="true"
    )

dp = Dispatcher()


@dp.message(CommandStart())
async def command_start_handler(message: types.Message) -> None:
    await message.answer(f"Hello, {message.from_user.full_name}! I am your AI agent. How can I help you today?")

@dp.message(Command("new"))
async def command_new(message: types.Message) -> None:
    pi_client.new_session()
    await message.answer(f"Hello, A new session has been created. How can I help you today?")


@dp.message(Command("stop"))
async def command_stop(message: types.Message) -> None:
    pi_client.close()
    await message.answer(f"Goodbye, {message.from_user.full_name}! Your session has been stopped.")


@dp.message()
async def message_handler(message: types.Message) -> None:
    if not message.text:
        return

    chat_id = message.chat.id
    logger.info(f"Received message from {chat_id}: {message.text}")

    try:
        if pi_client.is_closed():
            logger.warning("RPC client is closed. Reinitializing...")
            pi_client.__init__(
                provider="lmstudio",
                no_session="true"
            )
        #response = send_prompt_and_get_response(pi_client, message.text)
        await message.bot.send_chat_action(
            chat_id=message.chat.id,
            action="typing"
        )

        assistant_text = send_prompt_get_response(pi_client, message.text)
        logger.info(f"Sending response to {chat_id}: {assistant_text}")
        await message.answer(assistant_text)
    except Exception as e:
        logger.exception("Error processing message")
        await message.answer(f"Sorry, I encountered an error: {str(e)}")

async def start_bot():
    bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
    logger.info("Starting Telegram bot...")
    await dp.start_polling(bot)
