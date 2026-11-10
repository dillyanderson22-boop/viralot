"use client";

import { useEffect, useRef } from "react";

export type BrainPhase = "assemble" | "render" | "brain" | "score";

type V3 = [number, number, number];

const N = 1700;

function fibSphere(i: number, n: number): V3 {
  const y = 1 - (i / (n - 1)) * 2;
  const r = Math.sqrt(1 - y * y);
  const th = Math.PI * (3 - Math.sqrt(5)) * i;
  return [Math.cos(th) * r, y, Math.sin(th) * r];
}

/** Two hemispheres, a fissure, folded gyri, cerebellum and brainstem. */
function brainPoint(i: number, n: number): V3 {
  const r01 = (k: number) => {
    const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const part = r01(1);
  if (part < 0.1) {
    // cerebellum
    const [x, y, z] = fibSphere(Math.floor(r01(2) * 400), 400);
    const wr = 1 + 0.06 * Math.sin(y * 28);
    return [x * 0.55 * wr, -0.5 + y * 0.26 * wr, -0.72 + z * 0.36 * wr];
  }
  if (part < 0.14) {
    // brainstem
    const a = r01(3) * Math.PI * 2;
    const h = r01(4);
    // angled back and down, under the rear third like a real brainstem
    return [Math.cos(a) * 0.11 * (1 - h * 0.3), -0.42 - h * 0.62, -0.42 + Math.sin(a) * 0.11 - h * 0.18];
  }
  const [sx, sy, sz] = fibSphere(i, n);
  let x = sx * 0.92;
  let y = sy * 0.74;
  let z = sz * 1.18;
  // flatten the underside, lift the frontal lobe a touch
  if (y < -0.25) y = -0.25 + (y + 0.25) * 0.55;
  y += z > 0.6 ? (z - 0.6) * 0.08 : 0;
  // temporal lobe bulge
  if (y < 0 && Math.abs(x) > 0.5) y -= 0.08 * (Math.abs(x) - 0.5);
  // gyri — the wrinkles
  const th = Math.atan2(z, x);
  const ph = Math.acos(Math.max(-1, Math.min(1, sy)));
  const fold = 1 + 0.075 * Math.sin(11 * th + 4 * Math.sin(6 * ph)) * Math.sin(7 * ph + 2 * Math.cos(5 * th));
  x *= fold;
  y *= fold;
  z *= fold;
  // lateral (Sylvian) fissure: a groove sweeping up from the temporal lobe
  const sylvian = y - (-0.05 + z * 0.28);
  if (Math.abs(sylvian) < 0.05 && z > -0.3 && Math.abs(x) > 0.45) {
    x *= 0.93;
    z *= 0.97;
  }
  // longitudinal fissure: split the hemispheres
  const side = Math.sign(x) || 1;
  x += side * 0.07;
  if (Math.abs(sx) < 0.1 && y > 0) y -= 0.12 * (1 - Math.abs(sx) / 0.1);
  return [x, y, z];
}

function scatter(i: number): V3 {
  const r = (k: number) => {
    const v = Math.sin(i * 91.7 + k * 13.1) * 9631.7;
    return v - Math.floor(v);
  };
  const a = r(1) * Math.PI * 2;
  const b = Math.acos(2 * r(2) - 1);
  const d = 1.5 + r(3) * 1.1;
  return [Math.sin(b) * Math.cos(a) * d, Math.cos(b) * d, Math.sin(b) * Math.sin(a) * d];
}

const REGIONS: { label: string; at: V3 }[] = [
  { label: "HOOK", at: [0, 0.25, 0.95] },
  { label: "EMOTION", at: [0.85, -0.2, 0.35] },
  { label: "RETENTION", at: [0, 0.72, -0.15] },
  { label: "SHAREABILITY", at: [0, 0.15, -1.05] },
  { label: "CTA", at: [0, -0.5, -0.78] },
];

export function ParticleBrain({ phase, className, score = 0, regionValues }: { phase: BrainPhase; className?: string; score?: number; regionValues?: number[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  const phaseAt = useRef(0);
  const scoreRef = useRef(score);
  const valuesRef = useRef(regionValues ?? [92, 88, 85, 81, 90]);

  useEffect(() => {
    phaseRef.current = phase;
    phaseAt.current = performance.now();
  }, [phase]);
  useEffect(() => {
    scoreRef.current = score;
    if (regionValues) valuesRef.current = regionValues;
  }, [score, regionValues]);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext("2d")!;
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const S: V3[] = [];
    const B: V3[] = [];
    const R: V3[] = [];
    for (let i = 0; i < N; i++) {
      S.push(fibSphere(i, N));
      B.push(brainPoint(i, N));
      R.push(scatter(i));
    }
    // neighbour graph on the brain shape, for synapses
    const edges: [number, number][] = [];
    for (let i = 0; i < N; i += 2) {
      let best = -1;
      let bd = 1e9;
      let second = -1;
      let sd = 1e9;
      for (let j = 0; j < N; j++) {
        if (j === i) continue;
        const dx = B[i][0] - B[j][0];
        const dy = B[i][1] - B[j][1];
        const dz = B[i][2] - B[j][2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bd) {
          second = best;
          sd = bd;
          best = j;
          bd = d;
        } else if (d < sd) {
          second = j;
          sd = d;
        }
      }
      if (best >= 0) edges.push([i, best]);
      if (second >= 0 && i % 4 === 0) edges.push([i, second]);
    }
    // long-range "thought" links
    const links: [number, number][] = [];
    for (let k = 0; k < 140; k++) links.push([Math.floor(Math.random() * N), Math.floor(Math.random() * N)]);

    const cur: V3[] = R.map((p) => [...p] as V3);
    const pulses: { e: number; t0: number; long: boolean }[] = [];
    const proj = new Float32Array(N * 3);
    const prev = new Float32Array(N * 2);
    let font = "system-ui, sans-serif";
    const fv = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim();
    if (fv) font = fv + ", ui-monospace, monospace";
    let mouseX = 0;
    let mouseY = 0;
    const onMove = (e: PointerEvent) => {
      mouseX = e.clientX / window.innerWidth - 0.5;
      mouseY = e.clientY / window.innerHeight - 0.5;
    };
    window.addEventListener("pointermove", onMove);

    let raf = 0;
    const t0 = performance.now();
    let rotY = 0;
    let last = t0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - t0) / 1000;
      const ph = phaseRef.current;
      const sincePhase = (now - phaseAt.current) / 1000;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      // target shape + morph speed per phase
      const target = ph === "assemble" || ph === "render" ? S : B;
      const speed = ph === "assemble" ? 2.2 : 2.8;
      for (let i = 0; i < N; i++) {
        // staggered so the morph ripples through the cloud
        const delay = (i % 97) / 97;
        const k = Math.min(1, Math.max(0, sincePhase * 1.3 - delay * 0.6));
        const a = Math.min(1, dt * speed * (0.4 + k));
        const tg = target[i];
        cur[i][0] += (tg[0] - cur[i][0]) * a;
        cur[i][1] += (tg[1] - cur[i][1]) * a;
        cur[i][2] += (tg[2] - cur[i][2]) * a;
      }

      const spin = ph === "assemble" ? 1.4 : ph === "render" ? 0.9 : 0;
      rotY += dt * spin;
      // A brain reads best in profile, so once it forms, ease to side-on and sway.
      const brainish = ph === "brain" || ph === "score";
      const sideOn = Math.PI / 2 + Math.sin(t * 0.45) * 0.55;
      if (brainish) {
        const target = Math.round((rotY - sideOn) / (Math.PI * 2)) * Math.PI * 2 + sideOn;
        rotY += (target - rotY) * Math.min(1, dt * 2.2);
      }
      const ry = rotY + mouseX * 0.6;
      const rx = -0.18 + mouseY * 0.3 + (ph === "brain" || ph === "score" ? Math.sin(t * 0.5) * 0.06 : 0);
      const cy = Math.cos(ry);
      const sy = Math.sin(ry);
      const cx = Math.cos(rx);
      const sx = Math.sin(rx);
      const scale = Math.min(w, h) * (ph === "brain" || ph === "score" ? 0.34 : 0.3);
      const breathe = ph === "score" ? 1 + Math.sin(t * 3) * 0.025 : 1 + Math.sin(t * 1.4) * 0.012;
      const ox = w / 2;
      const oy = h / 2;

      for (let i = 0; i < N; i++) {
        let [x, y, z] = cur[i];
        // rotate Y then X
        const x1 = x * cy + z * sy;
        const z1 = -x * sy + z * cy;
        const y1 = y * cx - z1 * sx;
        const z2 = y * sx + z1 * cx;
        x = x1;
        y = y1;
        z = z2;
        const persp = 3.2 / (3.2 - Math.min(z, 2.2));
        proj[i * 3] = ox + x * scale * persp * breathe;
        proj[i * 3 + 1] = oy - y * scale * persp * breathe;
        proj[i * 3 + 2] = z;
      }

      // orbit rings while assembling / rendering
      if (ph === "assemble" || ph === "render") {
        ctx.save();
        ctx.translate(ox, oy);
        for (let r = 0; r < 3; r++) {
          ctx.save();
          ctx.rotate(t * (0.3 + r * 0.17) * (r % 2 ? -1 : 1) + r);
          ctx.strokeStyle = `rgba(47,107,255,${0.16 - r * 0.04})`;
          ctx.lineWidth = 1.2 * dpr;
          ctx.setLineDash([2 * dpr, 7 * dpr]);
          ctx.beginPath();
          ctx.ellipse(0, 0, scale * (1.35 + r * 0.18), scale * (0.42 + r * 0.1), 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        ctx.restore();
      }

      // scan band for the render phase
      const band = ph === "render" ? Math.sin(t * 2.2) * 0.95 : 99;

      // synapse edges in brain phases
      if (ph === "brain" || ph === "score") {
        const vis = Math.min(1, sincePhase / 1.2);
        ctx.lineWidth = 0.7 * dpr;
        for (const [a, b] of edges) {
          const za = proj[a * 3 + 2];
          const al = (0.05 + (za + 1) * 0.05) * vis;
          ctx.strokeStyle = `rgba(47,107,255,${al})`;
          ctx.beginPath();
          ctx.moveTo(proj[a * 3], proj[a * 3 + 1]);
          ctx.lineTo(proj[b * 3], proj[b * 3 + 1]);
          ctx.stroke();
        }
        // spawn firing pulses
        const rate = ph === "score" ? 7 : 4;
        for (let k = 0; k < rate; k++) {
          if (Math.random() < 0.5) {
            const long = Math.random() < 0.18;
            pulses.push({ e: Math.floor(Math.random() * (long ? links.length : edges.length)), t0: t, long });
          }
        }
      }

      // ---------------- HUD: tick ring, rotating arcs, readouts ----------------
      {
        const R = scale * 1.62;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(t * 0.05);
        for (let i = 0; i < 180; i++) {
          const a = (i / 180) * Math.PI * 2;
          const long = i % 15 === 0;
          const len = (long ? 12 : 5) * dpr;
          ctx.strokeStyle = `rgba(47,107,255,${long ? 0.35 : 0.14})`;
          ctx.lineWidth = dpr;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * R, Math.sin(a) * R);
          ctx.lineTo(Math.cos(a) * (R - len), Math.sin(a) * (R - len));
          ctx.stroke();
        }
        ctx.restore();
        const arcs: [number, number, number, number][] = [
          [1.5, 0.8, 0.55, 0.4],
          [1.72, -0.5, 0.35, 0.25],
          [1.8, 0.3, 0.9, 0.18],
        ];
        arcs.forEach(([rr, sp, len, al], i) => {
          const a0 = t * sp + i * 2.1;
          ctx.strokeStyle = `rgba(56,212,255,${al})`;
          ctx.lineWidth = (i === 0 ? 2.2 : 1.4) * dpr;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.arc(ox, oy, scale * rr, a0, a0 + len * Math.PI);
          ctx.stroke();
          ctx.fillStyle = "rgba(56,212,255,.9)";
          ctx.beginPath();
          ctx.arc(ox + Math.cos(a0 + len * Math.PI) * scale * rr, oy + Math.sin(a0 + len * Math.PI) * scale * rr, 2.6 * dpr, 0, Math.PI * 2);
          ctx.fill();
        });
        // readouts on the ring
        ctx.font = `${10 * dpr}px ${font}`;
        ctx.fillStyle = "rgba(10,11,13,.42)";
        ctx.textAlign = "center";
        const reads =
          ph === "assemble"
            ? ["SYNC " + (90 + Math.sin(t) * 8).toFixed(1), "NODES " + Math.min(N, Math.floor(sincePhase * 900)), "GRID 1080×1920", "FPS 60"]
            : ph === "render"
              ? ["FRAME " + String(Math.floor(t * 30) % 300).padStart(3, "0"), "PASS " + (1 + (Math.floor(t * 2) % 4)) + "/4", "BLUR 0.4", "AUDIO 108BPM"]
              : ph === "brain"
                ? ["CANDIDATES " + Math.floor(sincePhase * 140), "TOKENS " + Math.floor(sincePhase * 2400), "PLATFORMS 5", "HASHTAGS " + Math.floor(sincePhase * 37)]
                : ["MODEL v2.6", "CONF " + (0.82 + Math.sin(t) * 0.04).toFixed(2), "RETENTION ↑", "SCORE " + Math.round(scoreRef.current * Math.min(1, sincePhase / 1.6))];
        reads.forEach((txt, i) => {
          const a = -Math.PI / 2 + (i / reads.length) * Math.PI * 2 + Math.PI / 4;
          ctx.fillText(txt, ox + Math.cos(a) * scale * 1.9, oy + Math.sin(a) * scale * 1.9);
        });
      }

      // ---------------- render: satellites beaming into the sphere ----------------
      if (ph === "render") {
        for (let i = 0; i < 6; i++) {
          const a = t * (0.6 + i * 0.08) + i;
          const tilt = 0.35 + i * 0.12;
          const sx = ox + Math.cos(a) * scale * 1.32;
          const sy = oy + Math.sin(a) * scale * 1.32 * tilt;
          const firing = Math.sin(t * 3 + i * 1.7) > 0.4;
          if (firing) {
            const g = ctx.createLinearGradient(sx, sy, ox, oy);
            g.addColorStop(0, "rgba(56,212,255,.7)");
            g.addColorStop(1, "rgba(56,212,255,0)");
            ctx.strokeStyle = g;
            ctx.lineWidth = 1.4 * dpr;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(ox + (sx - ox) * 0.45, oy + (sy - oy) * 0.45);
            ctx.stroke();
          }
          ctx.fillStyle = firing ? "#38d4ff" : "rgba(47,107,255,.6)";
          ctx.beginPath();
          ctx.arc(sx, sy, (firing ? 4.2 : 3) * dpr, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(47,107,255,.25)";
          ctx.lineWidth = dpr;
          ctx.strokeRect(sx - 7 * dpr, sy - 7 * dpr, 14 * dpr, 14 * dpr);
        }
      }

      // ---------------- score: shockwaves + gauge ----------------
      if (ph === "score") {
        for (let k = 0; k < 3; k++) {
          const u = ((t * 0.7 + k / 3) % 1);
          ctx.strokeStyle = `rgba(56,212,255,${0.35 * (1 - u)})`;
          ctx.lineWidth = 2 * dpr;
          ctx.beginPath();
          ctx.arc(ox, oy, scale * (0.9 + u * 0.9), 0, Math.PI * 2);
          ctx.stroke();
        }
        const fillK = Math.min(1, sincePhase / 1.6) * (scoreRef.current / 100);
        ctx.lineCap = "round";
        ctx.strokeStyle = "rgba(10,11,13,.06)";
        ctx.lineWidth = 6 * dpr;
        ctx.beginPath();
        ctx.arc(ox, oy, scale * 1.42, Math.PI * 0.75, Math.PI * 2.25);
        ctx.stroke();
        const gg = ctx.createLinearGradient(ox - scale, 0, ox + scale, 0);
        gg.addColorStop(0, "#2f6bff");
        gg.addColorStop(1, "#38d4ff");
        ctx.strokeStyle = gg;
        ctx.shadowColor = "rgba(56,212,255,.6)";
        ctx.shadowBlur = 16 * dpr;
        ctx.beginPath();
        ctx.arc(ox, oy, scale * 1.42, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 1.5 * fillK);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // points
      for (let i = 0; i < N; i++) {
        const px = proj[i * 3];
        const py = proj[i * 3 + 1];
        const z = proj[i * 3 + 2];
        const depth = Math.min(1, Math.max(0, (z + 1.3) / 2.6));
        let r = (0.7 + depth * 1.5) * dpr;
        let alpha = 0.18 + depth * 0.75;
        let col = "47,107,255";
        if (ph === "render") {
          const d = Math.abs(cur[i][1] - band);
          if (d < 0.08) {
            col = "56,212,255";
            r *= 1.8;
            alpha = Math.min(1, alpha + 0.4);
          }
        }
        if (ph === "assemble" && i % 13 === 0) col = "56,212,255";
        if ((ph === "brain" || ph === "score") && i % 17 === 0) {
          col = "56,212,255";
          alpha *= 0.9 + 0.3 * Math.sin(t * 6 + i);
        }
        if (ph === "assemble" && sincePhase < 2.5 && prev[i * 2]) {
          ctx.strokeStyle = `rgba(${col},${alpha * 0.35})`;
          ctx.lineWidth = r * 0.8;
          ctx.beginPath();
          ctx.moveTo(prev[i * 2], prev[i * 2 + 1]);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
        prev[i * 2] = px;
        prev[i * 2 + 1] = py;
        ctx.fillStyle = `rgba(${col},${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.3, r), 0, Math.PI * 2);
        ctx.fill();
      }

      // ---------------- brain: labelled regions that light up in turn ----------------
      if (ph === "brain" || ph === "score") {
        const vis = Math.min(1, sincePhase / 1.0);
        const hot = Math.floor(t * 1.2) % REGIONS.length;
        REGIONS.forEach((reg, i) => {
          let [x, y, z] = reg.at;
          const x1 = x * cy + z * sy;
          const z1 = -x * sy + z * cy;
          const y1 = y * cx - z1 * sx;
          const z2 = y * sx + z1 * cx;
          x = x1;
          y = y1;
          z = z2;
          const persp = 3.2 / (3.2 - Math.min(z, 2.2));
          const ax = ox + x * scale * persp * breathe;
          const ay = oy - y * scale * persp * breathe;
          // label on whichever side its region faces, level with it — leader lines never cross the brain
          const right = ax >= ox;
          const lx = ox + (right ? 1 : -1) * scale * 1.22;
          const ly = Math.max(oy - scale * 0.95, Math.min(oy + scale * 0.95, ay));
          const on = i === hot || ph === "score";
          ctx.globalAlpha = vis * (z > -0.3 || on ? 1 : 0.45);
          // anchor glow
          const ag = ctx.createRadialGradient(ax, ay, 0, ax, ay, (on ? 26 : 12) * dpr);
          ag.addColorStop(0, on ? "rgba(56,212,255,.75)" : "rgba(47,107,255,.35)");
          ag.addColorStop(1, "rgba(56,212,255,0)");
          ctx.fillStyle = ag;
          ctx.beginPath();
          ctx.arc(ax, ay, (on ? 26 : 12) * dpr, 0, Math.PI * 2);
          ctx.fill();
          // leader line with an elbow
          ctx.strokeStyle = on ? "rgba(47,107,255,.85)" : "rgba(47,107,255,.25)";
          ctx.lineWidth = dpr;
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(lx + (right ? -18 : 18) * dpr, ly);
          ctx.lineTo(lx, ly);
          ctx.stroke();
          // label
          const val = Math.round(valuesRef.current[i] * Math.min(1, sincePhase / 2));
          ctx.font = `600 ${11 * dpr}px ${font}`;
          ctx.textAlign = right ? "left" : "right";
          ctx.fillStyle = on ? "#2f6bff" : "rgba(10,11,13,.45)";
          ctx.fillText(reg.label, lx + (right ? 6 : -6) * dpr, ly - 3 * dpr);
          ctx.font = `${10 * dpr}px ${font}`;
          ctx.fillStyle = "rgba(10,11,13,.4)";
          ctx.fillText(String(val).padStart(2, "0") + "%", lx + (right ? 6 : -6) * dpr, ly + 11 * dpr);
          ctx.globalAlpha = 1;
          // the hot region fires extra signals from its anchor
          if (on && Math.random() < 0.35) {
            let best = 0;
            let bd = 1e9;
            for (let k = 0; k < 40; k++) {
              const e = Math.floor(Math.random() * edges.length);
              const a2 = edges[e][0];
              const d = Math.hypot(proj[a2 * 3] - ax, proj[a2 * 3 + 1] - ay);
              if (d < bd) {
                bd = d;
                best = e;
              }
            }
            pulses.push({ e: best, t0: t, long: false });
          }
        });
      }

      // pulses travel along edges with a glowing head
      for (let k = pulses.length - 1; k >= 0; k--) {
        const pu = pulses[k];
        const life = pu.long ? 0.9 : 0.45;
        const u = (t - pu.t0) / life;
        if (u >= 1) {
          pulses.splice(k, 1);
          continue;
        }
        const [a, b] = pu.long ? links[pu.e] : edges[pu.e];
        const x = proj[a * 3] + (proj[b * 3] - proj[a * 3]) * u;
        const y = proj[a * 3 + 1] + (proj[b * 3 + 1] - proj[a * 3 + 1]) * u;
        if (pu.long) {
          ctx.strokeStyle = `rgba(56,212,255,${0.35 * (1 - u)})`;
          ctx.lineWidth = 1 * dpr;
          ctx.beginPath();
          ctx.moveTo(proj[a * 3], proj[a * 3 + 1]);
          ctx.quadraticCurveTo(ox + (x - ox) * 0.6, oy + (y - oy) * 0.6, x, y);
          ctx.stroke();
        }
        const g = ctx.createRadialGradient(x, y, 0, x, y, 6 * dpr);
        g.addColorStop(0, `rgba(255,255,255,${1 - u})`);
        g.addColorStop(0.3, `rgba(56,212,255,${0.9 * (1 - u)})`);
        g.addColorStop(1, "rgba(56,212,255,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, 6 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
      if (pulses.length > 400) pulses.splice(0, pulses.length - 400);

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return <canvas ref={ref} className={className} style={{ width: "100%", height: "100%", display: "block" }} />;
}
