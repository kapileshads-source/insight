import { appsToBlock, collapseAliases, displayName, isDesktopOnly } from "../ios-apps.ts";
import { BLOCK_CATEGORIES } from "../blocklist.ts";

let pass = 0;
let fail = 0;
const ok = (name, cond) => {
  if (cond) {
    pass++;
    console.log("  ok  ", name);
  } else {
    fail++;
    console.log("  FAIL", name);
  }
};

console.log("names people recognise");
{
  ok("title-cases an ordinary name", displayName("netflix") === "Netflix");
  ok("handles two words", displayName("prime video") === "Prime Video");
  ok("keeps 9GAG shouting", displayName("9gag") === "9GAG");
  ok("keeps TikTok's capital K", displayName("tiktok") === "TikTok");
  ok("keeps iFunny's small i", displayName("ifunny") === "iFunny");
  ok("leaves an unknown name readable", displayName("some new app") === "Some New App");
}

console.log("\naliases");
{
  const amazon = collapseAliases(["amazon", "amazon shopping"]);
  ok("drops the longer spelling of a name already there", amazon.length === 1 && amazon[0] === "amazon");
  // The bug this guards: matching on a bare prefix would have "ea" swallow
  // "easy", so only whole leading words count.
  ok("only collapses on whole words", collapseAliases(["ea", "easy"]).length === 2);
  ok("keeps names that merely share a word", collapseAliases(["league of legends", "legends of runeterra"]).length === 2);
  ok("removes duplicates", collapseAliases(["twitch", "twitch"]).length === 1);
}

console.log("\nwhat an iPhone could actually have");
{
  const games = appsToBlock(["GAMES"])[0].apps;
  ok("no launchers", !games.includes("Steam") && !games.includes("Battle.net"));
  ok("no emulators", !games.includes("PCSX2") && !games.includes("Dolphin"));
  ok("no PC-only titles", !games.includes("Cyberpunk 2077") && !games.includes("Elden Ring"));
  ok("keeps the phone games", ["Roblox", "Minecraft", "Genshin Impact"].every((g) => games.includes(g)));

  const social = appsToBlock(["SOCIAL"])[0].apps;
  ok("keeps every social app", ["Instagram", "TikTok", "Snapchat"].every((a) => social.includes(a)));

  // Each of these reached the page once, because the first version matched
  // exactly while the lists deliberately hold several spellings per thing.
  ok("catches longer spellings of a desktop name", isDesktopOnly("steam client bootstrapper"));
  ok("catches Vlc Media Player", isDesktopOnly("vlc media player"));
  ok("catches sequels", isDesktopOnly("overwatch 2") && isDesktopOnly("counter-strike 2"));
  ok("only matches whole leading words", !isDesktopOnly("steamworld dig"));
  ok("leaves phone apps alone", ["instagram", "roblox", "spotify"].every((a) => !isDesktopOnly(a)));
}

console.log("\nthis is for reading, never for matching");
{
  // The desktop clients must still block Steam. This module must never be
  // mistaken for the matcher.
  ok("the real blocklist keeps everything", BLOCK_CATEGORIES.GAMES.apps.includes("steam"));
  ok("no heading with nothing under it", appsToBlock().every((g) => g.apps.length > 0));
  ok("nothing renders as a raw lowercase entry", appsToBlock().every((g) => g.apps.every((a) => a !== a.toLowerCase())));
  ok("honours a chosen subset", appsToBlock(["GAMES"]).length === 1);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
