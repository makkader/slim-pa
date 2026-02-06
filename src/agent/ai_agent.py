from pydantic_ai import Agent, RunContext
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider
from src.config.config import settings
from src.tools.web_tools import search_web, fetch_webpage
from loguru import logger

from langchain_community.agent_toolkits import PlayWrightBrowserToolkit
from langchain_community.tools.playwright.utils import create_async_playwright_browser
from pydantic_ai.ext.langchain import LangChainToolset
from pydantic_ai.mcp import MCPServerStdio



browser = MCPServerStdio('npx', args=['@playwright/mcp@latest','--headless'])

def get_model():
    if settings.LLM_PROVIDER == "lmstudio":
        return OpenAIModel(
            settings.LLM_MODEL_NAME, 
            provider=OpenAIProvider(
        base_url=settings.LLM_BASE_URL, 
        api_key='not-needed'       
    ))


agent = Agent(
    get_model(),
    toolsets=[browser],
    system_prompt=(
        "You are a helpful AI assistant with access to the web. "
        "Provide concise and accurate answers."
    ),
)

# @agent.tool
# async def search(ctx: RunContext[None], query: str) -> str:
#     """Search the web for information."""
#     return await search_web(query)
