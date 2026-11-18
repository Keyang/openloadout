#!/usr/bin/env python3
"""Writes sounds/battle-theme.json. The piece is easier to read here, bar by bar, than as raw JSON:
8 bars in D minor, one 16th-note clock, chords Dm Dm Bb C | Dm Dm Bb A."""
import json, os

def P(id, label, mn, mx, d, unit=None, scale=None, step=None, options=None):
    p = {"id": id, "label": label, "min": mn, "max": mx, "default": d}
    if unit: p["unit"] = unit
    if scale: p["scale"] = scale
    if step: p["step"] = step
    if options: p["options"] = options
    return p

# The melody can be played by any of these. Index = value of the "inst" parameter.
INSTRUMENTS = ["Synth lead", "Flute", "Chiptune", "Bell", "Plucked string"]
# Level of each instrument, set by measurement so that all five are about as loud as the synth lead.
GAIN = [1, 0.8, 1, 1, 1.7]

# Lead melody: semitones above D5, one token per 16th ("_" = hold), with its gate row.
LEAD = [
    ("0 _ _ 0 _ _ 3 _ 7 _ _ _ 5 _ 3 _",       "X..x..x.X...x.x."),  # Dm   D  D  F  A     G  F
    ("2 _ _ 3 _ _ 0 _ _ _ _ _ _ _ -5 _",      "X..x..X.......x."),  # Dm   E  F  D           A,
    ("-4 _ _ 0 _ _ 3 _ 8 _ _ _ 7 _ 5 _",      "X..x..x.X...x.x."),  # Bb   Bb D  F  Bb    A  G
    ("5 _ _ 2 _ _ -2 _ 2 _ _ _ 5 _ _ _",      "X..x..x.x...X..."),  # C    G  E  C  E     G
    ("7 _ _ 7 _ _ 12 _ 10 _ _ _ 7 _ 3 _",     "X..x..X.x...x.x."),  # Dm   A  A  D' C'    A  F
    ("5 _ _ 7 _ _ 3 _ _ _ _ _ 0 _ 3 _",       "X..x..X.....x.x."),  # Dm   G  A  F        D  F
    ("8 _ _ 7 _ _ 5 _ 3 _ _ _ 5 _ 7 _",       "X..x..x.x...x.x."),  # Bb   Bb A  G  F     G  A
    ("2 _ _ _ -1 _ _ _ 2 _ 7 _ 11 _ 14 _",    "X...x...x.x.x.X."),  # A    E  C# E  A  C#' E'  (pulls back to D)
]
SNARE = ["....X.......X..."] * 3 + ["....X.......X.xx"] + ["....X.......X..."] * 3 + ["....X...x.x.XxXX"]

