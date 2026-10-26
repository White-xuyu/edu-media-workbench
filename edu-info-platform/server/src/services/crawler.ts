import * as cheerio from 'cheerio'
import { v4 as uuidv4 } from 'uuid'
import { readData, writeData } from '../utils/storage.js'

interface Website {
  id: string
  name: string
  url: string
  description: string
  icon: string
  categoryId: string
  tags: string[]
  type?: 'website' | 'wechat'
  isPublic?: boolean
  userId: string
  createdAt: string
  updatedAt?: string
}

interface Article {
  id: string
  title: string
  url: string
  summary: string
  sourceId: string
  sourceName: string
  sourceType: 'website' | 'wechat'
  categoryId: string
  tags: string[]
  publishDate?: string | null
  crawledAt: string
  createdAt: string
}

interface CrawlSourceResult {
  sourceId: string
  sourceName: string
  status: 'success' | 'failed' | 'skipped_wechat'
  articlesFound: number
  error?: string
  message?: string
}

// Module-level lock to prevent concurrent crawl jobs
let isCrawling = false

// User-Agent for crawler
const USER_AGENT = 'edu-info-platform-crawler/1.0 (Education Info Aggregator)'

// Max articles per source per crawl
const MAX_ARTICLES_PER_SOURCE = 20

