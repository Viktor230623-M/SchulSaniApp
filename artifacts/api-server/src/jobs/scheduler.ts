import { runRetention } from "./retention";
import { runSchoolExports } from "./exports";

const DAY_MS = 24 * 60 * 60 * 1000;

async function tick(): Promise<void> {
  try {
    const results = await runRetention();
    const touched = results.filter((r) => r.count > 0);
    if (touched.length === 0) {
      console.log("[retention] nichts faellig");
    } else {
      for (const r of touched) {
        console.log(`[retention] ${r.table}: ${r.count} ${r.action === "deleted" ? "geloescht" : "anonymisiert"}`);
      }
    }
  } catch (err) {
    console.error("[retention] Durchlauf fehlgeschlagen:", err);
  }

  try {
    const created = await runSchoolExports();
    if (created.length === 0) {
      console.log("[export] nichts faellig");
    } else {
      for (const c of created) {
        console.log(`[export] ${c.schoolId}: Buendel mit ${c.reportCount} Protokollen erzeugt`);
      }
    }
  } catch (err) {
    console.error("[export] Durchlauf fehlgeschlagen:", err);
  }
}

/** Startet den Loeschlauf beim Boot und danach alle 24 Stunden. */
export function startScheduler(): void {
  void tick();
  const timer = setInterval(() => void tick(), DAY_MS);
  timer.unref();
}
