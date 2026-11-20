import { Fighter, T } from './fighter';

/** A computer opponent that spaces itself, strafes, attacks in combos, blocks, parries now and then, and dodges heavy swings. */
export class Bot {
  private think = 0; private plan = { mx: 0, my: 0, block: false }; private strafe = 1; private pressure = 0; private seenSeq = -1; private react = -1; private reaction: 'block' | 'parry' | 'dodge' | 'none' = 'none'; private wantCombo = 0;
  /** seeded dice, so two bots can be given identical choices when testing fairness */
  private seed = Math.floor(Math.random() * 2147483646) + 1;
  rand() { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; }
  setSeed(n: number) { this.seed = n; }
  constructor(public level = 1) {}
  cmd(me: Fighter, opp: Fighter, dt: number) {
    const out = { mx: 0, my: 0, light: false, heavy: false, block: false, dodge: false, leap: false };
    if (!me.alive || !opp.alive) return out;
    const dist = me.root.position.distanceTo(opp.root.position);
    this.think -= dt; this.pressure -= dt;
    // react to the player's attacks
    const attacking = opp.act === 'light' || opp.act === 'heavy' || opp.act === 'leap';
    if (attacking && opp.actSeq !== this.seenSeq && dist < (opp.act === 'leap' ? 6 : 3.6)) {
      this.seenSeq = opp.actSeq; const r = this.rand(), skill = [0.3, 0.5, 0.68][this.level];
      this.reaction = opp.act === 'leap' ? (r < skill * 0.9 ? 'dodge' : 'none') : opp.act === 'heavy' ? (r < skill ? 'dodge' : r < skill + 0.15 ? 'parry' : 'none') : r < skill * 0.85 ? 'block' : r < skill ? 'parry' : 'none';
      // a block goes up as soon as the swing is read; a parry is timed to meet the blade, so it is rarer and riskier
      const win = (opp.act === 'leap' ? T.leapWin[0] : opp.act === 'heavy' ? T.heavyWin[0] : T.lightWin[0]) - opp.actT;
      if (this.reaction === 'parry') this.react = Math.max(0, win - 0.1 + (this.rand() - 0.5) * [0.16, 0.1, 0.06][this.level]);
      else if (this.reaction === 'dodge') this.react = Math.max(0, win - 0.22 + this.rand() * 0.1);
      else this.react = 0.02 + this.rand() * [0.12, 0.07, 0.04][this.level];
    }
    if (this.react >= 0) {
      this.react -= dt;
      if (this.react < 0) {
        if (this.reaction === 'dodge') { out.dodge = true; out.mx = this.strafe; out.my = -0.4; }
        if (this.reaction === 'block' || this.reaction === 'parry') this.plan.block = true;
      }
    }
    if (!attacking && this.plan.block && me.act === 'block' && me.actT > 0.35) this.plan.block = false;
    // footwork
    if (this.think <= 0) {
      this.think = 0.35 + this.rand() * 0.6; if (this.rand() < 0.3) this.strafe *= -1;
      const want = 1.45 + this.rand() * 0.45;
      this.plan.mx = this.strafe * (0.3 + this.rand() * 0.5); this.plan.my = dist > want + 0.4 ? 1 : dist < want - 0.5 ? -0.8 : (this.rand() - 0.5) * 0.4;
    }
    out.mx = out.mx || this.plan.mx; out.my = out.my || this.plan.my; out.block = this.plan.block;
    // the once-a-match leap: on an opening, or when losing
    if (me.act === 'idle' && !me.leapUsed && dist > 2.4 && dist < 5 && (opp.act === 'stun' || opp.act === 'recoil' || (me.hp < 45 && this.rand() < dt * 0.4))) { out.leap = true; return out; }
    // offence
    if (me.act === 'light' && this.wantCombo > me.combo && me.actT > 0.25) out.light = true;
    if (me.act === 'idle' && dist < 1.75 && this.pressure <= 0 && me.st > 30 && opp.act !== 'dodge') {
      const punish = opp.act === 'stun' || opp.act === 'recoil' || (opp.act === 'heavy' && opp.actT > T.heavyWin[1]);
      if (punish || this.rand() < 0.6) {
        if (this.rand() < 0.22 || (opp.act === 'block' && this.rand() < 0.55)) out.heavy = true; else { out.light = true; this.wantCombo = Math.floor(this.rand() * 3); }
        this.pressure = [1.6, 1.0, 0.6][this.level] + this.rand() * 0.8;
      } else this.pressure = 0.4;
    }
    return out;
  }
}
