// Pure rules for a verse annotation, shared by the Convex mutation and the editor that calls it.

export const ANNOTATION_BODY_MAX = 1200;

export function normalizeAnnotationBody(body: string): string {
  return body.trim().replace(/\s+/g, " ");
}

/**
 * Why an annotation can't be saved, or null if it can. An annotation is a note, a highlight, or both:
 * a highlight needs no note text, and nothing is stored in place of one.
 */
export function annotationProblem(body: string, highlightColor: string | null | undefined): string | null {
  const normalized = normalizeAnnotationBody(body);
  if (normalized.length > ANNOTATION_BODY_MAX) return "Annotation text is too long";
  if (!normalized && !highlightColor) return "Add a note or choose a highlight";
  return null;
}
