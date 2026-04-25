// Tiny classnames helper. Filters falsy, joins with space.
export function cn(...args: (string | false | null | undefined)[]): string {
  return args.filter(Boolean).join(' ');
}
