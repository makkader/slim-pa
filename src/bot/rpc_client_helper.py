
def send_prompt_and_get_response(client, message: str, timeout: int = 30) -> str:
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
        import time
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