/**
 * What Focus Mode blocks.
 *
 * Grouped rather than listed flat, because the right answer differs per
 * student. Someone revising with music on is not distracted; someone on
 * TikTok is. A single list forces one judgement on everyone, and the student
 * who disagrees with it turns the whole feature off, which blocks nothing.
 *
 * So: categories a student can switch off, entries they can add, and specific
 * exceptions they can allow. The default is deliberately broad, and every
 * part of it is escapable in one click.
 *
 * Each category holds two lists: `sites`, which the extension matches against
 * hostnames, and `apps`, which the Windows and Mac apps match against the name
 * of whatever is in front. Both end up in one flat blocklist, because
 * `matchesBlocklist` lowercases and compares exactly, an app name can never
 * collide with a real hostname, and a hostname can never collide with an app
 * name. That means one list, one matcher, and no way for "blocked" and
 * "counted as a distraction" to drift apart.
 *
 * The apps lists carry several spellings of the same thing on purpose. A
 * desktop app reports whatever its own metadata says, "VALORANT", "Riot
 * Client", "League of Legends", and a name we didn't guess is a game that
 * silently isn't blocked.
 *
 * Not on any list, on purpose: search engines, Google Docs and Drive,
 * Wikipedia, Canvas, Slack, Teams, Zoom, code editors, and the study tools
 * students actually use. Blocking something they needed for homework is the
 * fastest way to lose them.
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
      "kick.com",
      "rumble.com",
      "crunchyroll.com",
      "funimation.com",
      "hidive.com",
      "vimeo.com",
      "dailymotion.com",
      "tubitv.com",
      "pluto.tv",
      "plex.tv",
      "bilibili.com",
      "viki.com",
      "trovo.live",
      "gogoanime.tv",
      "aniwatch.to",
      "9anime.to",
      "fmovies.to",
      "sflix.to",
      "soap2day.to",
      "putlocker.vip",
    ],
    apps: [
      "netflix",
      "disney+",
      "hulu",
      "prime video",
      "amazon prime video",
      "max",
      "hbo max",
      "peacock",
      "paramount+",
      "crunchyroll",
      "plex",
      "apple tv",
      "twitch",
      "kick",
      "youtube",
      "iina",
      "vlc",
      "vlc media player",
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
      "lemon8-app.com",
      "vk.com",
      "weibo.com",
      "yubo.live",
      "monkey.app",
      "chatroulette.com",
    ],
    apps: [
      "discord",
      "discord ptb",
      "discord canary",
      "telegram",
      "whatsapp",
      "messenger",
      "facebook messenger",
      "instagram",
      "snapchat",
      "tiktok",
      "x",
      "twitter",
      "reddit",
      "bereal",
      "threads",
      "pinterest",
      "vsco",
      "tumblr",
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
      "riotgames.com",
      "leagueoflegends.com",
      "playvalorant.com",
      "fortnite.com",
      "ea.com",
      "origin.com",
      "ubisoft.com",
      "ubi.com",
      "battle.net",
      "blizzard.com",
      "rockstargames.com",
      "gog.com",
      "xbox.com",
      "playstation.com",
      "nintendo.com",
      "geforcenow.com",
      "bluestacks.com",
      "curseforge.com",
      "aternos.org",
      "hypixel.net",
      "planetminecraft.com",
      "gamesnacks.com",
      "silvergames.com",
      "kbhgames.com",
      "twoplayergames.org",
      "papasgames.com",
      "retrobowl.me",
      "slopegame.io",
      "tunnelrush.io",
      "cookieclicker.org",
      "chessvariants.com",
    ],
    /// Launchers, storefronts and the games themselves. A launcher alone
    /// wouldn't be enough: a game started from Steam runs as its own
    /// executable, and it's the game rather than the launcher that eats the
    /// evening.
    apps: [
      "steam",
      "steam client bootstrapper",
      "epic games launcher",
      "battle.net",
      "ea app",
      "ea desktop",
      "origin",
      "ubisoft connect",
      "rockstar games launcher",
      "gog galaxy",
      "itch",
      "xbox",
      "playstation",
      "geforce now",
      "nvidia geforce now",
      "bluestacks",
      "ldplayer",
      "noxplayer",
      "roblox",
      "roblox player",
      "minecraft",
      "minecraft launcher",
      "minecraft: java edition",
      "minecraft for windows",
      "valorant",
      "riot client",
      "riot games",
      "league of legends",
      "league of legends client",
      "teamfight tactics",
      "legends of runeterra",
      "fortnite",
      "apex legends",
      "counter-strike 2",
      "counter-strike",
      "dota 2",
      "team fortress 2",
      "overwatch",
      "overwatch 2",
      "world of warcraft",
      "hearthstone",
      "diablo iv",
      "call of duty",
      "destiny 2",
      "rocket league",
      "fall guys",
      "among us",
      "genshin impact",
      "honkai: star rail",
      "zenless zone zero",
      "wuthering waves",
      "marvel rivals",
      "the finals",
      "delta force",
      "pubg",
      "playerunknown's battlegrounds",
      "rainbow six siege",
      "grand theft auto v",
      "red dead redemption 2",
      "the sims 4",
      "ea sports fc",
      "fifa",
      "battlefield",
      "terraria",
      "stardew valley",
      "geometry dash",
      "osu!",
      "brawlhalla",
      "warframe",
      "path of exile",
      "elden ring",
      "cyberpunk 2077",
      "retroarch",
      "dolphin",
      "ppsspp",
      "pcsx2",
      "duckstation",
      "citra",
      "ryujinx",
      "openemu",
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
      "memedroid.com",
      "cheezburger.com",
      "ebaumsworld.com",
      "cracked.com",
    ],
    apps: ["9gag", "imgur", "ifunny"],
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
      "walmart.com",
      "target.com",
      "bestbuy.com",
      "romwe.com",
      "zaful.com",
      "poshmark.com",
      "mercari.com",
      "stockx.com",
      "goat.com",
    ],
    apps: ["amazon", "amazon shopping", "ebay", "shein", "temu", "etsy", "depop"],
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
      "audiomack.com",
      "bandcamp.com",
      "last.fm",
    ],
    apps: [
      "spotify",
      "music",
      "apple music",
      "itunes",
      "tidal",
      "soundcloud",
      "deezer",
      "pandora",
      "amazon music",
      "youtube music",
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
/// Allowed sites win over everything, including a student's own additions,
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
      // Apps go in the same flat list. They can't be confused with hostnames
      // by the matcher, and keeping them together is what stops a native app
      // being blocked without also counting as a distraction.
      for (const app of BLOCK_CATEGORIES[c].apps) set.add(app);
    }
  }
  for (const entry of options.extra) set.add(normalizeEntry(entry));

  const allowed = new Set(options.allowed.map(normalizeEntry));
  return [...set].filter((s) => s && !allowed.has(s)).sort();
}

/// Accepts what a student actually types, a full URL, a www prefix, stray
/// whitespace, and reduces it to the hostname the matcher compares against.
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

/// A student's own entry: a website, or the name of an app.
///
/// Apps have to be addable by hand for the same reason categories exist. The
/// curated lists cover the games people actually play, but there are tens of
/// thousands of them, and a student whose particular time-sink isn't on the
/// list has no other way to block it, nor to un-block something the list got
/// wrong, which matters more. Either failure ends with Focus Mode switched
/// off entirely.
///
/// The name has to be what the app calls itself: "Discord", "Minecraft". The
/// desktop apps report an app's own metadata, and that is what this matches.
export function normalizeEntry(input: string): string {
  const site = normalizeSite(input);
  if (site) return site;

  const value = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (value.length < 2 || value.length > 64) return "";

  // Letters, digits and the punctuation real app names use, "osu!",
  // "counter-strike 2", "honkai: star rail". Anything else is a typo or a
  // paste that went wrong, and a rule that can never match is worse than a
  // rejection, because it looks like it worked.
  return /^[a-z0-9][a-z0-9 .+:!'&-]*$/.test(value) ? value : "";
}

/// Does a hostname fall under a blocklist entry?
///
/// Shared with the extension's matcher so "blocked" and "counted as a
/// distraction" mean exactly the same thing. If these two drifted apart, a
/// student could be blocked from a site that never showed up in their
/// distraction figures, or the reverse, and either would be baffling.
export function matchesBlocklist(host: string, blocklist: string[]): boolean {
  if (!host) return false;
  const clean = host.replace(/^www\./, "").toLowerCase();
  return blocklist.some((b) => clean === b || clean.endsWith(`.${b}`));
}

/// Split recorded site time into distracted and the rest.
///
/// Using the student's own blocklist as the definition is deliberate. It keeps
/// the whole app on one principle, everything is measured against their own
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
