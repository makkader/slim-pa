#!/usr/bin/env python3
"""
Complete Async RPC Client for pi-coding-agent
Full-featured async client with all RPC protocol capabilities including:
- Prompting with images and streaming behavior
- Session management
- Model configuration
- Extension UI protocol
- Event handling
- Bash execution
"""

import asyncio
import json
import sys
import base64
from typing import AsyncIterator, Dict, Any, Optional, List, Callable, Awaitable
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
        return {"type": "image", "data": self.data, "mimeType": self.mime_type}


class CompleteRPCClient:
    """Complete async RPC client with full protocol support."""

    def __init__(
        self,
        provider: str,
        model: Optional[str] = None,
        no_session: bool = False,
        session_dir: Optional[str] = None,
        additional_args: Optional[List[str]] = None,
        tools: Optional[str] = None,
    ):
        """Initialize the RPC client configuration.

        Args:
            provider: LLM provider (anthropic, openai, google, etc.)
            model: Model ID (optional)
            no_session: Disable session persistence
            session_dir: Custom session storage directory
            additional_args: Additional command-line arguments
            tools: Comma-separated list of tools to enable (optional)
        """
        self.cmd = ["pi", "--mode", "rpc", "--provider", provider]
        if model:
            self.cmd.extend(["--model", model])
        if no_session:
            self.cmd.append("--no-session")
        if session_dir:
            self.cmd.extend(["--session-dir", session_dir])
        if tools:
            self.cmd.extend(["--tools", tools])
        if additional_args:
            self.cmd.extend(additional_args)

        self.proc: Optional[asyncio.subprocess.Process] = None
        self._event_handlers: Dict[
            str, List[Callable[[Dict[str, Any]], Awaitable[None]]]
        ] = {}
        self._ui_response_handlers: Dict[
            str, Callable[[Dict[str, Any]], Awaitable[None]]
        ] = {}
        self._read_task: Optional[asyncio.Task] = None

    async def _watch_stderr(self):
        try:
            while True:
                line = await self.proc.stderr.readline()
                if not line:
                    break
                logger.error(f"STDERR: {line.decode().rstrip()}")
        except Exception as e:
            logger.error(f"stderr watcher crashed: {e}")

    async def start(self) -> None:
        """Start the agent process."""
        self.proc = await asyncio.create_subprocess_exec(
            *self.cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            limit=1024 * 1024,  # 1MB buffer
        )
        asyncio.create_task(self._watch_stderr())

    async def send_command(self, command: Dict[str, Any]) -> None:
        """Send a command to the agent."""
        if not self.proc or not self.proc.stdin:
            raise RuntimeError("Process not started or stdin is not available")

        data = json.dumps(command) + "\n"
        self.proc.stdin.write(data.encode())
        await self.proc.stdin.drain()

    async def read_events(self) -> AsyncIterator[Dict[str, Any]]:
        """Read events from the agent stdout."""
        if not self.proc or not self.proc.stdout:
            raise RuntimeError("Process not started or stdout is not available")

        while True:
            line = await self.proc.stdout.readline()
            if not line:
                break

            line_str = line.decode().strip()
            if line_str:
                try:
                    event = json.loads(line_str)
                    await self._dispatch_event(event)
                    yield event
                except json.JSONDecodeError as e:
                    print(f"Failed to parse event: {e}", file=sys.stderr)

    def on(
        self, event_type: str, handler: Callable[[Dict[str, Any]], Awaitable[None]]
    ) -> None:
        """Register an async event handler.

        Args:
            event_type: Event type to listen for
            handler: Async callback function
        """
        if event_type not in self._event_handlers:
            self._event_handlers[event_type] = []
        self._event_handlers[event_type].append(handler)

    async def _dispatch_event(self, event: Dict[str, Any]) -> None:
        """Dispatch event to registered handlers."""
        event_type = event.get("type")
        if event_type in self._event_handlers:
            tasks = []
            for handler in self._event_handlers[event_type]:
                try:
                    tasks.append(handler(event))
                except Exception as e:
                    print(f"Error creating handler task: {e}", file=sys.stderr)

            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)

    # ===== Prompting Commands =====

    async def prompt(
        self,
        message: str,
        images: Optional[List[ImageContent]] = None,
        streaming_behavior: Optional[StreamingBehavior] = None,
        request_id: Optional[str] = None,
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
        await self.send_command(cmd)

    async def steer(
        self, message: str, images: Optional[List[ImageContent]] = None
    ) -> None:
        """Queue a steering message to interrupt the agent mid-run.

        Args:
            message: Steering message
            images: Optional list of images
        """
        cmd: Dict[str, Any] = {"type": "steer", "message": message}
        if images:
            cmd["images"] = [img.to_dict() for img in images]
        await self.send_command(cmd)

    async def follow_up(
        self, message: str, images: Optional[List[ImageContent]] = None
    ) -> None:
        """Queue a follow-up message to be processed after agent finishes.

        Args:
            message: Follow-up message
            images: Optional list of images
        """
        cmd: Dict[str, Any] = {"type": "follow_up", "message": message}
        if images:
            cmd["images"] = [img.to_dict() for img in images]
        await self.send_command(cmd)

    # ===== Control Commands =====

    async def abort(self) -> None:
        """Abort the current agent execution."""
        await self.send_command({"type": "abort"})

    async def reset(self) -> None:
        """Reset the agent session (clear all messages)."""
        await self.send_command({"type": "reset"})

    # ===== Session Commands =====
    async def new_session(self) -> None:
        """Create a new session.

        Args:
            name: Optional session name
        """
        cmd: Dict[str, Any] = {"type": "new_session"}
        await self.send_command(cmd)

    async def save_session(self, name: Optional[str] = None) -> None:
        """Save the current session.

        Args:
            name: Optional session name
        """
        cmd: Dict[str, Any] = {"type": "save_session"}
        if name:
            cmd["name"] = name
        await self.send_command(cmd)

    async def load_session(self, name: str) -> None:
        """Load a saved session.

        Args:
            name: Session name to load
        """
        await self.send_command({"type": "load_session", "name": name})

    async def list_sessions(self) -> None:
        """List all saved sessions."""
        await self.send_command({"type": "list_sessions"})

    async def delete_session(self, name: str) -> None:
        """Delete a saved session.

        Args:
            name: Session name to delete
        """
        await self.send_command({"type": "delete_session", "name": name})

    # ===== Model Commands =====

    async def set_model(self, model_id: str) -> None:
        """Set the active model.

        Args:
            model_id: Model ID to use
        """
        await self.send_command({"type": "set_model", "modelId": model_id})

    async def get_model(self) -> None:
        """Get the current model configuration."""
        await self.send_command({"type": "get_model"})

    async def list_models(self) -> None:
        """List all available models."""
        await self.send_command({"type": "list_models"})

    # ===== Message Commands =====

    async def get_messages(self) -> None:
        """Get all messages in the current session."""
        await self.send_command({"type": "get_messages"})

    async def delete_message(self, message_id: str) -> None:
        """Delete a message from the session.

        Args:
            message_id: ID of the message to delete
        """
        await self.send_command({"type": "delete_message", "messageId": message_id})

    async def edit_message(self, message_id: str, new_content: str) -> None:
        """Edit a message in the session.

        Args:
            message_id: ID of the message to edit
            new_content: New message content
        """
        await self.send_command(
            {"type": "edit_message", "messageId": message_id, "newContent": new_content}
        )

    # ===== Bash Commands =====

    async def bash(self, command: str, cwd: Optional[str] = None) -> None:
        """Execute a bash command.

        Args:
            command: Command to execute
            cwd: Working directory (optional)
        """
        cmd: Dict[str, Any] = {"type": "bash", "command": command}
        if cwd:
            cmd["cwd"] = cwd
        await self.send_command(cmd)

    async def bash_interrupt(self) -> None:
        """Interrupt the currently running bash command."""
        await self.send_command({"type": "bash_interrupt"})

    # ===== Configuration Commands =====

    async def set_steering_mode(self, mode: str) -> None:
        """Set the steering mode.

        Args:
            mode: Steering mode ("interrupt" or "queue")
        """
        await self.send_command({"type": "set_steering_mode", "mode": mode})

    async def get_steering_mode(self) -> None:
        """Get the current steering mode."""
        await self.send_command({"type": "get_steering_mode"})

    async def set_auto_approve(self, enabled: bool) -> None:
        """Enable or disable auto-approval of tool calls.

        Args:
            enabled: Whether to auto-approve
        """
        await self.send_command({"type": "set_auto_approve", "enabled": enabled})

    async def get_auto_approve(self) -> None:
        """Get the current auto-approve setting."""
        await self.send_command({"type": "get_auto_approve"})

    # ===== Extension UI Protocol =====

    async def extension_ui_response(
        self,
        request_id: str,
        value: Optional[Any] = None,
        confirmed: Optional[bool] = None,
        cancelled: bool = False,
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
        await self.send_command(cmd)

    async def handle_ui_request(self, request: Dict[str, Any]) -> None:
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
                await self._ui_response_handlers[method](request)
            except Exception as e:
                print(f"Error in UI handler: {e}", file=sys.stderr)
                await self.extension_ui_response(request_id, cancelled=True)
        else:
            # Default: cancel all UI requests
            await self.extension_ui_response(request_id, cancelled=True)

    def register_ui_handler(
        self, method: str, handler: Callable[[Dict[str, Any]], Awaitable[None]]
    ) -> None:
        """Register an async handler for extension UI requests.

        Args:
            method: UI method name (select, confirm, input, editor)
            handler: Async callback function
        """
        self._ui_response_handlers[method] = handler

    # ===== Utility Methods =====

    @staticmethod
    async def load_image(path: str) -> ImageContent:
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
            ".webp": "image/webp",
        }.get(file_path.suffix.lower(), "image/png")

        # Use asyncio to read file asynchronously
        loop = asyncio.get_event_loop()
        data = await loop.run_in_executor(
            None, lambda: base64.b64encode(open(path, "rb").read()).decode("utf-8")
        )

        return ImageContent(data=data, mime_type=mime_type)

    async def close(self) -> None:
        """Close the agent process."""
        if self.proc and self.proc.stdin:
            self.proc.stdin.close()
            await self.proc.stdin.wait_closed()
        if self.proc:
            await self.proc.wait()

    async def is_closed(self) -> bool:
        """Check if the agent process has terminated."""
        return self.proc.poll() is not None

    async def __aenter__(self):
        await self.start()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()


async def main():
    """Example usage of the complete async RPC client."""
    async with CompleteRPCClient(
        model="qwen/qwen3-coder-30b", no_session=True
    ) as client:
        # Register event handlers
        async def on_text_delta(event):
            assistant_event = event.get("assistantMessageEvent", {})
            if assistant_event.get("type") == "text_delta":
                print(assistant_event["delta"], end="", flush=True)

        async def on_agent_end(event):
            print("\n\nAgent finished.")
            print(f"Stop reason: {event.get('stopReason')}")

        async def on_error(event):
            print(f"\nError: {event.get('error')}", file=sys.stderr)

        client.on("message_update", on_text_delta)
        client.on("agent_end", on_agent_end)
        client.on("error", on_error)

        # Get current model
        print("Getting current model...\n")
        await client.get_model()

        # Send a prompt
        print("Sending prompt...\n")
        await client.prompt("What is your name? Please respond with a short answer.")

        # Process events
        async for event in client.read_events():
            event_type = event.get("type")

            # # Handle extension UI requests
            # if event_type == "extension_ui_request":
            #     await client.handle_ui_request(event)

            # Stop on agent_end
            if event_type == "agent_end":
                break

            # Stop on error
            if event_type == "error":
                break


if __name__ == "__main__":
    asyncio.run(main())
