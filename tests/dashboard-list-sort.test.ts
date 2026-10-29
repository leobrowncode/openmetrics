import { describe, expect, test } from "vitest";
import {
  dashboardSortHref,
  nextDashboardSort,
  parseDashboardSort,
  sortDashboards,
  type DashboardSortable,
} from "@/lib/dashboard-list-sort";

const rows: DashboardSortable[] = [
  {
    id: "b",
    name: "Compte 10 - Reporting",
    clientName: "Maison Lumen",
    updatedAt: "2026-03-01T10:00:00.000Z",
    activeLinks: 1,
  },
  {
    id: "a",
    name: "Compte 2 - Reporting",
    clientName: "École du Regard",
    updatedAt: new Date("2026-05-01T10:00:00.000Z"),
    activeLinks: 0,
  },
  {
    id: "c",
    name: "Compte 2 - Reporting",
    clientName: "Café des Arts",
    updatedAt: "2026-01-01T10:00:00.000Z",
    activeLinks: 4,
  },
];

function ids(sort: { key: "name" | "client" | "links" | "updated"; dir: "asc" | "desc" }) {
  return sortDashboards(rows, sort).map((row) => row.id);
}

describe("parseDashboardSort", () => {
  test("defaults to client ascending", () => {
    expect(parseDashboardSort({})).toEqual({ key: "client", dir: "asc" });
    expect(parseDashboardSort({ sort: "nope", dir: "desc" })).toEqual({ key: "client", dir: "asc" });
    expect(parseDashboardSort({ sort: "", dir: "desc" })).toEqual({ key: "client", dir: "asc" });
  });

  test("reads the first usable query value", () => {
    expect(parseDashboardSort({ sort: ["", "links"], dir: ["desc"] })).toEqual({ key: "links", dir: "desc" });
  });

  test("uses the natural direction when ordre is missing or invalid", () => {
    expect(parseDashboardSort({ sort: "updated" })).toEqual({ key: "updated", dir: "desc" });
    expect(parseDashboardSort({ sort: "name", dir: "sideways" })).toEqual({ key: "name", dir: "asc" });
    expect(parseDashboardSort({ sort: "links", dir: "asc" })).toEqual({ key: "links", dir: "asc" });
  });
});

describe("sortDashboards", () => {
  test("sorts the dashboard name with French and numeric order", () => {
    // Two "Compte 2" stay newest-first. "Compte 10" follows them in A → Z.
    expect(ids({ key: "name", dir: "asc" })).toEqual(["a", "c", "b"]);
    expect(ids({ key: "name", dir: "desc" })).toEqual(["b", "a", "c"]);
  });

  test("sorts by client, then keeps the newest edit first when clients match", () => {
    const tied: DashboardSortable[] = [
      { id: "old", name: "B", clientName: "Maison Lumen", updatedAt: "2026-01-01T00:00:00.000Z", activeLinks: 0 },
      { id: "new", name: "A", clientName: "Maison Lumen", updatedAt: "2026-06-01T00:00:00.000Z", activeLinks: 3 },
      { id: "other", name: "Z", clientName: "Café des Arts", updatedAt: "2026-02-01T00:00:00.000Z", activeLinks: 9 },
    ];
    expect(sortDashboards(tied, { key: "client", dir: "asc" }).map((row) => row.id)).toEqual(["other", "new", "old"]);
    expect(sortDashboards(tied, { key: "client", dir: "desc" }).map((row) => row.id)).toEqual(["new", "old", "other"]);
  });

  test("sorts by active link count", () => {
    expect(ids({ key: "links", dir: "asc" })).toEqual(["a", "b", "c"]);
    expect(ids({ key: "links", dir: "desc" })).toEqual(["c", "b", "a"]);
  });

  test("sorts by modification date and does not mutate the source list", () => {
    const snapshot = rows.map((row) => row.id);
    expect(ids({ key: "updated", dir: "asc" })).toEqual(["c", "b", "a"]);
    expect(ids({ key: "updated", dir: "desc" })).toEqual(["a", "b", "c"]);
    expect(rows.map((row) => row.id)).toEqual(snapshot);
  });

  test("breaks remaining ties by name, then id", () => {
    const tied: DashboardSortable[] = [
      { id: "b", name: "Zèbre", clientName: "Client", updatedAt: "2026-01-01T00:00:00.000Z", activeLinks: 2 },
      { id: "a", name: "Alpha", clientName: "Client", updatedAt: "2026-01-01T00:00:00.000Z", activeLinks: 2 },
    ];
    expect(sortDashboards(tied, { key: "links", dir: "asc" }).map((row) => row.id)).toEqual(["a", "b"]);
  });
});

describe("dashboard sort links", () => {
  test("column click flips the active column and opens the others in their default direction", () => {
    expect(nextDashboardSort({ key: "client", dir: "asc" }, "client")).toEqual({ key: "client", dir: "desc" });
    expect(nextDashboardSort({ key: "client", dir: "asc" }, "updated")).toEqual({ key: "updated", dir: "desc" });
    expect(nextDashboardSort({ key: "updated", dir: "desc" }, "name")).toEqual({ key: "name", dir: "asc" });
  });

  test("builds a dashboards query", () => {
    expect(dashboardSortHref({ key: "updated", dir: "desc" })).toBe("/admin/dashboards?sort=updated&dir=desc");
  });
});