nodes = [
    # --- time and harmony
    {"id": "c16", "type": "clock", "rate": "bpm/60*4"},
    {"id": "root", "type": "seq", "trig": "c16", "every": 16, "loop": True, "steps": "0 0 -4 -2 | 0 0 -4 -5"},
    {"id": "third", "type": "seq", "trig": "c16", "every": 16, "loop": True, "steps": "3 3 4 4 | 3 3 4 4"},
    {"id": "tr", "type": "expr", "expr": "round(key) + root"},
    # --- arrangement: the piece is 1 to 4 sections of 8 bars ("bars" parameter). rev counts the sections
    #     still to come: the last section is the full band, the one before drops the melody, the one before
    #     that also drops the brass, and the opening of a 32-bar piece has no kick or snare.
    #     With bars = 8 there is only the last section, so the piece is the original eight bars.
    {"id": "barN", "type": "seq", "trig": "c16", "every": 16, "loop": True, "steps": " ".join(str(i) for i in range(96))},
    {"id": "rev", "type": "expr", "expr": "round(bars/8) - 1 - floor((barN % (round(bars/8)*8)) / 8)"},
    {"id": "aLd", "type": "lag", "in": "rev < 0.5 ? 1 : 0", "time": 0.02},
    {"id": "aSt", "type": "lag", "in": "rev < 1.5 ? 1 : 0", "time": 0.02},
    {"id": "aDr", "type": "lag", "in": "rev < 2.5 ? 1 : 0", "time": 0.02},
    # --- how much of each layer the intensity lets through
    {"id": "gDr", "type": "expr", "expr": "smooth(0.1, 0.3, intensity) * aDr"},
    {"id": "gArp", "type": "expr", "expr": "0.35 + 0.65*smooth(0.25, 0.5, intensity)"},
    {"id": "gSt", "type": "expr", "expr": "smooth(0.4, 0.6, intensity) * aSt"},
    {"id": "gLd", "type": "expr", "expr": "smooth(0.65, 0.85, intensity) * lead * aLd"},
    # --- kick: four on the floor, double-time above 80% intensity
    {"id": "kLo", "type": "pattern", "trig": "c16", "steps": "X...x...X...x...|X...x...X...x.x."},
    {"id": "kHi", "type": "pattern", "trig": "c16", "steps": "X.x.x.x.X.x.x.x.|X.x.x.x.X.x.xxxx"},
    {"id": "kT", "type": "expr", "expr": "intensity > 0.8 ? kHi : kLo"},
    {"id": "kP", "type": "env", "trig": "kT", "points": [[0, 170], [0.07, 48, "exp"]]},
    {"id": "kO", "type": "osc", "freq": "kP"},
    {"id": "kA", "type": "ad", "trig": "kT", "attack": 0.001, "decay": 0.16, "curve": 2},
    # --- snare, hats, crash share one noise source
    {"id": "nz", "type": "noise"},
    {"id": "sT", "type": "pattern", "trig": "c16", "steps": "|".join(SNARE)},
    {"id": "sA", "type": "ad", "trig": "sT", "attack": 0.001, "decay": 0.14, "curve": 2.2},
    {"id": "sN", "type": "filter", "mode": "bp", "in": "nz", "freq": 2200, "q": 0.7},
    {"id": "sP", "type": "env", "trig": "sT", "points": [[0, 260], [0.05, 180, "exp"]]},
    {"id": "sO", "type": "osc", "wave": "tri", "freq": "sP"},
    {"id": "hT", "type": "pattern", "trig": "c16", "steps": "X.xoX.xoX.xoX.xo|X.xoX.xoX.xoXoxx"},
    {"id": "hV", "type": "sah", "in": "hT", "trig": "hT"},
    {"id": "hA", "type": "ad", "trig": "hT", "attack": 0.0005, "decay": 0.035, "curve": 2},
    {"id": "hN", "type": "filter", "mode": "hp", "in": "nz", "freq": "6500 + bright*2500", "q": 0.8},
    {"id": "cT", "type": "pattern", "trig": "c16", "every": 16, "steps": "x...x..."},
    {"id": "cA", "type": "ad", "trig": "cT", "attack": 0.002, "decay": 1.4, "curve": 3},
    {"id": "cN", "type": "filter", "mode": "hp", "in": "nz", "freq": 4500},
    # --- bass: galloping 16ths on the chord root
    {"id": "bG", "type": "pattern", "trig": "c16", "steps": "X.xxx.xxX.xxx.xx"},
    {"id": "bS", "type": "seq", "trig": "c16", "loop": True, "steps": "0 0 0 12 0 0 0 12 | 0 0 0 12 0 0 12 7"},
    {"id": "bF", "type": "expr", "expr": "midi(38 + tr + bS)"},
    {"id": "bO1", "type": "osc", "wave": "saw", "freq": "bF"},
    {"id": "bO2", "type": "osc", "wave": "square", "freq": "bF*1.005"},
    {"id": "bA", "type": "ad", "trig": "bG", "attack": 0.002, "decay": 0.13, "curve": 1.5},
    {"id": "bL", "type": "filter", "mode": "lp", "in": "bO1*0.6 + bO2*0.4", "freq": "180 + bA*(900 + bright*2200)", "q": 2.2},
    {"id": "bD", "type": "shaper", "in": "bL*bA", "drive": "1.5 + grit*5"},
    # --- string ostinato: 16th-note arpeggio through the chord tones, detuned left/right
    {"id": "aD", "type": "seq", "trig": "c16", "loop": True, "steps": "0 1 2 3 2 1 2 3 | 0 1 2 3 4 3 2 1"},
    {"id": "aS", "type": "expr", "expr": "aD < 0.5 ? 0 : aD < 1.5 ? third : aD < 2.5 ? 7 : aD < 3.5 ? 12 : 12 + third"},
    {"id": "aF", "type": "expr", "expr": "midi(62 + tr + aS)"},
    {"id": "aA", "type": "ad", "trig": "c16", "attack": 0.003, "decay": 0.11, "curve": 1.6},
    {"id": "aO1", "type": "osc", "wave": "saw", "freq": "aF"},
    {"id": "aO2", "type": "osc", "wave": "saw", "freq": "aF*1.007"},
    {"id": "aL", "type": "filter", "mode": "lp", "in": "aO1*aA", "freq": "900 + bright*3500 + aA*1500", "q": 1.2},
    {"id": "aR", "type": "filter", "mode": "lp", "in": "aO2*aA", "freq": "900 + bright*3500 + aA*1500", "q": 1.2},
    # --- brass stabs: the full chord, syncopated; third on the left, fifth on the right
    {"id": "stT", "type": "pattern", "trig": "c16", "steps": "X..x..x...x.x...|X..x..x...x.x.x."},
    {"id": "stA", "type": "ad", "trig": "stT", "attack": 0.004, "hold": 0.03, "decay": 0.16, "curve": 1.5},
    {"id": "stO1", "type": "osc", "wave": "saw", "freq": "midi(50 + tr)"},
    {"id": "stO2", "type": "osc", "wave": "saw", "freq": "midi(50 + tr + third)"},
    {"id": "stO3", "type": "osc", "wave": "saw", "freq": "midi(57 + tr)"},
    {"id": "stO4", "type": "osc", "wave": "saw", "freq": "midi(62 + tr)*1.006"},
    {"id": "stL", "type": "filter", "mode": "lp", "in": "(stO1*0.5 + stO2*0.6 + stO4*0.35)*stA", "freq": "500 + stA*(1500 + bright*4000)", "q": 1.5},
    {"id": "stR", "type": "filter", "mode": "lp", "in": "(stO1*0.5 + stO3*0.6 + stO4*0.35)*stA", "freq": "500 + stA*(1500 + bright*4000)", "q": 1.5},
    # --- lead melody with vibrato and a dotted-eighth echo on the right
    {"id": "lG", "type": "pattern", "trig": "c16", "steps": "|".join(g for _, g in LEAD)},
    {"id": "lS", "type": "seq", "trig": "c16", "loop": True, "steps": " | ".join(n for n, _ in LEAD)},
    {"id": "lP", "type": "lag", "in": "midi(74 + round(key) + lS)", "time": 0.012},
    {"id": "vib", "type": "osc", "freq": 5.8},
    {"id": "lA", "type": "ad", "trig": "lG", "attack": 0.006, "hold": 0.12, "decay": 0.35, "curve": 1.4},
    # the melody instruments: all play the same notes (lP) on the same gate (lG); "inst" picks one
    # 0 synth lead: saw + pulse, slightly detuned
    {"id": "lO1", "type": "osc", "wave": "saw", "freq": "lP*(1 + vib*0.006)"},
    {"id": "lO2", "type": "osc", "wave": "pulse", "width": 0.3, "freq": "lP*1.004*(1 + vib*0.006)"},
    # 1 flute: sine with a little octave and a breath of noise, slow attack, more vibrato
    {"id": "fA", "type": "ad", "trig": "lG", "attack": 0.035, "hold": 0.12, "decay": 0.3, "curve": 1.3},
    {"id": "fO1", "type": "osc", "freq": "lP*(1 + vib*0.009)"},
    {"id": "fO2", "type": "osc", "wave": "tri", "freq": "lP*2*(1 + vib*0.009)"},
    {"id": "fN", "type": "filter", "mode": "bp", "in": "nz", "freq": "lP*2", "q": 3},
    # 2 chiptune: thin pulse with an octave square, no vibrato, short notes
    {"id": "cA2", "type": "ad", "trig": "lG", "attack": 0.002, "hold": 0.09, "decay": 0.16, "curve": 1.2},
    {"id": "cO1", "type": "osc", "wave": "pulse", "width": 0.25, "freq": "lP"},
    {"id": "cO2", "type": "osc", "wave": "square", "freq": "lP*2"},
    # 3 bell: a sine whose phase is pushed by a faster sine (FM); the push fades faster than the note
    {"id": "beA", "type": "ad", "trig": "lG", "attack": 0.001, "decay": 0.75, "curve": 2.6},
    {"id": "beI", "type": "ad", "trig": "lG", "attack": 0.001, "decay": 0.3, "curve": 2},
    {"id": "beM", "type": "osc", "freq": "lP*3.5"},
    {"id": "beC", "type": "osc", "freq": "lP", "pm": "beM*beI*0.45"},
    # 4 plucked string
    {"id": "plS", "type": "pluck", "trig": "lG", "freq": "lP", "decay": 2.2, "damp": "0.22 - bright*0.15"},
    {"id": "lIn", "type": "expr", "expr": f"inst < 0.5 ? (lO1*0.6 + lO2*0.5)*lA : inst < 1.5 ? (fO1 + fO2*0.18 + fN*0.5)*fA*{GAIN[1]} : inst < 2.5 ? (cO1*0.6 + cO2*0.22)*cA2*{GAIN[2]} : inst < 3.5 ? beC*beA*{GAIN[3]} : plS*{GAIN[4]}"},
    {"id": "lF", "type": "filter", "mode": "lp", "in": "lIn", "freq": "1200 + bright*4500 + lA*1500", "q": 1.3},
    {"id": "lE", "type": "delay", "in": "lF", "time": "60/bpm*0.75", "feedback": 0.35, "mix": 0.3, "max": 0.6},
    # --- mix: drums in the centre, the kick ducks the music, one shared reverb
    {"id": "duck", "type": "expr", "expr": "1 - kA*0.35"},
    {"id": "dr", "type": "expr", "expr": "kO*kA*(0.5 + 0.2*gDr)*aDr + (sN*1.6 + sO*0.5)*sA*0.8*gDr + hN*hA*hV*0.6 + cN*cA*0.25*gSt"},
    {"id": "muL", "type": "expr", "expr": "(aL*0.6*gArp + stL*0.6*gSt + lF*0.85*gLd)*duck"},
    {"id": "muR", "type": "expr", "expr": "(aR*0.6*gArp + stR*0.6*gSt + lE*0.85*gLd)*duck"},
    {"id": "rv", "type": "reverb", "in": "(muL + muR)*0.5 + (sN*sA*0.5 + cN*cA*0.2)*gDr", "size": 0.75, "damp": 0.35, "mix": 1},
    {"id": "mL", "type": "shaper", "in": "(dr + bD*0.34 + muL + rv*space*2)*0.7", "drive": "1 + grit*0.8"},
    {"id": "mR", "type": "shaper", "in": "(dr + bD*0.34 + muR + rv*space*2)*0.7", "drive": "1 + grit*0.8"},
]

