import Parser from "rss-parser";
import sanitizeHtml from "sanitize-html";
import { safeFetchText, SafeFetchError } from "@/lib/rss/safe-fetch";

export class RssParseError extends Error {}

export interface ParsedPodcast {
  name: string;
  description: string | null;
  artworkUrl: string | null;
  websiteUrl: string | null;
  language: string | null;
  author: string | null;
}

export interface ParsedEpisode {
  rssGuid: string;
  title: string;
  episodeNumber: number | null;
  description: string | null;
  publishedAt: string | null;
  durationSeconds: number | null;
  artworkUrl: string | null;
  pageUrl: string | null;
  audioUrl: string | null;
  seasonNumber: number | null;
  explicit: boolean | null;
}

export interface ParsedFeed {
  podcast: ParsedPodcast;
  episodes: ParsedEpisode[];
}

type ItunesFeedFields = {
  image?: string;
  author?: string;
  owner?: { name?: string; email?: string };
};

type FeedExtraFields = {
  language?: string;
  itunes?: ItunesFeedFields;
};

type ItunesItemFields = {
  episode?: string;
  season?: string;
  duration?: string;
  explicit?: string;
  image?: string;
};

const parser = new Parser<FeedExtraFields, { itunes?: ItunesItemFields }>();

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "b", "strong", "i", "em", "u", "a", "ul", "ol", "li", "blockquote"],
  allowedAttributes: { a: ["href", "title", "target", "rel"] },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
  },
};

function sanitizeDescription(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const clean = sanitizeHtml(raw, SANITIZE_OPTIONS).trim();
  return clean || null;
}

function parseIntOrNull(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) ? n : null;
}

function parseDurationSeconds(raw: string | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  const parts = trimmed.split(":").map((p) => Number(p));
  if (parts.some((p) => Number.isNaN(p))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function parseExplicit(raw: string | undefined): boolean | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === "yes" || v === "true" || v === "explicit") return true;
  if (v === "no" || v === "false" || v === "clean") return false;
  return null;
}

function parsePublishedAt(isoDate: string | undefined, pubDate: string | undefined): string | null {
  const raw = isoDate || pubDate;
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** GUID is the primary de-dup key. When a feed omits it (allowed by the RSS spec), fall back to
 * the audio enclosure URL, then title+date -- both stable across re-syncs of the same feed,
 * namespaced so they can never collide with a real feed-supplied guid. */
function resolveGuid(item: { guid?: string; enclosure?: { url: string }; title?: string; isoDate?: string; pubDate?: string }): string {
  if (item.guid && item.guid.trim()) return item.guid.trim();
  if (item.enclosure?.url) return `enclosure:${item.enclosure.url}`;
  return `fallback:${(item.title || "").trim()}|${item.isoDate || item.pubDate || ""}`;
}

/** Fetches and parses an RSS/podcast feed URL. The fetch itself is SSRF-hardened (see safe-fetch.ts). */
export async function fetchAndParseFeed(rssUrl: string): Promise<ParsedFeed> {
  let xml: string;
  try {
    xml = await safeFetchText(rssUrl);
  } catch (e) {
    if (e instanceof SafeFetchError) throw new RssParseError(e.message);
    throw e;
  }

  let feed;
  try {
    feed = await parser.parseString(xml);
  } catch {
    throw new RssParseError("This URL doesn't look like a valid RSS/podcast feed.");
  }

  if (!feed.title || !Array.isArray(feed.items)) {
    throw new RssParseError("This URL doesn't look like a valid RSS/podcast feed.");
  }

  const podcast: ParsedPodcast = {
    name: feed.title.trim(),
    description: sanitizeDescription(feed.description),
    artworkUrl: feed.itunes?.image || feed.image?.url || null,
    websiteUrl: feed.link || null,
    language: feed.language || null,
    author: feed.itunes?.author || feed.itunes?.owner?.name || null,
  };

  const episodes: ParsedEpisode[] = feed.items
    .filter((item) => item.title && item.title.trim())
    .map((item) => ({
      rssGuid: resolveGuid(item),
      title: item.title!.trim(),
      episodeNumber: parseIntOrNull(item.itunes?.episode),
      description: sanitizeDescription(item.content || item.summary),
      publishedAt: parsePublishedAt(item.isoDate, item.pubDate),
      durationSeconds: parseDurationSeconds(item.itunes?.duration),
      artworkUrl: item.itunes?.image || null,
      pageUrl: item.link || null,
      audioUrl: item.enclosure?.url || null,
      seasonNumber: parseIntOrNull(item.itunes?.season),
      explicit: parseExplicit(item.itunes?.explicit),
    }));

  return { podcast, episodes };
}
