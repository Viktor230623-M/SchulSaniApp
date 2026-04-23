import fs from "fs";
import path from "path";

const DISMISSALS_PATH =
  process.env["DISMISSALS_PATH"] ??
  "/var/www/SchulSaniApp/dismissed-missions.json";

type DismissalMap = Record<string, string[]>;

function load(): DismissalMap {
  try {
    const raw = fs.readFileSync(DISMISSALS_PATH, "utf-8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function save(data: DismissalMap): void {
  try {
    fs.mkdirSync(path.dirname(DISMISSALS_PATH), { recursive: true });
    fs.writeFileSync(DISMISSALS_PATH, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.error("[dismissals] failed to persist:", err);
  }
}

export function getDismissedFor(userId: string): Set<string> {
  const map = load();
  return new Set(map[userId] ?? []);
}

export function addDismissal(userId: string, missionId: string): void {
  const map = load();
  const list = map[userId] ?? [];
  if (!list.includes(missionId)) {
    list.push(missionId);
    map[userId] = list;
    save(map);
  }
}

export function removeDismissal(userId: string, missionId: string): void {
  const map = load();
  const list = map[userId];
  if (!list) return;
  const next = list.filter((id) => id !== missionId);
  if (next.length === 0) delete map[userId];
  else map[userId] = next;
  save(map);
}
