import PeerJS, { DataConnection } from 'peerjs';

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

/**
 * Player-to-player rooms for when the game is hosted on its own website.
 * The first person to use a code becomes its host; everyone else connects to the host,
 * which forwards each player's state to all the others about 20 times a second.
 */
function peerOpts(): any {
  const q = new URLSearchParams(location.search), h = q.get('peerhost');
  const ice = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] };
  return h ? { host: h, port: Number(q.get('peerport') ?? 9000), path: '/', secure: false, config: ice } : { config: ice };
}
class PeerDuel implements NamedRoom {
  private conns = new Map<string, DataConnection>(); private hostConn: DataConnection | null = null;
  private others = new Map<string, Record<string, Json>>(); private mine: Record<string, Json> = {}; private timer = 0; private fns: ((c: { peers: readonly Peer[] }) => void)[] = [];
  isHost = false; myId = '';
  private constructor(private peer: PeerJS) { this.myId = peer.id; }
  static open(code: string): Promise<PeerDuel> {
    const id = 'kilic-arena-' + code;
    return new Promise((resolve, reject) => {
      const fail = setTimeout(() => reject(new Error('timeout')), 15000);
      const asHost = new PeerJS(id, peerOpts());
      asHost.on('open', () => { clearTimeout(fail); const d = new PeerDuel(asHost); d.isHost = true; d.serve(); resolve(d); });
      asHost.on('error', (e: any) => {
        if (e?.type !== 'unavailable-id') { clearTimeout(fail); reject(e); return; }
        asHost.destroy(); // somebody already hosts this code: join them
        const me = new PeerJS(peerOpts());
        me.on('open', () => {
          const c = me.connect(id, { reliable: false, serialization: 'json' });
          c.on('open', () => { clearTimeout(fail); const d = new PeerDuel(me); d.hostConn = c; d.listen(c); resolve(d); });
        });
        me.on('error', (e2: any) => { clearTimeout(fail); reject(e2); });
      });
    });
  }
  private serve() {
    this.peer.on('connection', (c) => {
      c.on('open', () => this.conns.set(c.peer, c));
      c.on('data', (d: any) => { if (d && typeof d === 'object' && d.p && typeof d.p === 'object') { const had = this.others.has(c.peer); this.others.set(c.peer, d.p); if (!had) this.fire(); } });
      const gone = () => { this.conns.delete(c.peer); this.others.delete(c.peer); this.fire(); };
      c.on('close', gone); c.on('error', gone);
    });
    this.timer = window.setInterval(() => {
      const all: Record<string, Json> = { [this.myId]: this.mine }; this.others.forEach((p, k) => { all[k] = p; });
      this.conns.forEach((c) => { try { c.send({ s: all }); } catch { /* dropped */ } });
    }, 50);
  }
  private listen(c: DataConnection) {
    c.on('data', (d: any) => {
      if (!d || typeof d !== 'object' || !d.s) return; const before = this.others.size; this.others.clear();
      for (const k of Object.keys(d.s)) if (k !== this.myId && d.s[k] && typeof d.s[k] === 'object') this.others.set(k, d.s[k]);
      if (this.others.size !== before) this.fire();
    });
    const gone = () => { this.others.clear(); this.fire(); };
    c.on('close', gone); c.on('error', gone);
    this.timer = window.setInterval(() => { try { c.send({ p: this.mine }); } catch { /* dropped */ } }, 50);
  }
  private fire() { const ps = this.peers(); this.fns.forEach((f) => f({ peers: ps })); }
  async emit() {}
  async presence(p: Record<string, Json | null>) { for (const k in p) { if (p[k] === null) delete this.mine[k]; else this.mine[k] = p[k]; } }
  peers(): Peer[] { return [{ peer: this.myId, isMe: true, sameTab: true, presence: this.mine }, ...[...this.others].map(([peer, presence]) => ({ peer, isMe: false, sameTab: false, presence }))]; }
  onPeers(fn: (c: { peers: readonly Peer[] }) => void) { this.fns.push(fn); return () => { this.fns = this.fns.filter((f) => f !== fn); }; }
  async leave() { clearInterval(this.timer); this.conns.forEach((c) => c.close()); this.hostConn?.close(); this.peer.destroy(); }
  connected() { return !this.peer.disconnected; }
}
class PeerLobby implements Room {
  readonly p2p = true;
  async emit() {} async presence() {} peers(): Peer[] { return []; } onPeers() { return () => {}; } async leave() {} connected() { return true; }
  join(name: string) { return PeerDuel.open(name.replace(/^duel-/, '')) as Promise<NamedRoom>; }
}

/** Uses the claude.ai live room when the game runs there, otherwise direct player-to-player connections. */
export async function connectRoom(): Promise<Room | null> {
  const viaClaude = await connectClaudeRoom();
  return viaClaude ?? new PeerLobby();
}
async function connectClaudeRoom(): Promise<Room | null> {
  if (new URLSearchParams(location.search).has('mock')) return new MockRoom('lobby');
  if (!/claude\.ai|claudeusercontent/.test(location.hostname + document.referrer) && !(window as any).claude) return null;
  for (let i = 0; i < 30 && !(window as any).claude?.use; i++) await new Promise((r) => setTimeout(r, 100));
  const c = (window as any).claude; if (!c?.use) return null;
  try { return (await Promise.race([c.use('room'), new Promise((r) => setTimeout(() => r(null), 10000))])) as Room | null; } catch { return null; }
}
export type { Room, NamedRoom };
