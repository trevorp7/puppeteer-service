import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json({ limit: "10mb" }));

// Health check route
app.get("/", (req, res) => {
  console.log("GET / hit");
  res.send("Puppeteer service is running ✅");
});

// PDF generation endpoint: POST /pdf with { url } or { html }
app.post("/pdf", async (req, res) => {
  console.log("POST /pdf hit", req.body);

  try {
    const { url, html } = req.body;

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
      headless: "new"
    });

    console.log("Browser launched, creating new page...");
    const page = await browser.newPage();

    if (url) {
      console.log(`Navigating to URL: ${url}`);
      await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
    } else {
      console.log("Setting HTML content...");
      await page.setContent(html, { waitUntil: "networkidle0", timeout: 60000 });
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
