import time
from loguru import logger

def parse_assistant_response(messages)-> str:
    """Parse assistant response content from OpenAI format"""
    total_text = []
    for message in messages:
        if message.get('role') == 'assistant':
            content_parts = message.get('content', [])
            
            # Extract all text content
            text_content = []
            for part in content_parts:
                if part.get('type') == 'text':
                    text_content.append(part.get('text', ''))
                elif part.get('type') == 'toolCall':
                    tool_name = part.get('name')
                    tool_args = part.get('arguments', {})
                    logger.info(f"Tool call detected: {tool_name} with args {tool_args}")

            
            total_text.append('\n'.join(text_content))

    return '\n'.join(total_text)

async def send_prompt_get_response_async(client, message, timeout: int = 5*60) -> str:
    #TODO: add timeout handling
    await client.send_command({"id":message.chat.id,"type": "prompt", "message": message.text})
    async for event in client.read_events():
        event_type = event.get("type")
        if event_type == "agent_end":
            return parse_assistant_response(event.get("messages", []))  
            
            