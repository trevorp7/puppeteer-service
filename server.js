import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.set("trust proxy", 1);

// Basic request logging to help debug stalled requests
app.use((req, res, next) => {
  const startedAt = Date.now();
  console.log(
    `${new Date().toISOString()} -> ${req.method} ${req.originalUrl} from ${
      req.headers["x-forwarded-for"] || req.ip
    }`
  );
  res.on("close", () => {
    console.log(
      `${new Date().toISOString()} <- ${req.method} ${req.originalUrl} ` +
        `${res.statusCode} (${Date.now() - startedAt}ms)`
    );
  });
  next();
});

app.use(express.json({ limit: "10mb" }));

// Health check route
app.get("/", (req, res) => {
  console.log("GET / hit");
  res.send("Puppeteer service is running ✅");
});

// PDF generation endpoint: POST /pdf with { url } or { html } or { url, localStorage }
app.post("/pdf", async (req, res) => {
  console.log("POST /pdf hit", req.body);

  try {
    const { url, html, localStorage: localStorageData } = req.body;

    if (!url && !html) {
      console.log("Missing url or html in request body");
      return res.status(400).json({ error: "Need url or html" });
    }

    console.log("Launching browser...");
    let browser;
    try {
      browser = await puppeteer.launch({
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--no-first-run",
          "--no-zygote",
          "--single-process"
        ],
        headless: true,
        executablePath: puppeteer.executablePath?.() || undefined
      });
    } catch (launchErr) {
      console.error("Failed to launch browser:", launchErr);
      return res.status(500).json({
        error: "Failed to launch browser",
        details: launchErr.message
      });
    }

    console.log("Browser launched, creating new page...");
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(60000); // Increase timeout to 60s

    // Set viewport width to 900px for better PDF layout
    await page.setViewport({
      width: 900,
      height: 1080,
      deviceScaleFactor: 1
    });

    // Add console log listener to debug page issues
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.error('PAGE ERROR:', error.message));

    if (url) {
      console.log(`Navigating to URL: ${url}`);

      // If localStorage data is provided, inject it before navigation
      if (localStorageData) {
        console.log("Injecting localStorage data...");
        console.log("LocalStorage keys:", Object.keys(localStorageData));

        try {
          // Navigate to the domain first to set localStorage
          const urlObj = new URL(url);
          console.log(`First navigation to: ${urlObj.origin}`);
          await page.goto(`${urlObj.origin}`, {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          });

          // Set localStorage items
          await page.evaluate((data) => {
            for (const [key, value] of Object.entries(data)) {
              console.log(`Setting localStorage: ${key}`);
              localStorage.setItem(key, value);
            }
          }, localStorageData);

          console.log("localStorage injected successfully");
        } catch (storageErr) {
          console.error("Error injecting localStorage:", storageErr);
          // Continue anyway - maybe the page doesn't need auth
        }
      }

      try {
        console.log(`Final navigation to: ${url}`);
        await page.goto(url, {
          waitUntil: ["load", "domcontentloaded", "networkidle2"],
          timeout: 60000
        });
        console.log("Navigation completed successfully");
      } catch (navErr) {
        console.warn("Navigation timed out or failed, continuing with current content", navErr?.message);
      }

      // Wait for the loading indicator to disappear (for React apps)
      console.log("Waiting for content to load...");
      try {
        // Wait for loading text to disappear (max 30 seconds)
        await page.waitForFunction(
          () => {
            const body = document.body.innerText;
            return !body.includes('Loading roof access report');
          },
          { timeout: 30000 }
        );
        console.log("Content loaded successfully");
      } catch (waitErr) {
        console.warn("Timeout waiting for content, proceeding anyway", waitErr?.message);
      }

      // Additional wait for any animations/transitions
      await page.waitForTimeout(2000);
    } else {
      console.log("Setting HTML content...");
      try {
        await page.setContent(html, { waitUntil: "load", timeout: 45000 });
      } catch (contentErr) {
        console.warn("setContent timed out or failed, continuing to PDF", contentErr?.message);
      }
    }

    console.log("Generating PDF...");

    // Hide the app header and adjust spacing before generating PDF
    await page.evaluate(() => {
      // Hide the header with controls (Stage 1, 2, 3 sections)
      const header = document.querySelector('header');
      if (header) {
        header.remove(); // Remove instead of hiding to collapse the space
      }

      // Remove top margin/padding from all elements
      document.body.style.marginTop = '0';
      document.body.style.paddingTop = '0';
      document.documentElement.style.marginTop = '0';
      document.documentElement.style.paddingTop = '0';

      // Find and remove padding from the root div and main containers
      const root = document.querySelector('#root');
      if (root) {
        root.style.paddingTop = '0';
        root.style.marginTop = '0';
      }

      const main = document.querySelector('main');
      if (main) {
        main.style.paddingTop = '0';
        main.style.marginTop = '0';
      }

      // Remove background color to avoid gray inner content
      document.body.style.background = 'white';
      document.documentElement.style.background = 'white';

      // Add 32px top padding only
      document.body.style.paddingTop = '32px';
      document.body.style.paddingLeft = '0';
      document.body.style.paddingRight = '0';
      document.body.style.paddingBottom = '0';

      // Set minimum width but don't force full width to avoid white rails
      document.body.style.minWidth = '900px';

      // Log the actual viewport dimensions for debugging
      console.log('Viewport dimensions:', {
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      });
    });

    const pdfBuffer = await page.pdf({
      width: '900px',
      printBackground: true,
      timeout: 60000,
      preferCSSPageSize: false
    });

    console.log("Closing browser...");
    await browser.close();

    console.log("PDF generated successfully, sending response");
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=report.pdf"
    });

    res.send(pdfBuffer);
  } catch (err) {
    console.error("Error generating PDF:", err);
    console.error("Stack trace:", err.stack);
    res.status(500).json({
      error: err.message,
      stack: err.stack,
      type: err.constructor.name
    });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`PDF service running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Global error visibility
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
