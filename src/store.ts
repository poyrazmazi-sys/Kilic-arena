export const load = (k: string): string | null => { try { return localStorage.getItem('j1453.' + k); } catch { return null; } };
export const save = (k: string, v: string) => { try { localStorage.setItem('j1453.' + k, v); } catch { /* storage unavailable */ } };
