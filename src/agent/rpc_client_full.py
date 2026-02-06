#!/usr/bin/env python3
"""
Complete RPC Client for pi-coding-agent
Full-featured client with all RPC protocol capabilities including:
- Prompting with images and streaming behavior
- Session management
- Model configuration
- Extension UI protocol
- Event handling
- Bash execution
"""

import subprocess
import json
import sys
import base64
from typing import Iterator, Dict, Any, Optional, List, Callable
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from loguru import logger

class StreamingBehavior(Enum):
    """Streaming behavior for prompts during active streaming."""
    STEER = "steer"
    FOLLOW_UP = "followUp"


@dataclass
class ImageContent:
    """Image content for prompts."""
    data: str  # base64-encoded
    mime_type: str = "image/png"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": "image",
            "data": self.data,
            "mimeType": self.mime_type
        }


class CompleteRPCClient:
    """Complete RPC client with full protocol support."""
    
    def __init__(
        self,
        provider: str = "lmstudio",
        model: Optional[str] = None,
        no_session: bool = False,
        session_dir: Optional[str] = None,
        additional_args: Optional[List[str]] = None
    ):
        """Initialize the RPC client and start the agent process.
        
        Args:
            provider: LLM provider (anthropic, openai, google, etc.)
            model: Model ID (optional)
            no_session: Disable session persistence
            session_dir: Custom session storage directory
            additional_args: Additional command-line arguments
        """
        cmd = ["pi", "--mode", "rpc", "--provider", provider]
        if model:
            cmd.extend(["--model", model])
        if no_session:
            cmd.append("--no-session")
        if session_dir:
            cmd.extend(["--session-dir", session_dir])
        if additional_args:
            cmd.extend(additional_args)
        
        self.proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        self._event_handlers: Dict[str, List[Callable]] = {}
        self._ui_response_handlers: Dict[str, Callable] = {}
    
    def send_command(self, command: Dict[str, Any]) -> None:
        """Send a command to the agent."""
        if not self.proc.stdin:
            raise RuntimeError("Process stdin is not available")
        
        self.proc.stdin.write(json.dumps(command) + "\n")
        self.proc.stdin.flush()
    
    def read_events(self) -> Iterator[Dict[str, Any]]:
        """Read events from the agent stdout."""
        if not self.proc.stdout:
            raise RuntimeError("Process stdout is not available")
        
        for line in self.proc.stdout:
            line = line.strip()
            if line:
                try:
                    event = json.loads(line)
                    self._dispatch_event(event)
                    yield event
                except json.JSONDecodeError as e:
                    print(f"Failed to parse event: {e}", file=sys.stderr)
    
    def on(self, event_type: str, handler: Callable[[Dict[str, Any]], None]) -> None:
        """Register an event handler.
        
        Args:
            event_type: Event type to listen for
            handler: Callback function
        """
        if event_type not in self._event_handlers:
            self._event_handlers[event_type] = []
        self._event_handlers[event_type].append(handler)
    
    def _dispatch_event(self, event: Dict[str, Any]) -> None:
        """Dispatch event to registered handlers."""
        event_type = event.get("type")
        if event_type in self._event_handlers:
            for handler in self._event_handlers[event_type]:
                try:
                    handler(event)
                except Exception as e:
                    print(f"Error in event handler: {e}", file=sys.stderr)
    
    # ===== Prompting Commands =====
    
    def prompt(
        self,
        message: str,
        images: Optional[List[ImageContent]] = None,
        streaming_behavior: Optional[StreamingBehavior] = None,
        request_id: Optional[str] = None
    ) -> None:
        """Send a prompt to the agent.
        
        Args:
            message: User message
            images: Optional list of images
            streaming_behavior: Behavior during active streaming
            request_id: Optional request ID for correlation
        """
        cmd: Dict[str, Any] = {"type": "prompt", "message": message}
        if request_id:
            cmd["id"] = request_id
        if images:
            cmd["images"] = [img.to_dict() for img in images]
        if streaming_behavior:
            cmd["streamingBehavior"] = streaming_behavior.value
        self.send_command(cmd)
    
    def steer(
        self,
        message: str,
        images: Optional[List[ImageContent]] = None
    ) -> None:
        """Queue a steering message to interrupt the agent mid-run.
        
        Args:
            message: Steering message
            images: Optional list of images
        """
        cmd: Dict[str, Any] = {"type": "steer", "message": message}
        if images:
            cmd["images"] = [img.to_dict() for img in images]
        self.send_command(cmd)
    
    def follow_up(
        self,
        message: str,
        images: Optional[List[ImageContent]] = None
    ) -> None:
        """Queue a follow-up message to be processed after agent finishes.
        
        Args:
            message: Follow-up message
            images: Optional list of images
        """
        cmd: Dict[str, Any] = {"type": "follow_up", "message": message}
        if images:
            cmd["images"] = [img.to_dict() for img in images]
        self.send_command(cmd)
    
    # ===== Control Commands =====
    
    def abort(self) -> None:
        """Abort the current agent execution."""
        self.send_command({"type": "abort"})
    
    def reset(self) -> None:
        """Reset the agent session (clear all messages)."""
        self.send_command({"type": "reset"})
    
    # ===== Session Commands =====
    def _read_events(self):
        for line in self.proc.stdout:
            yield json.loads(line)

    def new_session(self) -> bool:
        """Create new session.
        
        Args:
            name: Optional session name
        """
        cmd: Dict[str, Any] = {"type": "new_session"}
        self.send_command(cmd)
        for event in self._read_events():
            logger.info(f"Received event: {event}")
            return event.get('success', False)
            
    
    def load_session(self, name: str) -> None:
        """Load a saved session.
        
        Args:
            name: Session name to load
        """
        self.send_command({"type": "load_session", "name": name})
    
    def list_sessions(self) -> None:
        """List all saved sessions."""
        self.send_command({"type": "list_sessions"})
    
    def delete_session(self, name: str) -> None:
        """Delete a saved session.
        
        Args:
            name: Session name to delete
        """
        self.send_command({"type": "delete_session", "name": name})
    
    # ===== Model Commands =====
    
    def set_model(self, model_id: str) -> None:
        """Set the active model.
        
        Args:
            model_id: Model ID to use
        """
        self.send_command({"type": "set_model", "modelId": model_id})
    
    def get_model(self) -> None:
        """Get the current model configuration."""
        self.send_command({"type": "get_model"})
    
    def list_models(self) -> None:
        """List all available models."""
        self.send_command({"type": "list_models"})
    
    # ===== Message Commands =====
    
    def get_messages(self) -> None:
        """Get all messages in the current session."""
        self.send_command({"type": "get_messages"})
    
    def delete_message(self, message_id: str) -> None:
        """Delete a message from the session.
        
        Args:
            message_id: ID of the message to delete
        """
        self.send_command({"type": "delete_message", "messageId": message_id})
    
    def edit_message(self, message_id: str, new_content: str) -> None:
        """Edit a message in the session.
        
        Args:
            message_id: ID of the message to edit
            new_content: New message content
        """
        self.send_command({
            "type": "edit_message",
            "messageId": message_id,
            "newContent": new_content
        })
    
    # ===== Bash Commands =====
    
    def bash(self, command: str, cwd: Optional[str] = None) -> None:
        """Execute a bash command.
        
        Args:
            command: Command to execute
            cwd: Working directory (optional)
        """
        cmd: Dict[str, Any] = {"type": "bash", "command": command}
        if cwd:
            cmd["cwd"] = cwd
        self.send_command(cmd)
    
    def bash_interrupt(self) -> None:
        """Interrupt the currently running bash command."""
        self.send_command({"type": "bash_interrupt"})
    
    # ===== Configuration Commands =====
    
    def set_steering_mode(self, mode: str) -> None:
        """Set the steering mode.
        
        Args:
            mode: Steering mode ("interrupt" or "queue")
        """
        self.send_command({"type": "set_steering_mode", "mode": mode})
    
    def get_steering_mode(self) -> None:
        """Get the current steering mode."""
        self.send_command({"type": "get_steering_mode"})
    
    def set_auto_approve(self, enabled: bool) -> None:
        """Enable or disable auto-approval of tool calls.
        
        Args:
            enabled: Whether to auto-approve
        """
        self.send_command({"type": "set_auto_approve", "enabled": enabled})
    
    def get_auto_approve(self) -> None:
        """Get the current auto-approve setting."""
        self.send_command({"type": "get_auto_approve"})
    
    # ===== Extension UI Protocol =====
    
    def extension_ui_response(
        self,
        request_id: str,
        value: Optional[Any] = None,
        confirmed: Optional[bool] = None,
        cancelled: bool = False
    ) -> None:
        """Send a response to an extension UI request.
        
        Args:
            request_id: ID of the UI request
            value: Response value (for select, input, editor)
            confirmed: Confirmation value (for confirm)
            cancelled: Whether the dialog was cancelled
        """
        cmd: Dict[str, Any] = {"type": "extension_ui_response", "id": request_id}
        if cancelled:
            cmd["cancelled"] = True
        elif value is not None:
            cmd["value"] = value
        elif confirmed is not None:
            cmd["confirmed"] = confirmed
        self.send_command(cmd)
    
    def handle_ui_request(self, request: Dict[str, Any]) -> None:
        """Handle an extension UI request (override in subclass or use callbacks).
        
        Args:
            request: UI request event
        """
        request_id = request.get("id")
        method = request.get("method")
        
        if not request_id:
            print("UI request missing ID", file=sys.stderr)
            return
        
        if method in self._ui_response_handlers:
            try:
                self._ui_response_handlers[method](request)
            except Exception as e:
                print(f"Error in UI handler: {e}", file=sys.stderr)
                self.extension_ui_response(request_id, cancelled=True)
        else:
            # Default: cancel all UI requests
            self.extension_ui_response(request_id, cancelled=True)
    
    def register_ui_handler(self, method: str, handler: Callable[[Dict[str, Any]], None]) -> None:
        """Register a handler for extension UI requests.
        
        Args:
            method: UI method name (select, confirm, input, editor)
            handler: Callback function
        """
        self._ui_response_handlers[method] = handler
    
    # ===== Utility Methods =====
    
    @staticmethod
    def load_image(path: str) -> ImageContent:
        """Load an image file and encode it as base64.
        
        Args:
            path: Path to image file
            
        Returns:
            ImageContent object
        """
        file_path = Path(path)
        mime_type = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".gif": "image/gif",
            ".webp": "image/webp"
        }.get(file_path.suffix.lower(), "image/png")
        
        with open(path, "rb") as f:
            data = base64.b64encode(f.read()).decode("utf-8")
        
        return ImageContent(data=data, mime_type=mime_type)
    
    def close(self) -> None:
        """Close the agent process."""
        if self.proc.stdin:
            self.proc.stdin.close()
        self.proc.wait()

    def is_closed(self) -> bool:
        """Check if the agent process has terminated."""
        return self.proc.poll() is not None
    
    def __enter__(self):
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()


def main():
    """Example usage of the complete RPC client."""
    with CompleteRPCClient(no_session=True) as client:
        # Register event handlers
        def on_text_delta(event):
            assistant_event = event.get("assistantMessageEvent", {})
            if assistant_event.get("type") == "text_delta":
                print(assistant_event["delta"], end="", flush=True)
        
        def on_agent_end(event):
            print("\n\nAgent finished.")
            print(f"Stop reason: {event.get('stopReason')}")
        
        def on_error(event):
            print(f"\nError: {event.get('error')}", file=sys.stderr)
        
        client.on("message_update", on_text_delta)
        client.on("agent_end", on_agent_end)
        client.on("error", on_error)
        
        # Get current model
        print("Getting current model...\n")
        client.get_model()
        
        # Send a prompt
        print("Sending prompt...\n")
        client.prompt("Hi, How can you help me?")
        
        # Process events
        for event in client.read_events():
            event_type = event.get("type")
            
            # Handle extension UI requests
            if event_type == "extension_ui_request":
                client.handle_ui_request(event)
            
            # Stop on agent_end
            if event_type == "agent_end":
                break
            
            # Stop on error
            if event_type == "error":
                break


if __name__ == "__main__":
    main()

