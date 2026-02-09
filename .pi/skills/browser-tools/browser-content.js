#!/usr/bin/env node
const puppeteer = require('puppeteer');
const Turndown = require('turndown');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

async function extractContent(url) {
  console.log(`Navigating to ${url}...`);

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions',
      '--start-maximized'
    ],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  try {
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    // Navigate to the URL
    await page.goto(url, { waitUntil: 'networkidle2' });

    const htmlContent = await page.content();

    // Use Readability to extract article content
    const dom = new JSDOM(htmlContent, { url });
    const reader = new Readability(dom.window.document);

    const article = reader.parse();

    if (!article || !article.content) {
      console.log('Could not extract readable content. Using full page HTML.');
      const markdownConverter = new Turndown();
      const markdown = markdownConverter.turndown(htmlContent);
      console.log(markdown);
      return;
    }

    // Convert to markdown
    const markdownConverter = new Turndown();
    const markdown = markdownConverter.turndown(article.content);

    console.log(`Title: ${article.title}`);
    console.log('---');
    console.log(markdown);

  } catch (error) {
    console.error('Error extracting content:', error);
  } finally {
    await browser.close();
  }
}

// Get URL from command line arguments
const url = process.argv[2];

if (!url) {
  console.error('Please provide a URL as an argument');
  process.exit(1);
}

extractContent(url);