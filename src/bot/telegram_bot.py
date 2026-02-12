import time
from aiogram import Bot, Dispatcher, types
from aiogram.filters import CommandStart, Command
from aiogram.enums import ParseMode
from src.config.config import settings
from src.agent.pi_rpc_client_async import CompleteRPCClient
from src.agent.rpc_client_helper import send_prompt_get_response_async

from loguru import logger
import telegramify_markdown



# Initialize a single RPC client instance for the bot
def create_rpc_client():
    return CompleteRPCClient(
        provider=settings.LLM_PROVIDER,
        model=settings.LLM_MODEL_NAME,
        no_session="true"
    )
pi_client = create_rpc_client()

dp = Dispatcher()

@dp.message(CommandStart())
async def command_start_handler(message: types.Message) -> None:
    await message.answer(f"Hello, {message.from_user.full_name}! I am your AI agent. How can I help you today?")

@dp.message(Command("new"))
async def command_new(message: types.Message) -> None:
    if pi_client.proc is None:
            await pi_client.start()
    await pi_client.new_session()
    await message.answer(f"Hello, A new session has been created. How may I help you?")


@dp.message(Command("stop"))
async def command_stop(message: types.Message) -> None:
    await pi_client.close()    
    await message.answer(f"Goodbye, {message.from_user.full_name}! Your session has been stopped.")


@dp.message()
async def message_handler(message: types.Message) -> None:

    last_typed: int = time.time() 
    chat_id = message.chat.id

    async def on_text_delta(event):
        nonlocal last_typed
        assistant_event = event.get("assistantMessageEvent", {})
        if assistant_event.get("type") == "text_delta":
            now = time.time()
            if now - last_typed > 5:
                logger.info(f"type action sent for chat_id: {chat_id} at {now}.")
                await message.bot.send_chat_action(
                    chat_id=chat_id,
                    action="typing"
                )
            
                last_typed = now

    if not message.text:
        return
    logger.info(f"Received message from {chat_id}: {message.text}")

    try:
        # Ensure client is started before use
        if pi_client.proc is None:
            logger.info("Starting RPC client...")
            await pi_client.start()  
            
        # send typing action while processing the message
        await message.bot.send_chat_action(
            chat_id=chat_id,
            action="typing"
        )
        pi_client.on("message_update", on_text_delta)
        assistant_text = await send_prompt_get_response_async(pi_client, message)

        logger.info(f"Sending response to {chat_id}: {assistant_text}")
        converted = telegramify_markdown.markdownify(assistant_text)
        
        await message.answer(converted, parse_mode=ParseMode.MARKDOWN_V2)
    except Exception as e:
        logger.exception("Error processing message")
        await message.answer(f"Sorry, I encountered an error: {str(e)}")

async def start_bot():
    bot = Bot(token=settings.TELEGRAM_BOT_TOKEN)
    logger.info("Starting Telegram bot...")
    await dp.start_polling(bot)
