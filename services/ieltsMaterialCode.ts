/** Display identity comes from the server; routes, allocations and attempts keep their own IDs. */
export function ieltsMaterialTitle(code: string | null | undefined, title: string): string {
  return code && /^[LRWS]-[0-9]{3,}$/.test(code) ? `${code} · ${title}` : title;
}
