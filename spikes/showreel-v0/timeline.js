// MASTER TIMELINE — single source of truth shared by the visuals (scenes/*.js) and the audio score.
// All times are GLOBAL seconds on a 0..15 clock. Change here, both picture and sound follow.
const TIMELINE = {
  duration: 15,
  fps: 60,

  // Scene windows (they overlap on purpose: the overlap IS the transition).
  scenes: {
    s1: { start: 0.0,  end: 3.0,  name: 'Ignition'  }, // terminal types the npx command, ENTER, zoom-through
    s2: { start: 2.6,  end: 6.0,  name: 'Wizard'    }, // role -> project -> stack picks, flow graph, converge
    s3: { start: 5.6,  end: 9.2,  name: 'Install'   }, // the repo grows: slabs stack, file tree, counters
    s4: { start: 8.9,  end: 12.2, name: 'Army'      }, // agents orbit a brain-core, packets zip, memory network
    s5: { start: 11.9, end: 15.0, name: 'Lockup'    }, // ÉN NAM / SCAFFOLD logo lockup, tagline, command pill
  },

  // Typing of the command in S1 (30 chars incl. the "$ " prompt is NOT counted).
  typing: { text: 'npx @ennamjsc/agents-scaffold', start: 0.45, interval: 0.052, enterAt: 2.30 },

  // Impact moments. amp 0..1 drives camera shake, chromatic aberration, bloom pulse AND the audio hit.
  // kind tells the sound designer what it should sound like.
  hits: [
    { t: 2.30, amp: 1.00, kind: 'boom'  },  // ENTER pressed: shockwave
    { t: 3.20, amp: 0.30, kind: 'snap'  },  // wizard step 1 lock
    { t: 3.90, amp: 0.30, kind: 'snap'  },  // wizard step 2 lock
    { t: 4.60, amp: 0.30, kind: 'snap'  },  // wizard step 3 lock
    { t: 5.75, amp: 0.60, kind: 'sweep' },  // graph converges to a point
    { t: 6.30, amp: 0.50, kind: 'thud'  },  // slab 1 lands
    { t: 6.80, amp: 0.50, kind: 'thud'  },  // slab 2 lands
    { t: 7.30, amp: 0.50, kind: 'thud'  },  // slab 3 lands
    { t: 7.80, amp: 0.50, kind: 'thud'  },  // slab 4 lands
    { t: 8.90, amp: 0.40, kind: 'lock'  },  // counters lock ("0 lines of app code touched")
    { t: 9.30, amp: 0.80, kind: 'ignite'},  // brain core ignites
    { t: 9.60, amp: 0.15, kind: 'pop'   },  // 6 agent badges pop in, 0.15s apart
    { t: 9.75, amp: 0.15, kind: 'pop'   },
    { t: 9.90, amp: 0.15, kind: 'pop'   },
    { t: 10.05, amp: 0.15, kind: 'pop'  },
    { t: 10.20, amp: 0.15, kind: 'pop'  },
    { t: 10.35, amp: 0.15, kind: 'pop'  },
    { t: 12.20, amp: 1.00, kind: 'slam' },  // "ÉN NAM" slams in
    { t: 12.70, amp: 0.50, kind: 'snap' },  // "SCAFFOLD" resolves
    { t: 13.80, amp: 0.35, kind: 'sweep'},  // final light sweep across the lockup
  ],

  // Musical frame: key of F# minor, 120 BPM (one beat = 0.5s) so hits land on/near beats.
  music: { bpm: 120, key: 'F#m' },
};

if (typeof module !== 'undefined') module.exports = TIMELINE; else window.TIMELINE = TIMELINE;
