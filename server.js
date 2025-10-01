import express from "express";
import puppeteer from "puppeteer";

const app = express();
app.use(express.json({ limit: "10mb" }));

// Simple endpoint: POST /pdf with { url } or { html }
app.post("/pdf", async (req, res) => {
  const { url, html } = req.body;

  if (!url && !html) {
    return res.status(400).send({ error: "Need url or html" });
  }

  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();

  if (url) {
    await page.goto(url, { waitUntil: "networkidle0" });
  } else {
    await page.setContent(html, { waitUntil: "networkidle0" });
  }

  const pdfBuffer = await page.pdf({
    format: "A4",
    printBackground: true
  });

  await browser.close();

  res.set({
    "Content-Type": "application/pdf",
    "Content-Disposition": "inline; filename=report.pdf"
  });

  res.send(pdfBuffer);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`PDF service running on port ${port}`));
