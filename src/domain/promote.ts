import { getLesson } from "./lesson.js";
import { saveInstinct, InstinctFm } from "./instinct.js";

export async function promoteLessonToInstinct(
  repo: string,
  lessonSlug: string,
): Promise<InstinctFm | null> {
  const lesson = await getLesson(repo, lessonSlug);
  if (!lesson) return null;
  return saveInstinct({
    slug: `${repo}-${lesson.data.id}`,
    title: `[${repo}] ${lesson.data.id}`,
    trigger: lesson.data.symptom,
    action: lesson.data.fix,
    why: lesson.data.cause,
    tags: lesson.data.tags,
  });
}
