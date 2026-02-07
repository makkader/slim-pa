import time

def parse_assistant_response(messages):
    """Parse assistant response content from OpenAI format"""
    for message in messages:
        if message.get('role') == 'assistant':
            content_parts = message.get('content', [])
            
            # Extract all text content
            text_content = []
            for part in content_parts:
                if part.get('type') == 'text':
                    text_content.append(part.get('text', ''))
                # elif part.get('type') == 'toolCall':
                #     tool_id = part.get('id')
                #     tool_name = part.get('name')
                #     tool_args = part.get('arguments', {})

            
            return '\n'.join(text_content)

def send_prompt_get_response(client, message: str, timeout: int = 120) -> str:

    client.send_command({"type": "prompt", "message": message})
    start_time = time.time()

    for event in client.read_events():
        if time.time() - start_time > timeout:
            return "Error: Response timed out."
            
        if event.get("type") == "agent_end":
            print("\n\nAgent finished.")
            print(f"Stop reason: {event.get('stopReason')}")
            return parse_assistant_response(event.get("messages", []))  
            


def send_prompt_and_get_response_old(client, message: str, timeout: int = 30) -> str:
    """
    Send a prompt to the agent via the provided RPC client and return the complete response.
    """
    try:
        # Collect response
        response_parts = []
        
        # Register event handler for text deltas
        def on_text_delta(event):
            assistant_event = event.get("assistantMessageEvent", {})
            if assistant_event.get("type") == "text_delta":
                response_parts.append(assistant_event["delta"])
        
        # Register handler for agent end
        def on_agent_end(event):
            pass  # We just need to know when it's done
        
        client.on("message_update", on_text_delta)
        client.on("agent_end", on_agent_end)
        
        # Send the prompt
        cmd: dict = {"type": "prompt", "message": message}
        # if images:
        #     cmd["images"] = [img.to_dict() for img in images]
        # if streaming_behavior:
        #     cmd["streamingBehavior"] = streaming_behavior.value
            
        client.send_command(cmd)
        
        # Read events until we get the complete response
        # We'll use a simple approach to wait for completion
        start_time = time.time()
        
        # For this simplified version, we'll just read a limited number of events
        # and assume the response is complete when we get an agent_end event
        for event in client.read_events():
            if time.time() - start_time > timeout:
                break
                
            # Stop when we get the agent end event
            if event.get("type") == "agent_end":
                break
        
        # Return the complete response
        return "".join(response_parts)
        
    except Exception as e:
        print(f"Error in send_prompt_and_get_response: {e}")
        return f"Error: {str(e)}"
    
