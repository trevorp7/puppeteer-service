# Puppeteer PDF Service

A microservice that generates PDFs from URLs or HTML using Puppeteer.

## Endpoints

### POST /pdf

Generate a PDF from a URL or HTML content.

**Request Body:**
```json
{
  "url": "https://example.com"
}
```

OR

```json
{
  "html": "<h1>Hello World</h1>"
}
```

**Response:**
- Content-Type: `application/pdf`
- PDF binary data

## Local Development

```bash
npm install
npm start
```

## Testing

```bash
curl -X POST http://localhost:3000/pdf \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}' \
  --output test.pdf
```

## Deployment

This service is designed to be deployed on Render.com.

### Render Configuration
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
