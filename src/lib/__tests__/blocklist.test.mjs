import {
  BLOCK_CATEGORIES,
  DEFAULT_CATEGORIES,
  buildBlocklist,
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
