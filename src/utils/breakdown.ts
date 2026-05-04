export interface BrokenTask {
  title: string;
  content: string;
}

export interface BreakdownResult {
  tasks: BrokenTask[];
  strategy: "single" | "h2" | "h2_h3" | "marker";
  warning?: string;
}

export interface BreakdownOptions {
  smallThreshold: number;
  largeThreshold: number;
}

export function breakdownPlan(content: string, opts: BreakdownOptions): BreakdownResult {
  const lines = content.split(/\r?\n/);
  const lineCount = lines.length;

  // Explicit split signals (H2 headings or '## Task:' markers) always win,
  // regardless of line count. Heuristics only apply when there's nothing explicit.
  const h2Tasks = splitByHeading(lines, 2);
  if (h2Tasks.length >= 2) {
    const allLookLikeTaskMarker = h2Tasks.every((t) => /^task:\s*/i.test(t.title));
    const normalized = allLookLikeTaskMarker
      ? h2Tasks.map((t) => ({ ...t, title: t.title.replace(/^task:\s*/i, "").trim() || t.title }))
      : h2Tasks;

    if (lineCount >= opts.largeThreshold) {
      const refined = refineByH3(normalized);
      return { tasks: refined, strategy: "h2_h3" };
    }
    return {
      tasks: normalized,
      strategy: allLookLikeTaskMarker ? "marker" : "h2",
    };
  }

  const markerTasks = splitByMarker(lines, /^##\s*Task:/i);
  if (markerTasks.length >= 2) {
    return { tasks: markerTasks, strategy: "marker" };
  }

  const result: BreakdownResult = {
    tasks: [{ title: "Implement plan", content: content.trim() }],
    strategy: "single",
  };
  if (lineCount >= opts.smallThreshold) {
    result.warning =
      "Plan exceeds the small threshold but no H2 / '## Task:' markers were found; left as a single task.";
  }
  return result;
}

function splitByHeading(lines: string[], level: 2 | 3): BrokenTask[] {
  const prefix = "#".repeat(level);
  const pattern = new RegExp(`^${prefix}\\s+(?!#)(.+)$`); // level exactly, not deeper
  const results: BrokenTask[] = [];
  let currentTitle: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentTitle !== null) {
      results.push({ title: currentTitle.trim(), content: buffer.join("\n").trim() });
    }
  };

  for (const line of lines) {
    const match = line.match(pattern);
    if (match) {
      flush();
      currentTitle = match[1];
      buffer = [];
    } else if (currentTitle !== null) {
      buffer.push(line);
    }
  }
  flush();
  return results.filter((t) => t.title.length > 0);
}

function splitByMarker(lines: string[], marker: RegExp): BrokenTask[] {
  const results: BrokenTask[] = [];
  let currentTitle: string | null = null;
  let buffer: string[] = [];

  const flush = () => {
    if (currentTitle !== null) {
      results.push({ title: currentTitle.trim(), content: buffer.join("\n").trim() });
    }
  };

  for (const line of lines) {
    if (marker.test(line)) {
      flush();
      currentTitle = line.replace(marker, "").trim();
      buffer = [];
    } else if (currentTitle !== null) {
      buffer.push(line);
    }
  }
  flush();
  return results.filter((t) => t.title.length > 0);
}

function refineByH3(h2Tasks: BrokenTask[]): BrokenTask[] {
  const refined: BrokenTask[] = [];
  for (const parent of h2Tasks) {
    const subs = splitByHeading(parent.content.split(/\r?\n/), 3);
    if (subs.length >= 2) {
      for (const sub of subs) {
        refined.push({
          title: `${parent.title} — ${sub.title}`,
          content: sub.content,
        });
      }
    } else {
      refined.push(parent);
    }
  }
  return refined;
}
