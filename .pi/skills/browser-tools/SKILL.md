---
name: browser-tools
description: Browser automation. Use when you need to browse a website and extract content.
---

# Browser Tools

Opens a brave browser for content extraction.

## Setup

Run once before first use:

```bash
cd {baseDir}/browser-tools
npm install
```

## Extract Page Content

```bash
{baseDir}/browser-content.js https://example.com
```

Navigate to a URL and extract readable content as markdown. Uses Mozilla Readability for article extraction and Turndown for HTML-to-markdown conversion. Works on pages with JavaScript content (waits for page to load).
Url should include protocol http or https.

## When to Use

- extracting content
- Scraping dynamic content that requires JS execution
