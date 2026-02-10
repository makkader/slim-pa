
---
name: web-tools
description: This skill allows to search the web and extract content from web pages. 
---


# Web Tools

This skill uses web search capabilities to find relevant information and extract key content from web pages. It's particularly useful for gathering current information or researching topics that require up-to-date data.
run each script with node.

## Setup

Run once before first use:

```bash
cd {baseDir}/web-tools
npm install
```


## Web search

```bash
{baseDir}/web-search.js <query> [--type \"web|image|video|news\"]
```

Search web using duckduckgo. 

## Extract Page Content

```bash
{baseDir}/web-content.js <url>
```

Navigate to a URL and extract content as text. Works on pages with JavaScript content (waits for page to load).

## When to Use

- Seaching web with a query for web/news.
- extract content of a webpage.
- Scraping dynamic content that requires JS execution

