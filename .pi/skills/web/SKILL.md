---
name: web
description: A utility skill for searching the web and extracting readable content from web pages, including sites that require JavaScript to render.
---


# Web

This skill provides simple Node.js–based scripts for:
- Searching the web using DuckDuckGo
- Navigating to web pages and extracting their main text content

It is especially useful for collecting up-to-date information, researching topics, or scraping pages that rely on client-side JavaScript.

All scripts are executed using Node.js.

## Setup

Run once before first use:

```
cd {baseDir}/web
npm install
```


## Web search

```
node {baseDir}/web-search.js <query> [--type \"web|image|video|news\"]
```

Search web using duckduckgo. 

## Extract Page Content

```
node {baseDir}/web-content.js <url>
```

Navigate to a URL and extract content as text. Works on pages with JavaScript content (waits for page to load).

## When to Use

- Seaching web with a query for web/news.
- extract content of a webpage.
- Scraping dynamic content that requires JS execution

