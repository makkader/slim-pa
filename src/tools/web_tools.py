import httpx
from ddgs import DDGS
import trafilatura
from loguru import logger

async def search_web(query: str, max_results: int = 5) -> str:
    """Searches the web for a query and returns a summary of results."""
    logger.info(f"Searching web for: {query}")
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=max_results))
            if not results:
                return "No results found."
            
            formatted_results = []
            for r in results:
                formatted_results.append(f"Title: {r['title']}\nLink: {r['href']}\nSnippet: {r['body']}\n")
            return "\n".join(formatted_results)
    except Exception as e:
        logger.error(f"Error searching web: {e}")
        return f"Error searching web: {e}"

