/**
 * Lifting HAC's gradebook page into the plain structures `hac.ts` reads.
 *
 * Deliberately dull, and deliberately separate. Everything that can be subtly
 * wrong, which column is the score, what `Z` means, whether a row is a real
 * assignment, lives next door and is tested without a browser. This file
 * only walks a document, and if it is wrong it is wrong loudly.
 *
 * The selectors are HAC's, confirmed against a working public parser:
 *
 *   div.AssignmentClass                       one course
 *     a.sg-header-heading                     course name
 *     span.sg-header-heading.sg-right         overall grade
 *     span.sg-header-sub-heading              "as of" date
 *     div.sg-content-grid
 *       tr  (header row, if any)              column labels
 *       tr.sg-asp-table-data-row              one assignment, or a total
 */

import type { HacTable } from "./hac";

const text = (node: Element | null | undefined): string =>
  (node?.textContent ?? "").replace(/\s+/g, " ").trim();

/**
 * The header labels for a course's table.
 *
 * HAC renders them as `th` in some views and as a styled `td` row in others,
 * so both are tried before giving up. Giving up is fine, `readTable` treats
 * an empty header list as "guess, and admit it".
 */
function headersFor(grid: Element): string[] {
  const th = Array.from(grid.querySelectorAll("th"));
  if (th.length > 0) return th.map(text);

  // A row of labels that isn't a data row is the header in this markup.
  const rows = Array.from(grid.querySelectorAll("tr"));
  const candidate = rows.find(
    (row) => !row.classList.contains("sg-asp-table-data-row"),
  );
  if (!candidate) return [];

  const cells = Array.from(candidate.querySelectorAll("td, th")).map(text);
  // A row of empty cells is a spacer, not a header.
  return cells.some((c) => c.length > 0) ? cells : [];
}

/// Pull every course table out of a HAC assignments document.
export function extractTables(doc: Document): HacTable[] {
  const tables: HacTable[] = [];

  for (const course of Array.from(doc.querySelectorAll("div.AssignmentClass"))) {
    const header = course.querySelector("div.sg-header");
    const name = text(header?.querySelector("a.sg-header-heading"));
    if (!name) continue;

    const gradeText = text(header?.querySelector("span.sg-header-heading.sg-right"))
      .replace(/student grades/i, "")
      .replace("%", "")
      .trim();

    const grid = course.querySelector("div.sg-content-grid");
    const rows: string[][] = [];
    const names: (string | null)[] = [];

    if (grid) {
      for (const row of Array.from(
        grid.querySelectorAll("tr.sg-asp-table-data-row"),
      )) {
        rows.push(Array.from(row.querySelectorAll("td")).map(text));
        // A row without a link is a running total, not an assignment. The
        // name comes from the link rather than a cell because that is where
        // HAC puts it, and because it identifies the row as real.
        names.push(text(row.querySelector("a")) || null);
      }
    }

    tables.push({
      course: name,
      grade: gradeText || null,
      lastUpdated: text(header?.querySelector("span.sg-header-sub-heading")) || null,
      headers: grid ? headersFor(grid) : [],
      rows,
      names,
    });
  }

  return tables;
}

/// Parse a page fetched as HTML. Browser only, there is no DOMParser in Node,
/// which is exactly why the decisions live in `hac.ts` instead of here.
export function parseHacHtml(html: string): HacTable[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return extractTables(doc);
}

/* -------------------------------------------------------------------------- */
/* The transcript                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Lift the transcript page into the structures `transcript.ts` reads.
 *
 * Year blocks are index-suffixed with no count published anywhere, so the only
 * way to read them is to walk upward until an id is missing.
 *
 * These `plnMain_*` ids are ASP.NET's, generated from the page's control tree,
 * and they will change if the page is rebuilt. That is acceptable *here* in a
 * way positional cell indices are not: an id that no longer exists yields
 * nothing and is obvious, while a shifted column yields a wrong grade and is
 * not. Where this file does read cells by position, the course rows have no
 * header to bind to, every row is validated in `transcript.ts` before it is
 * believed.
 */
export function extractTranscript(doc: Document): {
  years: {
    year: string;
    gradeLevel: string;
    building: string;
    rows: string[][];
  }[];
  gpa: { label: string; value: string; rank: string | null }[];
} {
  const years: {
    year: string;
    gradeLevel: string;
    building: string;
    rows: string[][];
  }[] = [];

  const id = (name: string, i: number) =>
    doc.getElementById(`plnMain_rpTranscriptGroup_${name}_${i}`);

  // No count anywhere, so walk until one is missing. Capped rather than
  // unbounded: a malformed page must not spin.
  for (let i = 0; i < 40; i++) {
    const yearEl = id("lblYearValue", i);
    if (!yearEl) break;

    const table = id("dgCourses", i);
    const rows: string[][] = [];
    if (table) {
      for (const row of Array.from(
        table.querySelectorAll("tr.sg-asp-table-data-row"),
      )) {
        rows.push(Array.from(row.querySelectorAll("td")).map(text));
      }
    }

    years.push({
      year: text(yearEl),
      gradeLevel: text(id("lblGradeValue", i)),
      building: text(id("lblBuildingValue", i)),
      rows,
    });
  }

  // The district's own GPA, which is authoritative where ours is an estimate.
  // Label matching downstream is keyword-based rather than exact, because
  // "Weighted GPA" and "4.0 College GPA" are the labels today and neither is
  // guaranteed.
  const gpa: { label: string; value: string; rank: string | null }[] = [];
  const table = doc.getElementById("plnMain_rpTranscriptGroup_tblCumGPAInfo");
  if (table) {
    for (const row of Array.from(table.querySelectorAll("tr"))) {
      const label = row.querySelector('span[id*="lblGPADescr"]');
      const value = row.querySelector('span[id*="lblGPACum"]');
      if (!label || !value) continue;
      gpa.push({
        label: text(label),
        value: text(value),
        rank: text(row.querySelector('span[id*="lblGPARank"]')) || null,
      });
    }
  }

  return { years, gpa };
}

/// Parse a transcript page fetched as HTML. Browser only, same as above.
export function parseTranscriptHtml(html: string) {
  return extractTranscript(new DOMParser().parseFromString(html, "text/html"));
}
