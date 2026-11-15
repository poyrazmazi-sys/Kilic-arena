/** Fetches a binary asset stored as base64 inside a JSON file. */
export async function fetchBin(url: string): Promise<ArrayBuffer> {
  const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`);
  const s = atob((await r.json()).b64), u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
}
