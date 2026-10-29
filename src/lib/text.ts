/** Em dashes and en dashes read as generated copy. The site uses a hyphen. */
const TYPOGRAPHIC_DASH = /[\u2012\u2013\u2014\u2015]/g;

export function plainDashes(value: string): string {
  return value.replace(TYPOGRAPHIC_DASH, "-");
}
