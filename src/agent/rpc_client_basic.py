#!/usr/bin/env python3
"""
Basic RPC Client for pi-coding-agent
Provides simple prompt/response functionality with event streaming.
"""

import subprocess
import json
import sys
from typing import Iterator, Dict, Any, Optional


class BasicRPCClient:
    """Basic RPC client with core functionality."""
    
    def __init__(self, provider: str = "lmstudio", model: Optional[str] = None, no_session: bool = True):
        """Initialize the RPC client and start the agent process.
        
        Args:
            provider: LLM provider (anthropic, openai, google, etc.)
            model: Model ID (optional)
            no_session: Disable session persistence
        """
        cmd = ["pi", "--mode", "rpc", "--provider", provider]
        if model:
            cmd.extend(["--model", model])
        if no_session:
            cmd.append("--no-session")
        
        self.proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
    
    def send_command(self, command: Dict[str, Any]) -> None:
        """Send a command to the agent.
        
        Args:
            command: Command dictionary (must include 'type' field)
        """
        if not self.proc.stdin:
            raise RuntimeError("Process stdin is not available")
        
        self.proc.stdin.write(json.dumps(command) + "\n")
        self.proc.stdin.flush()
    
    def read_events(self) -> Iterator[Dict[str, Any]]:
        """Read events from the agent stdout.
        
        Yields:
            Event dictionaries
        """
        if not self.proc.stdout:
            raise RuntimeError("Process stdout is not available")
        
        for line in self.proc.stdout:
            line = line.strip()
            if line:
                try:
                    yield json.loads(line)
                except json.JSONDecodeError as e:
                    print(f"Failed to parse event: {e}", file=sys.stderr)
    
    def prompt(self, message: str, request_id: Optional[str] = None) -> None:
        """Send a prompt to the agent.
        
        Args:
            message: User message
            request_id: Optional request ID for correlation
        """
        cmd = {"type": "prompt", "message": message}
        if request_id:
            cmd["id"] = request_id
        self.send_command(cmd)
    
    def abort(self) -> None:
        """Abort the current agent execution."""
        self.send_command({"type": "abort"})
    
    def close(self) -> None:
        """Close the agent process."""
        if self.proc.stdin:
            self.proc.stdin.close()
        self.proc.wait()
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


def main():
    """Example usage of the basic RPC client."""
    with BasicRPCClient() as client:
        # Send a prompt
        print("Sending prompt...\n")
        client.prompt("Write a hello world function in Python")
        
        # Process events
        for event in client.read_events():
            event_type = event.get("type")
            
            # Print text deltas
            if event_type == "message_update":
                assistant_event = event.get("assistantMessageEvent", {})
                if assistant_event.get("type") == "text_delta":
                    print(assistant_event["delta"], end="", flush=True)
            
            # Stop on agent_end
            elif event_type == "agent_end":
                print("\n\nAgent finished.")
                break
            
            # Handle errors
            elif event_type == "error":
                print(f"\nError: {event.get('error')}", file=sys.stderr)
                break


if __name__ == "__main__":
    main()

# Made with Bob
