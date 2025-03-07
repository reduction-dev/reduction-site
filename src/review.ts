import { chromium } from "playwright";
import TurndownService from "turndown";
import * as fs from "fs/promises";
import * as path from "path";

const docs = [
  "/",
  "/getting-started",
  "/tutorials/first-job",
  "/tutorials/tumbling-windows",
  "/tutorials/sliding-windows",
  "/tutorials/session-windows",
];

const urls = docs.map((doc) => `http://localhost:3000/docs${doc}`);

async function scrapeAndConvert() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Clear and create the review directory
  const reviewDir = path.join(__dirname, "..", "review");
  await fs.rm(reviewDir, { recursive: true, force: true });
  await fs.mkdir(reviewDir, { recursive: true });

  const turndownService = new TurndownService({
    codeBlockStyle: "fenced",
    fence: "```",
  });

  // Add custom rule to handle code blocks with proper formatting
  turndownService.addRule("codeBlocks", {
    filter: function (node) {
      return node.nodeName === "PRE" && node.classList.contains("prism-code");
    },
    replacement: function (content, node) {
      if (!('className' in node)) {
        return content;
      }

      // Extract the language from the class attribute
      const languageMatch = node.className.match(/language-(\w+)/);
      const language = languageMatch ? languageMatch[1] : "";

      // Get all code lines by extracting text from each line span
      let codeContent: string | null = "";
      try {
        const codeLines = node.querySelectorAll(".token-line");
        codeLines.forEach((line) => {
          // Get the plain text content of the line
          codeContent += line.textContent + "\n";
        });
      } catch (e) {
        // Fallback to node's text content if DOM querying fails
        codeContent = node.textContent;
      }

      // Return formatted code block
      return "\n\n```" + language + "\n" + codeContent + "```\n\n";
    },
  });

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    console.log(`Processing ${url}`);
    await page.goto(url);

    // Wait for the article to be available
    await page.waitForSelector("article");

    // Pre-process: Group content within tabs
    const tabContainers = await page.$$(".tabs-container");
    for (const tabContainer of tabContainers) {
      // Get all tab titles
      const tabTitles = await tabContainer.$$eval('li[role="tab"]', (tabs) =>
        tabs.map((tab) => tab.textContent?.trim() || "")
      );

      // Get all tab panels
      const tabPanels = await Promise.all(
        (
          await tabContainer.$$('div[role="tabpanel"]')
        ).map((panel) => panel.evaluate((el) => el.outerHTML))
      );

      // Create a replacement div with all tab contents
      await tabContainer.evaluate(
        (el, { titles, contents }) => {
          const div = document.createElement("div");
          div.innerHTML = "<p>(Start-Tabs)</p>";
          for (let i = 0; i < titles.length; i++) {
            div.innerHTML += `<b>${titles[i]} Tab Panel</b>: ` + contents[i];
          }
          div.innerHTML += "<p>(End-Tabs)</p>";
          el.replaceWith(div);
        },
        { titles: tabTitles, contents: tabPanels }
      );
    }

    // Get the content of the first article after preprocessing
    const content = await page.$eval("article .markdown", (element) => element.innerHTML);

    // Convert to markdown
    let markdown = turndownService.turndown(content);

    // Create filename from URL
    const filename = path.join(reviewDir, `${i.toString().padStart(2, "0")}_${url.split("/").pop() || "index"}.md`);

    // Save to file
    await fs.writeFile(filename, markdown, "utf-8");
    console.log(`Saved to ${filename}`);
  }

  await browser.close();
}

// Run the scraper
scrapeAndConvert().catch(console.error);
