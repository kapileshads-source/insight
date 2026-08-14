/**
 * Lifting HAC's gradebook page into the plain structures `hac.ts` reads.
 *
 * Deliberately dull, and deliberately separate. Everything that can be subtly
 * wrong — which column is the score, what `Z` means, whether a row is a real
 * assignment — lives next door and is tested without a browser. This file
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
 * so both are tried before giving up. Giving up is fine — `readTable` treats
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

/// Parse a page fetched as HTML. Browser only — there is no DOMParser in Node,
/// which is exactly why the decisions live in `hac.ts` instead of here.
export function parseHacHtml(html: string): HacTable[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return extractTables(doc);
}
