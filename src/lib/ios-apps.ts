/**
 * The app names to tick, when iOS makes you tick them by hand.
 *
 * Every other client is handed a blocklist and enforces it. An iPhone can't
 * be handed anything: the student builds one Shortcuts automation and selects
 * the apps themselves, out of a picker holding everything installed. So the
 * one thing we can usefully do is tell them exactly which names to look for,
 * from the same `BLOCK_CATEGORIES` the extension, both desktops and Android
 * enforce, so an iPhone blocks the same set as everything else rather than
 * whatever the student remembered on the day.
 *
 * Two transformations, both only for reading:
 *
 *  - **Aliases collapse.** The lists carry several spellings on purpose,
 *    because a desktop app reports whatever its own metadata says. A student
 *    scanning a picker wants "Amazon", not "Amazon", "Amazon Shopping".
 *  - **Names are cased for humans.** The lists are lowercase for matching;
 *    nobody looks for "9gag" in a list that says "9GAG".
 *
 * And one filter: the shared lists are dominated by desktop games, launchers
 * and emulators, none of which exist on a phone. Offering an iPhone student
 * "Steam, Battle.net, PCSX2, Cyberpunk 2077" to tick reads like a page written
 * for somebody else, and a student who spots one thing that obviously doesn't
 * apply starts discounting the rest.
 *
 * Nothing here feeds the matcher. Getting a display name wrong costs a
 * confusing line on a setup page, not a game that silently isn't blocked.
 */

import { BLOCK_CATEGORIES, type BlockCategory } from "./blocklist";

/**
 * Names whose ordinary casing isn't title case. Short on purpose: this is a
 * list of exceptions, and every entry is one somebody has to maintain.
 */
const CASING: Record<string, string> = {
  "9gag": "9GAG",
  ifunny: "iFunny",
  imgur: "Imgur",
  iheartradio: "iHeartRadio",
  tiktok: "TikTok",
  youtube: "YouTube",
  "youtube music": "YouTube Music",
  hbo: "HBO",
  "hbo max": "HBO Max",
  espn: "ESPN",
  "prime video": "Prime Video",
  vlc: "VLC",
  ea: "EA",
  "ea app": "EA app",
  gog: "GOG",
  "gog galaxy": "GOG Galaxy",
  valorant: "VALORANT",
  "league of legends": "League of Legends",
  osu: "osu!",
  soundcloud: "SoundCloud",
  vrchat: "VRChat",
  minecraft: "Minecraft",
  roblox: "Roblox",
  bereal: "BeReal",
  snapchat: "Snapchat",
  whatsapp: "WhatsApp",
  shein: "SHEIN",
  ebay: "eBay",
  "apple tv": "Apple TV",
  vsco: "VSCO",
  itunes: "iTunes",
  "diablo iv": "Diablo IV",
  "counter-strike": "Counter-Strike",
  "call of duty": "Call of Duty",
  "path of exile": "Path of Exile",
  "world of warcraft": "World of Warcraft",
  "grand theft auto v": "Grand Theft Auto V",
  "legends of runeterra": "Legends of Runeterra",
  "red dead redemption 2": "Red Dead Redemption 2",
  "ea sports fc": "EA Sports FC",
  fifa: "FIFA",
  pubg: "PUBG",
  "the sims 4": "The Sims 4",
  "zenless zone zero": "Zenless Zone Zero",
};

/**
 * Things that exist on a computer and not on a phone.
 *
 * Storefronts, launchers, emulators and PC or console titles. Kept as an
 * exclusion rather than an iOS allowlist because the shared lists grow, and a
 * new mobile game appearing should reach this page on its own, the failure
 * we can afford is one extra name to scan, not a missing one.
 *
 * Matched by leading word rather than exactly, because the blocklist carries
 * the same thing under several names on purpose. Excluding "steam" alone let
 * "Steam Client Bootstrapper" onto the page, and "vlc" let "Vlc Media Player".
 */
const DESKTOP_ONLY = new Set([
  "steam", "epic games launcher", "battle.net", "gog", "gog galaxy", "origin",
  "ea app", "ea desktop", "ubisoft connect", "rockstar games launcher", "itch",
  "riot client", "riot games", "xbox", "playstation", "geforce now",
  "nvidia geforce now", "bluestacks", "ldplayer", "noxplayer",
  "citra", "dolphin", "duckstation", "openemu", "pcsx2", "ppsspp", "retroarch",
  "ryujinx", "vlc", "iina", "plex",
  "cyberpunk 2077", "elden ring", "counter-strike", "dota 2", "team fortress 2",
  "overwatch", "world of warcraft", "diablo iv", "path of exile", "warframe",
  "destiny 2", "apex legends", "rainbow six siege", "battlefield",
  "grand theft auto v", "red dead redemption 2", "the finals", "delta force",
  "marvel rivals", "rocket league", "fall guys", "the sims 4", "fortnite",
  "minecraft: java edition", "osu!", "stardew valley", "terraria",
  "brawlhalla", "geometry dash", "playerunknown's battlegrounds",
]);

/** Whether a name is that thing, or a longer spelling of it. */
export function isDesktopOnly(app: string): boolean {
  for (const desktop of DESKTOP_ONLY) {
    if (app === desktop || app.startsWith(`${desktop} `)) return true;
  }
  return false;
}

/** How a lowercase blocklist entry should read on a page. */
export function displayName(app: string): string {
  const known = CASING[app];
  if (known) return known;

  return app
    .split(" ")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * Drop the entries that are longer spellings of one already in the list.
 *
 * "amazon" and "amazon shopping" are the same icon in a picker. The shorter
 * name survives because it's the one the App Store usually shows, and because
 * a student searching "amazon" finds both.
 *
 * Only whole leading words count: "riot client" must not swallow "riot
 * games", and "ea" must not swallow "easy" if one ever appears.
 */
export function collapseAliases(apps: string[]): string[] {
  const sorted = [...new Set(apps)].sort((a, b) => a.length - b.length);
  const kept: string[] = [];

  for (const app of sorted) {
    const covered = kept.some((existing) => app.startsWith(`${existing} `));
    if (!covered) kept.push(app);
  }

  return kept.sort();
}

export type AppGroup = {
  category: BlockCategory;
  label: string;
  apps: string[];
};

/**
 * What to tick, grouped the way the blocklist editor groups it, so a student
 * comparing the two pages sees the same words in the same order.
 *
 * Categories with no apps are dropped rather than shown empty: a heading with
 * nothing under it reads like something failed to load.
 */
export function appsToBlock(categories?: BlockCategory[]): AppGroup[] {
  const wanted = categories ?? (Object.keys(BLOCK_CATEGORIES) as BlockCategory[]);

  return wanted
    .map((category) => {
      const group = BLOCK_CATEGORIES[category];
      const apps = collapseAliases(
        [...(group.apps ?? [])].filter((app) => !isDesktopOnly(app)),
      ).map(displayName);
      return { category, label: group.label, apps };
    })
    .filter((group) => group.apps.length > 0);
}
