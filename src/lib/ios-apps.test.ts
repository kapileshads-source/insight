import { describe, expect, it } from "vitest";

import { BLOCK_CATEGORIES } from "./blocklist";
import {
  appsToBlock,
  collapseAliases,
  displayName,
  isDesktopOnly,
} from "./ios-apps";

describe("displayName", () => {
  it("title-cases an ordinary name", () => {
    expect(displayName("netflix")).toBe("Netflix");
    expect(displayName("prime video")).toBe("Prime Video");
  });

  it("keeps the casing people actually recognise", () => {
    expect(displayName("9gag")).toBe("9GAG");
    expect(displayName("tiktok")).toBe("TikTok");
    expect(displayName("ifunny")).toBe("iFunny");
    expect(displayName("valorant")).toBe("VALORANT");
  });

  it("leaves an unknown name readable rather than shouting", () => {
    expect(displayName("some new app")).toBe("Some New App");
  });
});

describe("collapseAliases", () => {
  it("drops longer spellings of a name already present", () => {
    expect(collapseAliases(["amazon", "amazon shopping"])).toEqual(["amazon"]);
  });

  it("only collapses on whole words", () => {
    // The bug this guards: "riot" swallowing "riot games" is right, but a
    // prefix match without the space would have "ea" swallow "easy".
    expect(collapseAliases(["ea", "easy"]).sort()).toEqual(["ea", "easy"]);
  });

  it("keeps distinct names that merely share a word", () => {
    const kept = collapseAliases(["league of legends", "legends of runeterra"]);
    expect(kept).toHaveLength(2);
  });

  it("removes duplicates", () => {
    expect(collapseAliases(["twitch", "twitch"])).toEqual(["twitch"]);
  });
});

describe("appsToBlock", () => {
  it("groups by the same labels the blocklist editor uses", () => {
    const groups = appsToBlock();
    const labels = groups.map((group) => group.label);

    expect(labels).toContain(BLOCK_CATEGORIES.GAMES.label);
    expect(labels).toContain(BLOCK_CATEGORIES.VIDEO.label);
  });

  it("never shows a heading with nothing under it", () => {
    for (const group of appsToBlock()) {
      expect(group.apps.length).toBeGreaterThan(0);
    }
  });

  it("honours a chosen subset, because a student can switch categories off", () => {
    const groups = appsToBlock(["GAMES"]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("GAMES");
  });

  it("carries the games that made app-name blocking necessary at all", () => {
    const games = appsToBlock(["GAMES"])[0].apps;
    expect(games).toContain("VALORANT");
  });

  it("shows every name ready to read, never a raw lowercase entry", () => {
    for (const group of appsToBlock()) {
      for (const app of group.apps) {
        expect(app).not.toBe(app.toLowerCase());
      }
    }
  });
});

describe("what an iPhone could actually have", () => {
  it("leaves out the launchers and emulators", () => {
    const games = appsToBlock(["GAMES"])[0].apps;
    for (const desktop of ["Steam", "Battle.net", "Epic Games Launcher", "PCSX2"]) {
      expect(games).not.toContain(desktop);
    }
  });

  it("leaves out PC and console titles", () => {
    const games = appsToBlock(["GAMES"])[0].apps;
    expect(games).not.toContain("Cyberpunk 2077");
    expect(games).not.toContain("Elden Ring");
  });

  it("keeps the games students actually play on a phone", () => {
    const games = appsToBlock(["GAMES"])[0].apps;
    for (const mobile of ["Roblox", "Minecraft", "Genshin Impact"]) {
      expect(games).toContain(mobile);
    }
  });

  it("still lists every social app, which is the point of the page", () => {
    const social = appsToBlock(["SOCIAL"])[0].apps;
    for (const app of ["Instagram", "TikTok", "Snapchat"]) {
      expect(social).toContain(app);
    }
  });

  it("filters for reading only — the real blocklist keeps everything", () => {
    // The desktop clients must still block Steam. This module must never be
    // mistaken for the matcher.
    expect(BLOCK_CATEGORIES.GAMES.apps).toContain("steam");
  });
});

describe("isDesktopOnly", () => {
  it("catches the longer spellings the blocklist carries on purpose", () => {
    // Each of these reached the page once, because the first version matched
    // exactly while the lists deliberately hold several names per thing.
    expect(isDesktopOnly("steam client bootstrapper")).toBe(true);
    expect(isDesktopOnly("vlc media player")).toBe(true);
    expect(isDesktopOnly("overwatch 2")).toBe(true);
    expect(isDesktopOnly("counter-strike 2")).toBe(true);
  });

  it("only matches whole leading words", () => {
    expect(isDesktopOnly("steamworld dig")).toBe(false);
  });

  it("leaves phone apps alone", () => {
    for (const app of ["instagram", "roblox", "spotify", "genshin impact"]) {
      expect(isDesktopOnly(app)).toBe(false);
    }
  });
});