// Delay between crawling different sources (ms) — 保持礼貌但不过慢
function delay(): Promise<void> {
  const ms = 600 + Math.random() * 900
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// 较短的延时，用于抓取单篇文章详情页做富化
function delayEnrich(): Promise<void> {
  const ms = 300 + Math.random() * 500
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Normalize URL for dedup comparison
function normalizeUrl(url: string): string {
  try {
    let u = url.trim().toLowerCase()
    // Remove trailing slash
    u = u.replace(/\/$/, '')
    // Remove www. prefix
    u = u.replace(/^https?:\/\/www\./, 'https://')
    // Remove hash
    u = u.replace(/#.*$/, '')
    return u
  } catch {
    return url.trim().toLowerCase()
  }
}

// Fetch with timeout
async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    return response
  } finally {
    clearTimeout(timer)
  }
}

// Detect a page/feed charset from the Content-Type header, then from the
// <meta charset> / <meta http-equiv="Content-Type"> declaration.
// Many Chinese education sites (e.g. ict.edu.cn) still serve GBK, and decoding
// those as UTF-8 turns every headline into mojibake.
function detectCharset(buffer: Buffer, contentType: string | null): string {
  const fromHeader = contentType && contentType.match(/charset=["']?([a-zA-Z0-9\-_]+)/i)
  if (fromHeader) return fromHeader[1].toLowerCase()

  const head = buffer.subarray(0, 2048).toString('latin1')
  const metaCharset = head.match(/<meta[^>]+charset=["']?\s*([a-zA-Z0-9\-_]+)/i)
  if (metaCharset) return metaCharset[1].toLowerCase()

  const httpEquiv = head.match(/<meta[^>]+http-equiv=["']?content-type["']?[^>]*>/i)
  if (httpEquiv) {
    const cs = httpEquiv[0].match(/charset=["']?\s*([a-zA-Z0-9\-_]+)/i)
    if (cs) return cs[1].toLowerCase()
  }

  // XML declarations default to UTF-8
  return 'utf-8'
}

// Decode a response body using the charset the server actually declared.
async function decodeBody(response: Response): Promise<string> {
  const buffer = Buffer.from(await response.arrayBuffer())
  const charset = detectCharset(buffer, response.headers.get('content-type'))

  if (charset === 'utf-8' || charset === 'utf8') {
    return buffer.toString('utf-8')
  }

  try {
    return new TextDecoder(charset).decode(buffer)
  } catch {
    // Unknown/unsupported charset label - fall back to UTF-8
    return buffer.toString('utf-8')
  }
}

// Fetch a URL and return correctly-decoded text (empty string on any failure).
async function fetchText(url: string, timeoutMs = 10000): Promise<string> {
  const response = await fetchWithTimeout(url, timeoutMs)
  if (!response.ok) return ''
  return decodeBody(response)
}

// Collapse the messy whitespace that anchor text often carries
function cleanText(str: string): string {
  return str.replace(/\s+/g, ' ').trim()
}

// Homepage anchors often concatenate the publish date into the link text
// (e.g. "…的通知\t\t\t2026-10-12"); the real date lives in publishDate.
function cleanTitle(str: string): string {
  return cleanText(str).replace(/[\s\-—–]*\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?[\s]*$/, '').trim()
}

// Strip HTML tags from text
function stripHtml(html: string): string {
  return cleanText(
    html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' '),
  )
}

// Truncate string
function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.substring(0, maxLen - 3) + '...'
}

// Parse RSS/Atom XML and extract articles
function parseFeedXML(xml: string, sourceId: string, sourceName: string, sourceType: 'website' | 'wechat', categoryId: string, tags: string[]): Article[] {
  const articles: Article[] = []
  const now = new Date().toISOString()

  // Try RSS <item> format
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi
  let itemMatch
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const item = itemMatch[1]
    const title = extractTag(item, 'title')
    const link = extractTag(item, 'link')
    const description = extractTag(item, 'description')
    const pubDate = extractTag(item, 'pubDate')

    if (title && link) {
      articles.push({
        id: uuidv4(),
        title: stripHtml(title),
        url: link,
        summary: truncate(stripHtml(description || ''), 300),
        sourceId,
        sourceName,
        sourceType,
        categoryId,
        tags,
        publishDate: pubDate ? new Date(pubDate).toISOString() : null,
        crawledAt: now,
        createdAt: now,
      })
    }
  }

  // If no RSS items, try Atom <entry> format
  if (articles.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi
    let entryMatch
    while ((entryMatch = entryRegex.exec(xml)) !== null) {
      const entry = entryMatch[1]
      const title = extractTag(entry, 'title')
      const link = extractLinkHref(entry)
      const summary = extractTag(entry, 'summary') || extractTag(entry, 'content')
      const published = extractTag(entry, 'published') || extractTag(entry, 'updated')

      if (title && link) {
        articles.push({
          id: uuidv4(),
          title: stripHtml(title),
          url: link,
          summary: truncate(stripHtml(summary || ''), 300),
          sourceId,
          sourceName,
          sourceType,
          categoryId,
          tags,
          publishDate: published ? new Date(published).toISOString() : null,
          crawledAt: now,
          createdAt: now,
        })
      }
    }
  }

  return articles.slice(0, MAX_ARTICLES_PER_SOURCE)
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
  const match = xml.match(regex)
  return match ? match[1].trim() : ''
}

function extractLinkHref(xml: string): string {
  const match = xml.match(/<link[^>]*href="([^"]*)"[^>]*\/?>/i)
  if (match) return match[1]
  // Try rel="alternate" type
  const altMatch = xml.match(/<link[^>]*href="([^"]*)"[^>]*>/i)
  return altMatch ? altMatch[1] : ''
}

// Find RSS/Atom feed URL from homepage HTML
async function findFeedUrl(homepageUrl: string): Promise<string | null> {
  try {
    // First try parsing the homepage for feed links
    const html = await fetchText(homepageUrl)
    if (!html) return null

    const $ = cheerio.load(html)

    // Look for RSS/Atom link tags
    const feedLink = $('link[type="application/rss+xml"], link[type="application/atom+xml"]').first()
    if (feedLink.length > 0) {
      const href = feedLink.attr('href')
      if (href) {
        // Resolve relative URLs
        try {
          return new URL(href, homepageUrl).href
        } catch {
          return null
        }
      }
    }

    return null
  } catch {
    return null
  }
}

// Try common RSS paths
async function tryCommonFeedPaths(baseUrl: string): Promise<string | null> {
  const commonPaths = ['/rss', '/feed', '/rss.xml', '/atom.xml', '/index.xml', '/rss.php', '/feed.xml']
  const urlObj = new URL(baseUrl)
  const origin = urlObj.origin

  for (const path of commonPaths) {
    try {
      const feedUrl = origin + path
      const response = await fetchWithTimeout(feedUrl, 8000)
      if (response.ok) {
        const contentType = response.headers.get('content-type') || ''
        const text = await decodeBody(response)
        // Check if it looks like XML/feed content
        if (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom') ||
            text.trim().startsWith('<?xml') || text.includes('<rss') || text.includes('<feed') || text.includes('<item>')) {
          return feedUrl
        }
      }
    } catch {
      // Continue to next path
    }
    await new Promise((r) => setTimeout(r, 300))
  }

  return null
}

// HTML scraping fallback: extract article links from homepage
async function scrapeHomepage(url: string, sourceId: string, sourceName: string, sourceType: 'website' | 'wechat', categoryId: string, tags: string[]): Promise<Article[]> {
  const articles: Article[] = []
  const now = new Date().toISOString()

  try {
    const html = await fetchText(url)
    if (!html) return articles

    const $ = cheerio.load(html)
    const baseUrl = new URL(url)
    const seen = new Set<string>()

    // Find article-like links
    $('a').each((_, el) => {
      const $a = $(el)
      const href = $a.attr('href')
      const text = cleanText($a.text())

      if (!href || !text) return
      if (text.length < 8 || text.length > 200) return // Skip too short or too long

      try {
        const fullUrl = new URL(href, baseUrl.origin).href
        const normalized = normalizeUrl(fullUrl)

        // Skip non-article URLs
        if (normalized === normalizeUrl(url)) return
        if (seen.has(normalized)) return
        if (href.startsWith('#') || href.startsWith('javascript:')) return
        if (href.includes('/tag/') || href.includes('/category/') || href.includes('/author/')) return

        seen.add(normalized)

        articles.push({
          id: uuidv4(),
          title: cleanTitle(text),
          url: fullUrl,
          summary: '',
          sourceId,
          sourceName,
          sourceType,
          categoryId,
          tags,
          publishDate: null,
          crawledAt: now,
          createdAt: now,
        })
      } catch {
        // Invalid URL, skip
      }
    })

    // Try to enrich articles with descriptions by fetching article pages
    const topArticles = articles.slice(0, 5)
    for (const article of topArticles) {
      try {
        await delayEnrich()
        const artHtml = await fetchText(article.url, 8000)
        if (artHtml) {
          const $art = cheerio.load(artHtml)

          // Get meta description
          const metaDesc = $art('meta[name="description"]').attr('content') ||
                           $art('meta[property="og:description"]').attr('content')
          if (metaDesc) {
            article.summary = truncate(metaDesc.trim(), 300)
          } else {
            // Get first paragraph
            const firstP = $art('article p, .article p, .content p, p').first().text().trim()
            if (firstP) {
              article.summary = truncate(firstP, 300)
            }
          }

          // Try to get publish date from meta
          const pubDate = $art('meta[property="article:published_time"]').attr('content') ||
                          $art('meta[name="pubdate"]').attr('content') ||
                          $art('meta[name="publishdate"]').attr('content') ||
                          $art('time[datetime]').attr('datetime')
          if (pubDate) {
            try {
              article.publishDate = new Date(pubDate).toISOString()
            } catch { /* ignore invalid date */ }
          }
        }
      } catch {
        // Skip enrichment for this article
      }
    }
  } catch {
    // Return whatever we found
  }

  return articles.slice(0, MAX_ARTICLES_PER_SOURCE)
}

// Main crawl function for a single website
async function crawlWebsite(website: Website): Promise<{ articles: Article[]; result: CrawlSourceResult }> {
  const baseResult: CrawlSourceResult = {
    sourceId: website.id,
    sourceName: website.name,
    status: 'failed',
    articlesFound: 0,
  }

  // Skip wechat sources
  if (website.type === 'wechat') {
    return {
      articles: [],
      result: {
        ...baseResult,
        status: 'skipped_wechat',
        message: `请在微信中搜索"${website.name}"查看最新文章`,
      },
    }
  }

  let articles: Article[] = []

  try {
    // Phase 1: Try RSS/Atom
    let feedUrl = await findFeedUrl(website.url)

    if (!feedUrl) {
      await new Promise((r) => setTimeout(r, 500))
      feedUrl = await tryCommonFeedPaths(website.url)
    }

    const categoryId = website.categoryId || ''
    const tags = website.tags || []

    if (feedUrl) {
      await delay()
      const feedXml = await fetchText(feedUrl)
      if (feedXml) {
        articles = parseFeedXML(feedXml, website.id, website.name, website.type || 'website', categoryId, tags)
      }
    }

    // Phase 2: HTML scraping fallback
    if (articles.length === 0) {
      await delay()
      articles = await scrapeHomepage(website.url, website.id, website.name, website.type || 'website', categoryId, tags)
    }

    return {
      articles,
      result: {
        ...baseResult,
        status: 'success',
        articlesFound: articles.length,
      },
    }
  } catch (err: any) {
    return {
      articles: [],
      result: {
        ...baseResult,
        status: 'failed',
        error: err.message || 'Unknown error',
      },
    }
  }
}

// Dedup and insert articles into storage
function saveArticles(newArticles: Article[]): number {
  if (newArticles.length === 0) return 0

  const existing = readData('articles.json') as Article[]
  const existingUrls = new Set(existing.map((a) => normalizeUrl(a.url)))

  let inserted = 0
  for (const article of newArticles) {
    if (!existingUrls.has(normalizeUrl(article.url))) {
      existing.push(article)
      existingUrls.add(normalizeUrl(article.url))
      inserted++
    }
  }

  // Trim old articles if exceeding 5000
  if (existing.length > 5000) {
    const sorted = existing.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
    writeData('articles.json', sorted.slice(0, 5000))
  } else {
    writeData('articles.json', existing)
  }

  return inserted
}

// Get last crawl status
function getLastCrawlStatus(): { lastCrawlAt: string | null; totalArticles: number } {
  const articles = readData('articles.json') as Article[]
  let lastCrawlAt: string | null = null
  for (const a of articles) {
    if (!lastCrawlAt || a.crawledAt > lastCrawlAt) {
      lastCrawlAt = a.crawledAt
    }
  }
  return { lastCrawlAt, totalArticles: articles.length }
}

// Main execution: crawl all or specific sources
export async function executeCrawl(websites: Website[]): Promise<{
  status: string
  totalSources: number
  successCount: number
  failCount: number
  skippedWechat: number
  newArticles: number
  results: CrawlSourceResult[]
}> {
  if (isCrawling) {
    return {
      status: 'already_running',
      totalSources: 0,
      successCount: 0,
      failCount: 0,
      skippedWechat: 0,
      newArticles: 0,
      results: [],
    }
  }

  isCrawling = true
  const results: CrawlSourceResult[] = []
  let successCount = 0
  let failCount = 0
  let skippedWechat = 0
  let totalNewArticles = 0

  try {
    for (let i = 0; i < websites.length; i++) {
      const { articles, result } = await crawlWebsite(websites[i])
      results.push(result)

      if (result.status === 'success') {
        successCount++
      } else if (result.status === 'skipped_wechat') {
        skippedWechat++
      } else {
        failCount++
      }

      const inserted = saveArticles(articles)
      totalNewArticles += inserted

      // Delay between sources (skip last)
      if (i < websites.length - 1) {
        await delay()
      }
    }

    return {
      status: 'completed',
      totalSources: websites.length,
      successCount,
      failCount,
      skippedWechat,
      newArticles: totalNewArticles,
      results,
    }
  } finally {
    isCrawling = false
  }
}

export { isCrawling, getLastCrawlStatus }
