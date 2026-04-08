import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

/**
 * Parses a CSV file and yields row objects.
 * Expects at minimum a `phone` column.
 * @param {string} filePath
 * @returns {AsyncIterable<Record<string, string>>}
 */
export async function* parseCsvFile(filePath) {
  const stream = createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true })
  );

  for await (const row of stream) {
    yield row;
  }
}

/**
 * Normalise a phone number to E.164 format (basic).
 * Strips spaces, dashes, parentheses.
 * Returns null if input is falsy.
 */
export const normalisePhone = (raw) => {
  if (!raw) return null;
  return String(raw).replace(/[\s\-\(\)]/g, '').replace(/^00/, '+');
};
