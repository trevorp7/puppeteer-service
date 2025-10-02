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
    const browser = await puppeteer.launch({
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

    console.log("Browser launched, creating new page...");
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(45000);

    if (url) {
      console.log(`Navigating to URL: ${url}`);

      // If localStorage data is provided, inject it before navigation
      if (localStorageData) {
        console.log("Injecting localStorage data...");
        // Navigate to the domain first to set localStorage
        const urlObj = new URL(url);
        await page.goto(`${urlObj.origin}`, { waitUntil: 'domcontentloaded' });

        // Set localStorage items
        await page.evaluate((data) => {
          for (const [key, value] of Object.entries(data)) {
            localStorage.setItem(key, value);
          }
        }, localStorageData);

        console.log("localStorage injected successfully");
      }

      try {
        await page.goto(url, {
          waitUntil: ["load", "domcontentloaded"],
          timeout: 45000
        });
      } catch (navErr) {
        console.warn("Navigation timed out or failed, continuing with current content", navErr?.message);
      }
    } else {
      console.log("Setting HTML content...");
      try {
        await page.setContent(html, { waitUntil: "load", timeout: 45000 });
      } catch (contentErr) {
        console.warn("setContent timed out or failed, continuing to PDF", contentErr?.message);
      }
    }

    console.log("Generating PDF...");
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true
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
    res.status(500).json({ error: err.message, stack: err.stack });
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
