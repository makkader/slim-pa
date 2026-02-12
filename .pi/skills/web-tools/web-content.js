#!/usr/bin/env node
import puppeteer from 'puppeteer';


async function extractContent(url) {
  console.log(`Navigating to ${url}...`);

  let exePath = '/usr/bin/chromium'; // default for docker/linux

  if (process.platform === 'darwin') {
    exePath = '/opt/homebrew/bin/chromium';
  }

  console.log("exePath:", exePath);
  const browser = await puppeteer.launch({
    executablePath: exePath,
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-extensions',
      '--start-maximized',
      '--no-sandbox'
    ],
    defaultViewport: null,
  });

  const page = await browser.newPage();

  try {
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    // Navigate to the URL
    await page.goto(url, { waitUntil: 'networkidle2' }); //{waitUntil: 'networkidle2'}

    const textContent = await page.evaluate(() => document.body.innerText);
    console.log(textContent);


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