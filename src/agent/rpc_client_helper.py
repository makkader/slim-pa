import time
from loguru import logger


def parse_assistant_response(messages) -> str:
    """Parse assistant response content from OpenAI format"""
    total_text = []
    nmessage = len(messages)
    for i, message in enumerate(messages):
        if message.get("role") == "assistant":
            content_parts = message.get("content", [])

            # Extract all text content
            text_content = []
            for part in content_parts:
                if part.get("type") == "text":
                    text_content.append(part.get("text", ""))
                elif part.get("type") == "toolCall":
                    tool_name = part.get("name")
                    tool_args = part.get("arguments", {})
                    logger.info(
                        f"Tool call detected: {tool_name} with args {tool_args}"
                    )
            if not text_content:
                continue
            if message.get("stopReason") == "toolUse" and text_content:
                total_text.append("🤔 " + "\n".join(text_content))
            elif message.get("stopReason") == "stop" and total_text:
                total_text.append("-" * 10 + "✅" + "-" * 10)
                total_text.append("\n".join(text_content))
            else:
                total_text.append("\n".join(text_content))

        elif message.get("role") == "toolResult":
            content_parts = message.get("content", [])
            logger.info(f"Tool Result: {content_parts}")

    return "\n".join(total_text)


async def send_prompt_get_response_async(client, message, timeout: int = 5 * 60) -> str:
    # TODO: add timeout handling
    await client.send_command(
        {"id": message.chat.id, "type": "prompt", "message": message.text}
    )
    async for event in client.read_events():
        event_type = event.get("type")
        if event_type == "agent_end":
            return parse_assistant_response(event.get("messages", []))
