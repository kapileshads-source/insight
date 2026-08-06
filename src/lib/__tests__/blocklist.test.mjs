import {
  BLOCK_CATEGORIES,
  DEFAULT_CATEGORIES,
  buildBlocklist,
  matchesBlocklist,
  normalizeEntry,
  normalizeSite,
} from "../blocklist.ts";

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

console.log("what a new student gets");
{
  const list = buildBlocklist({
    categories: DEFAULT_CATEGORIES,
    extra: [],
    allowed: [],
  });
  ok("covers a lot of ground", list.length > 60);
  ok("blocks youtube", list.includes("youtube.com"));
  ok("blocks tiktok", list.includes("tiktok.com"));
  ok("blocks roblox", list.includes("roblox.com"));
  ok("blocks amazon", list.includes("amazon.com"));
  ok(
    "does not block music by default",
    !list.includes("spotify.com"),
  );
}

console.log("\nnothing a student needs for school is on any list");
{
  const everything = buildBlocklist({
    categories: Object.keys(BLOCK_CATEGORIES),
    extra: [],
    allowed: [],
  });
  for (const site of [
    "google.com",
    "docs.google.com",
    "drive.google.com",
    "wikipedia.org",
    "instructure.com",
    "fisd.instructure.com",
    "khanacademy.org",
    "quizlet.com",
    "desmos.com",
    "canva.com",
    "github.com",
  ]) {
    ok(`${site} is never blocked`, !everything.includes(site));
  }
}

console.log("\nturning a category off removes it");
{
  const noGames = buildBlocklist({
    categories: DEFAULT_CATEGORIES.filter((c) => c !== "GAMES"),
    extra: [],
    allowed: [],
  });
  ok("roblox gone", !noGames.includes("roblox.com"));
  ok("youtube still blocked", noGames.includes("youtube.com"));
}

console.log("\nexceptions beat everything");
{
  const list = buildBlocklist({
    categories: DEFAULT_CATEGORIES,
    extra: ["pinterest.com"],
    allowed: ["youtube.com", "pinterest.com"],
  });
  ok("an allowed category site is removed", !list.includes("youtube.com"));
  ok(
    "an allowed site beats the student's own addition",
    !list.includes("pinterest.com"),
  );
  ok("everything else survives", list.includes("tiktok.com"));
}

console.log("\ncustom additions are accepted");
{
  const list = buildBlocklist({
    categories: [],
    extra: ["https://www.Pinterest.com/ideas?q=x", "  ESPN.com  "],
    allowed: [],
  });
  ok("a full URL reduces to its host", list.includes("pinterest.com"));
  ok("case and whitespace are handled", list.includes("espn.com"));
  ok("nothing else leaks in", list.length === 2);
}

console.log("\nrubbish input is dropped rather than stored");
ok("empty string", normalizeSite("") === "");
ok("not a domain", normalizeSite("hello world") === "");
ok("bare word", normalizeSite("youtube") === "");
ok("no tld", normalizeSite("localhost") === "");
ok("a real domain survives", normalizeSite("YouTube.com") === "youtube.com");
ok(
  "a subdomain survives",
  normalizeSite("https://open.spotify.com/playlist/1") === "open.spotify.com",
);

console.log("\nthe list has no duplicates");
{
  const list = buildBlocklist({
    categories: Object.keys(BLOCK_CATEGORIES),
    extra: ["youtube.com"],
    allowed: [],
  });
  ok("deduplicated", new Set(list).size === list.length);
  ok("sorted", [...list].sort().join() === list.join());
}

console.log("\napps are blocked the same way sites are");
{
  const list = buildBlocklist({
    categories: DEFAULT_CATEGORIES,
    extra: [],
    allowed: [],
  });

  // The games nobody could block before this existed: they are their own
  // executables, so a blocklist of hostnames never touched them.
  ok("blocks valorant", list.includes("valorant"));
  ok("blocks fortnite", list.includes("fortnite"));
  ok("blocks minecraft", list.includes("minecraft"));
  ok("blocks the steam app", list.includes("steam"));
  ok("blocks discord the app", list.includes("discord"));
  ok("still blocks discord the site", list.includes("discord.com"));
  ok(
    "does not block spotify the app by default, as with the site",
    !list.includes("spotify"),
  );

  // The matcher is untouched: an app name is matched by exact equality, so it
  // can neither miss nor spread.
  ok("an app name matches itself", matchesBlocklist("Valorant", list));
  ok("case is ignored", matchesBlocklist("VALORANT", list));
  ok("a school app is untouched", !matchesBlocklist("Microsoft Word", list));
  ok("a code editor is untouched", !matchesBlocklist("Visual Studio Code", list));
  ok(
    "an app name cannot swallow a hostname",
    !matchesBlocklist("valorant.example.com", ["valorant"]),
  );
}

console.log("\na student can block or allow an app by name");
{
  ok("an app name is kept", normalizeEntry("Minecraft") === "minecraft");
  ok("case and spacing are normalised", normalizeEntry("  Rocket   League ") === "rocket league");
  ok("punctuation real names use survives", normalizeEntry("osu!") === "osu!");
  ok("a site still wins where it looks like one", normalizeEntry("YouTube.com") === "youtube.com");
  ok("a single letter is rejected", normalizeEntry("a") === "");
  ok("a paste that went wrong is rejected", normalizeEntry("<script>x</script>") === "");
  ok("empty is rejected", normalizeEntry("   ") === "");

  const list = buildBlocklist({
    categories: DEFAULT_CATEGORIES,
    extra: ["Valorant"],
    allowed: ["VLC", "minecraft"],
  });
  ok("an added app appears once", list.filter((s) => s === "valorant").length === 1);
  ok("an allowed app is removed", !list.includes("minecraft"));
  ok("an allowed app beats its category", !list.includes("vlc"));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
