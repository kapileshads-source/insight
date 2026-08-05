/**
 * What Focus Mode blocks.
 *
 * Grouped rather than listed flat, because the right answer differs per
 * student. Someone revising with music on is not distracted; someone on
 * TikTok is. A single list forces one judgement on everyone, and the student
 * who disagrees with it turns the whole feature off — which blocks nothing.
 *
 * So: categories a student can switch off, sites they can add, and specific
 * exceptions they can allow. The default is deliberately broad, and every
 * part of it is escapable in one click.
 *
 * Not on any list, on purpose: search engines, Google Docs and Drive,
 * Wikipedia, Canvas, and the study tools students actually use. Blocking
 * something they needed for homework is the fastest way to lose them.
 */

export const BLOCK_CATEGORIES = {
  VIDEO: {
    label: "Video and streaming",
    description: "YouTube, Netflix, Twitch and the rest.",
    sites: [
      "youtube.com",
      "youtu.be",
      "netflix.com",
      "hulu.com",
      "disneyplus.com",
      "max.com",
      "hbomax.com",
      "primevideo.com",
      "peacocktv.com",
      "paramountplus.com",
      "twitch.tv",
      "crunchyroll.com",
      "funimation.com",
      "vimeo.com",
      "dailymotion.com",
      "tubitv.com",
      "plex.tv",
    ],
  },
  SOCIAL: {
    label: "Social media",
    description: "TikTok, Instagram, Snapchat, Reddit, X.",
    sites: [
      "tiktok.com",
      "instagram.com",
      "facebook.com",
      "messenger.com",
      "snapchat.com",
      "x.com",
      "twitter.com",
      "reddit.com",
      "tumblr.com",
      "pinterest.com",
      "threads.net",
      "threads.com",
      "bereal.com",
      "discord.com",
      "telegram.org",
      "web.whatsapp.com",
      "vsco.co",
    ],
  },
  GAMES: {
    label: "Games",
    description: "Roblox, Steam, and the browser-game sites.",
    sites: [
      "roblox.com",
      "minecraft.net",
      "epicgames.com",
      "steampowered.com",
      "steamcommunity.com",
      "chess.com",
      "lichess.org",
      "coolmathgames.com",
      "poki.com",
      "miniclip.com",
      "addictinggames.com",
      "crazygames.com",
      "y8.com",
      "kongregate.com",
      "itch.io",
      "friv.com",
      "slither.io",
      "agar.io",
      "geoguessr.com",
      "wordle.com",
      "krunker.io",
      "1v1.lol",
      "smashkarts.io",
      "eaglercraft.com",
      "now.gg",
    ],
  },
  MEMES: {
    label: "Memes and time-sinks",
    description: "9GAG, Imgur, BuzzFeed and similar.",
    sites: [
      "9gag.com",
      "imgur.com",
      "buzzfeed.com",
      "boredpanda.com",
      "knowyourmeme.com",
      "ifunny.co",
    ],
  },
  SHOPPING: {
    label: "Shopping",
    description: "Amazon, Shein, Temu.",
    sites: [
      "amazon.com",
      "ebay.com",
      "shein.com",
      "temu.com",
      "aliexpress.com",
      "etsy.com",
      "wish.com",
      "depop.com",
    ],
  },
  MUSIC: {
    label: "Music",
    description: "Spotify, SoundCloud, Apple Music.",
    sites: [
      "spotify.com",
      "open.spotify.com",
      "soundcloud.com",
      "music.apple.com",
      "pandora.com",
      "music.youtube.com",
      "deezer.com",
      "tidal.com",
    ],
  },
} as const;

export type BlockCategory = keyof typeof BLOCK_CATEGORIES;

export const ALL_CATEGORIES = Object.keys(BLOCK_CATEGORIES) as BlockCategory[];

/// On for a new student.
///
/// Music is off. Studying to music is normal and extremely common, and
/// blocking it by default would make Focus Mode feel broken rather than
/// helpful on day one. It's there for anyone who knows it distracts them.
export const DEFAULT_CATEGORIES: BlockCategory[] = [
  "VIDEO",
  "SOCIAL",
  "GAMES",
  "MEMES",
  "SHOPPING",
];

export function isBlockCategory(value: string): value is BlockCategory {
  return (ALL_CATEGORIES as string[]).includes(value);
}

/// Build the list the extension enforces.
///
/// Allowed sites win over everything, including a student's own additions —
/// an exception is a deliberate act and should be hard to accidentally undo.
export function buildBlocklist(options: {
  categories: string[];
  extra: string[];
  allowed: string[];
}): string[] {
  const set = new Set<string>();

  for (const c of options.categories) {
    if (isBlockCategory(c)) {
      for (const site of BLOCK_CATEGORIES[c].sites) set.add(site);
    }
  }
  for (const site of options.extra) set.add(normalizeSite(site));

  const allowed = new Set(options.allowed.map(normalizeSite));
  return [...set].filter((s) => s && !allowed.has(s)).sort();
}

/// Accepts what a student actually types — a full URL, a www prefix, stray
/// whitespace — and reduces it to the hostname the matcher compares against.
export function normalizeSite(input: string): string {
  let value = input.trim().toLowerCase();
  if (!value) return "";

  if (value.includes("://")) {
    try {
      value = new URL(value).hostname;
    } catch {
      return "";
    }
  }

  value = value.split("/")[0];
  value = value.replace(/^www\./, "");

  // Must look like a domain. Rejecting the rest stops a typo becoming a rule
  // that silently never matches anything.
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value) ? value : "";
}

/// Does a hostname fall under a blocklist entry?
///
/// Shared with the extension's matcher so "blocked" and "counted as a
/// distraction" mean exactly the same thing. If these two drifted apart, a
/// student could be blocked from a site that never showed up in their
/// distraction figures, or the reverse — and either would be baffling.
export function matchesBlocklist(host: string, blocklist: string[]): boolean {
  if (!host) return false;
  const clean = host.replace(/^www\./, "").toLowerCase();
  return blocklist.some((b) => clean === b || clean.endsWith(`.${b}`));
}

/// Split recorded site time into distracted and the rest.
///
/// Using the student's own blocklist as the definition is deliberate. It keeps
/// the whole app on one principle — everything is measured against their own
/// choices rather than a general idea of what counts as time wasted. Someone
/// who unblocks music is not "distracted" by Spotify, and someone who blocks
/// ESPN is.
export function splitActivity(
  entries: { domain: string; seconds: number }[],
  blocklist: string[],
): { distractedSeconds: number; focusedSeconds: number } {
  let distracted = 0;
  let focused = 0;

  for (const e of entries) {
    if (matchesBlocklist(e.domain, blocklist)) distracted += e.seconds;
    else focused += e.seconds;
  }

  return { distractedSeconds: distracted, focusedSeconds: focused };
}
