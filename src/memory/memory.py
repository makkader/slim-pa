from typing import Dict, List
from pydantic_ai.messages import ModelMessage

class ChatMemory:
    def __init__(self):
        # In-memory storage: chat_id -> list of ModelMessage
        self._storage: Dict[int, List[ModelMessage]] = {}
    def reset(self, chat_id: int):
        """Reset the memory for a specific chat."""
        self._storage[chat_id] = []
    def get_messages(self, chat_id: int) -> List[ModelMessage]:
        return self._storage.get(chat_id, [])

    def add_messages(self, chat_id: int, messages: List[ModelMessage]):
        if chat_id not in self._storage:
            self._storage[chat_id] = []
        self._storage[chat_id].extend(messages)
        # Keep last 20 messages for context
        if len(self._storage[chat_id]) > 20:
            self._storage[chat_id] = self._storage[chat_id][-20:]

memory = ChatMemory()
