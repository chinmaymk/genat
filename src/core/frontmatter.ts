import matter from 'gray-matter';

export interface ParsedFrontMatter<T = Record<string, unknown>> {
  data: T;
  content: string;
}

/**
 * Parse frontmatter from a markdown file string.
 * Returns the YAML/frontmatter as `data` and the rest as `content`.
 */
export function parseFrontMatter<T = Record<string, unknown>>(
  raw: string
): ParsedFrontMatter<T> {
  const parsed = matter(raw);
  return {
    data: parsed.data as T,
    content: parsed.content.trim(),
  };
}
