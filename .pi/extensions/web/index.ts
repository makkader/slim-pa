/**
 * Web extension for searching and extracting web content.
 * 
 * This extension provides tools for:
 * - Searching the web using DuckDuckGo
 * - Extracting readable content from web pages
 * 
 * Requires: npm install in this directory
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { search } from "@navetacandra/ddg";
import puppeteer from "puppeteer";

export default function (pi: ExtensionAPI) {
  // Register web_search tool
  pi.registerTool({
    name: "web_search",
    label: "Web Search",
    description: "Search the web using DuckDuckGo for web results, news, images, or videos.",
    parameters: Type.Object({
      query: Type.String({
        description: "The search query to search for",
      }),
      type: Type.Optional(
        Type.String({
          description: "Search type: web, image, video, or news (default: web)",
          default: "web",
        })
      ),
    }),
    execute: async (_toolCallId, params) => {
      try {
        const query = params.query as string;
        const searchType = (params.type as string) || "web";

        // Validate search type
        const validTypes = ["web", "image", "video", "news"];
        if (!validTypes.includes(searchType)) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Invalid search type '${searchType}'. Valid types are: ${validTypes.join(", ")}`,
              },
            ],
            isError: true,
            details: {},
          };
        }

        const result = await search({ query }, searchType as "web" | "image" | "video" | "news");

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
          details: {},
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Search error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: {},
        };
      }
    },
  });

  // Register web_content tool
  pi.registerTool({
    name: "web_content",
    label: "Extract Web Content",
    description: "Navigate to a URL and extract the main text content. Works on pages with JavaScript content.",
    parameters: Type.Object({
      url: Type.String({
        description: "The URL to extract content from",
      }),
    }),
    execute: async (_toolCallId, params) => {
      let browser;
      try {
        const urlInput = params.url as string;
        
        // Ensure URL has protocol
        let url = urlInput;
        if (!/^https?:\/\//i.test(url)) {
          url = "https://" + url;
        }

        // Determine chromium executable path
        let exePath = "/usr/bin/chromium"; // default for docker/linux
        if (process.platform === "darwin") {
          exePath = "/opt/homebrew/bin/chromium";
        }

        browser = await puppeteer.launch({
          executablePath: exePath,
          headless: false,
          args: [
            "--disable-blink-features=AutomationControlled",
            "--disable-extensions",
            "--start-maximized",
            "--no-sandbox",
          ],
          defaultViewport: null,
        });

        const page = await browser.newPage();

        // Navigate to the URL
        await page.goto(url, { waitUntil: "networkidle2" });

        // Extract text content
        const textContent = await page.evaluate(() => document.body.innerText);

        // Truncate if too long (for LLM context limits)
        const maxLength = 100000;
        const finalContent = textContent.length > maxLength 
          ? textContent.substring(0, maxLength) + "\n\n[Content truncated...]"
          : textContent;

        await browser.close();
        browser = undefined;

        return {
          content: [
            {
              type: "text",
              text: `Extracted content from ${url}:\n\n${finalContent}`,
            },
          ],
          details: {},
        };
      } catch (error) {
        if (browser) {
          try {
            await browser.close();
          } catch (closeError) {
            // Ignore close errors
          }
        }
        return {
          content: [
            {
              type: "text",
              text: `Error extracting content: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
          details: {},
        };
      }
    },
  });
}
