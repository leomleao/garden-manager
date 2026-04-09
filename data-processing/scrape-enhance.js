'use strict';
// Dependencies: run `npm install cheerio sharp` in this directory first
// Usage:        node scrape-enhance.js

const fs    = require('fs');
const path  = require('path');
const https = require('https');
const http  = require('http');
const { load } = require('cheerio');
const sharp = require('sharp');

const DATA_PATH = path.join(__dirname, 'data.json');

// ─── HTTP helpers ────────────────────────────────────────────────────────────

function fetchText(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects < 0) return reject(new Error('Too many redirects'));
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; garden-scraper/1.0)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        return fetchText(next, redirects - 1).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function fetchBuffer(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    if (redirects < 0) return reject(new Error('Too many redirects'));
    const client = url.startsWith('https') ? https : http;
    client.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; garden-scraper/1.0)' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const next = res.headers.location.startsWith('http')
          ? res.headers.location
          : new URL(res.headers.location, url).href;
        res.resume();
        return fetchBuffer(next, redirects - 1).then(resolve).catch(reject);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveUrl(src, baseUrl) {
  if (!src) return null;
  if (src.startsWith('//'))   return 'https:' + src;
  if (src.startsWith('http')) return src;
  return new URL(src, baseUrl).href;
}

// ─── Image processing ────────────────────────────────────────────────────────
// Matches what the app does in handleImageUpload:
//   170×170 canvas, white background, cover-fill (Math.max scale), JPEG 0.9

async function processImage(imgSrc, baseUrl) {
  try {
    const url = resolveUrl(imgSrc, baseUrl);
    if (!url) return null;
    // Strip query params that can alter size (Shopify CDN etc.)
    const cleanUrl = url.split('?')[0];
    const buffer = await fetchBuffer(cleanUrl);
    const resized = await sharp(buffer)
      .resize(170, 170, {
        fit: 'cover',        // equivalent to Math.max scale + center crop
        position: 'centre',
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .jpeg({ quality: 90 })
      .toBuffer();
    return `data:image/jpeg;base64,${resized.toString('base64')}`;
  } catch (err) {
    console.warn(`    ⚠ Image failed: ${err.message}`);
    return null;
  }
}

// ─── Yorkshire Seeds scraper ─────────────────────────────────────────────────
// notes:               first #ld_itemDescription inside .product__description.rte.quick-add-hidden
// growing_instructions: span inside #ld_itemDescription
// image:               img inside .product__media.media.media--transparent

async function scrapeYorkshireSeeds(url) {
  const html = await fetchText(url);
  const $ = load(html);

  const descEl = $('.product__description.rte.quick-add-hidden')
    .find('#ld_itemDescription')
    .first();

  const notes               = descEl.text().trim() || null;
  const growing_instructions = descEl.find('span').map((_, el) => $(el).text().trim()).get().join(' ').trim() || null;

  const imgSrc = $('.product__media.media.media--transparent img').first().attr('src');
  const image  = imgSrc ? await processImage(imgSrc, url) : null;

  return { notes, growing_instructions, image };
}

// ─── Premier Seeds Direct scraper ────────────────────────────────────────────
// notes:               p inside .woocommerce-product-details__short-description
//                      + list items inside #tab-description
// growing_instructions: text content of #tab-key-facts
// image:               img.wp-post-image

async function scrapePremierSeedsDirect(url) {
  const html = await fetchText(url);
  const $ = load(html);

  const shortDesc = $('.woocommerce-product-details__short-description p')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .join(' ')
    .trim();

  const tabDescItems = $('#tab-description li')
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .join('; ')
    .trim();

  const notes = [shortDesc, tabDescItems].filter(Boolean).join(' | ') || null;

  const growing_instructions = $('#tab-key-facts').text().trim() || null;

  const imgSrc = $('img.wp-post-image').first().attr('src');
  const image  = imgSrc ? await processImage(imgSrc, url) : null;

  return { notes, growing_instructions, image };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const data  = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  const cache = {};   // keyed by purchase_link — avoids refetching the same URL
  let fetched = 0;

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const link = item.purchase_link;
    if (!link) continue;

    let scraper;
    if (link.includes('yorkshire-seeds.co.uk'))   scraper = scrapeYorkshireSeeds;
    else if (link.includes('premierseedsdirect.com')) scraper = scrapePremierSeedsDirect;
    else continue;

    if (!cache[link]) {
      if (fetched > 0) await delay(1200); // polite crawl delay
      process.stdout.write(`[${i + 1}/${data.length}] Fetching ${link} … `);
      try {
        cache[link] = await scraper(link);
        fetched++;
        console.log('OK');
      } catch (err) {
        console.log(`ERROR: ${err.message}`);
        cache[link] = {};
      }
    }

    const scraped = cache[link];
    if (scraped.notes               != null) item.notes               = scraped.notes;
    if (scraped.growing_instructions != null) item.growing_instructions = scraped.growing_instructions;
    if (scraped.image               != null) item.image               = scraped.image;
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
  console.log(`\nDone — fetched ${fetched} unique pages, saved ${DATA_PATH}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
