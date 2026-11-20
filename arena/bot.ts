import { Fighter, T } from './fighter';

/** A computer opponent that spaces itself, strafes, attacks in combos, blocks, parries now and then, and dodges heavy swings. */
export class Bot {
  private think = 0; private plan = { mx: 0, my: 0, block: false }; private strafe = 1; private pressure = 0; private seenSeq = -1; private react = -1; private reaction: 'block' | 'parry' | 'dodge' | 'none' = 'none'; private wantCombo = 0;
  constructor(public level = 1) {}
  cmd(me: Fighter, opp: Fighter, dt: number) {
    const out = { mx: 0, my: 0, light: false, heavy: false, block: false, dodge: false, leap: false };
    if (!me.alive || !opp.alive) return out;
    const dist = me.root.position.distanceTo(opp.root.position);
    this.think -= dt; this.pressure -= dt;
    // react to the player's attacks
    const attacking = opp.act === 'light' || opp.act === 'heavy';
    if (attacking && opp.actSeq !== this.seenSeq && dist < 3.6) {
      this.seenSeq = opp.actSeq; const r = Math.random(), skill = [0.35, 0.55, 0.75][this.level];
      this.reaction = opp.act === 'heavy' ? (r < skill ? 'dodge' : r < skill + 0.15 ? 'parry' : 'none') : r < skill * 0.75 ? 'block' : r < skill ? 'parry' : 'none';
      this.react = opp.act === 'heavy' ? 0.28 + Math.random() * 0.12 : (this.reaction === 'parry' ? 0.06 : 0.02) + Math.random() * 0.08;
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
      this.think = 0.35 + Math.random() * 0.6; if (Math.random() < 0.3) this.strafe *= -1;
      const want = 1.9 + Math.random() * 0.6;
      this.plan.mx = this.strafe * (0.3 + Math.random() * 0.5); this.plan.my = dist > want + 0.4 ? 1 : dist < want - 0.5 ? -0.8 : (Math.random() - 0.5) * 0.4;
    }
    out.mx = out.mx || this.plan.mx; out.my = out.my || this.plan.my; out.block = this.plan.block;
    // the once-a-match leap: on an opening, or when losing
    if (me.act === 'idle' && !me.leapUsed && dist > 2.2 && dist < 5 && (opp.act === 'stun' || opp.act === 'recoil' || (me.hp < 45 && Math.random() < dt * 0.4))) { out.leap = true; return out; }
    // offence
    if (me.act === 'light' && this.wantCombo > me.combo && me.actT > 0.25) out.light = true;
    if (me.act === 'idle' && dist < 2.55 && this.pressure <= 0 && me.st > 30 && opp.act !== 'dodge') {
      const punish = opp.act === 'stun' || opp.act === 'recoil' || (opp.act === 'heavy' && opp.actT > T.heavyWin[1]);
      if (punish || Math.random() < 0.6) {
        if (Math.random() < 0.22 || (opp.act === 'block' && Math.random() < 0.55)) out.heavy = true; else { out.light = true; this.wantCombo = Math.floor(Math.random() * 3); }
        this.pressure = [1.6, 1.0, 0.6][this.level] + Math.random() * 0.8;
      } else this.pressure = 0.4;
    }
    return out;
  }
}
