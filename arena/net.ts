/** Thin wrapper over the page's live room. Everything a fighter does travels in its presence object. */
type Json = unknown;
export interface Peer { peer: string; isMe: boolean; sameTab: boolean; presence: Record<string, Json> }
interface NamedRoom { emit(t: string, d?: Json): Promise<void>; presence(p: Record<string, Json | null>): Promise<void>; peers(): readonly Peer[]; onPeers(fn: (c: { peers: readonly Peer[] }) => void): () => void; leave(): Promise<void>; connected(): boolean }
interface Room extends NamedRoom { join(name: string): Promise<NamedRoom> }

/** Local stand-in for testing two tabs in one browser (add ?mock=1). */
class MockRoom implements Room {
  private ch: BroadcastChannel; private me = Math.random().toString(36).slice(2, 10); private others = new Map<string, Record<string, Json>>(); private mine: Record<string, Json> = {}; private fns: ((c: { peers: readonly Peer[] }) => void)[] = [];
  constructor(private name: string) {
    this.ch = new BroadcastChannel('arena-' + name);
    this.ch.onmessage = (e) => { const { from, p, bye } = e.data; if (bye) this.others.delete(from); else { const had = this.others.has(from); this.others.set(from, p); if (!had) this.push(); } this.fire(); };
    this.push(); addEventListener('beforeunload', () => this.ch.postMessage({ from: this.me, bye: true }));
  }
  private push() { this.ch.postMessage({ from: this.me, p: this.mine }); }
  private fire() { const ps = this.peers(); this.fns.forEach((f) => f({ peers: ps })); }
  async emit() {}
  async presence(p: Record<string, Json | null>) { for (const k in p) { if (p[k] === null) delete this.mine[k]; else this.mine[k] = p[k]; } this.push(); }
  peers(): Peer[] { return [{ peer: this.me, isMe: true, sameTab: true, presence: this.mine }, ...[...this.others].map(([peer, presence]) => ({ peer, isMe: false, sameTab: false, presence }))]; }
  onPeers(fn: (c: { peers: readonly Peer[] }) => void) { this.fns.push(fn); setTimeout(() => fn({ peers: this.peers() }), 0); return () => { this.fns = this.fns.filter((f) => f !== fn); }; }
  async leave() { this.ch.postMessage({ from: this.me, bye: true }); this.ch.close(); }
  connected() { return true; }
  async join(name: string) { return new MockRoom(this.name + '.' + name); }
}

export async function connectRoom(): Promise<Room | null> {
  if (new URLSearchParams(location.search).has('mock')) return new MockRoom('lobby');
  for (let i = 0; i < 30 && !(window as any).claude?.use; i++) await new Promise((r) => setTimeout(r, 100));
  const c = (window as any).claude; if (!c?.use) return null;
  try { return (await Promise.race([c.use('room'), new Promise((r) => setTimeout(() => r(null), 10000))])) as Room | null; } catch { return null; }
}
export type { Room, NamedRoom };