patch = {
    "format": "sfxpatch/0.1", "id": "battle-theme", "name": "Battle theme", "category": "music",
    "tags": ["music", "boss", "combat", "adaptive", "loop"],
    "description": "Fast D-minor battle music, 8 to 32 bars long. Intensity brings in the snare, the brass stabs, then the melody and double-time kick, so a game can drive it live. Longer versions build up section by section, and the melody can be played by five instruments.",
    "loop": True, "wrap": True, "normalize": False, "gain": 0.85,
    "duration": "round(bars/8)*8*4*60/bpm",
    "params": [
        P("intensity", "Intensity", 0, 1, 0.9),
        P("bpm", "Tempo", 130, 190, 160, "bpm"),
        P("key", "Key", -5, 6, 0, "semitones"),
        P("bright", "Brightness", 0, 1, 0.6),
        P("grit", "Grit", 0, 1, 0.4),
        P("lead", "Melody", 0, 1, 0.8),
        P("inst", "Melody instrument", 0, len(INSTRUMENTS) - 1, 0, options=INSTRUMENTS),
        P("bars", "Length", 8, 32, 8, "bars", step=8),
        P("space", "Room", 0, 0.5, 0.2),
    ],
    "nodes": nodes,
    "out": ["mL", "mR"],
    "presets": {
        "Stalking": {"intensity": 0.15, "bpm": 140, "bright": 0.3, "grit": 0.2},
        "Skirmish": {"intensity": 0.55, "bpm": 156},
        "Boss fight": {"intensity": 1, "bpm": 172, "bright": 0.8, "grit": 0.7},
        "Final phase": {"intensity": 1, "bpm": 186, "key": 2, "bright": 0.9, "grit": 0.9},
    },
}
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "sounds", "battle-theme.json")
json.dump(patch, open(out, "w"), indent=1)
print("wrote", os.path.normpath(out), "-", len(nodes), "nodes,", len(json.dumps(patch)), "bytes")
