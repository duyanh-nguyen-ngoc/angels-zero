# Orchestral samples

224 short mono MP3 clips (96 kbps, 44.1 kHz, about 3.8 MB in total) cut from
**Versilian Studios Chamber Orchestra 2 Community Edition** (VSCO-2-CE):
https://github.com/sgossner/VSCO-2-CE. That library is released under **CC0 1.0** (public domain dedication).

For each sampled note, the loudest velocity layer was kept, with one or two round-robins.
Each clip was then trimmed to its attack, cut to the length the score uses, faded out, and normalised per instrument so the notes stay balanced against each other.
`manifest.json` lists each section's clips with their MIDI pitch:
- Pitched sections use the note in the VSCO file name, which is labelled one octave low, so +12 was added; spectral pitch detection confirmed the shift for each group.
- Timpani pitches are measured.

| Folder | Source articulation |
|---|---|
| vln_spic / vla_spic / vc_spic | Violin, viola and cello sections, spiccato |
| vln_sus / vc_sus / vln_trem | Violin and cello sections, sustain with vibrato; violin tremolo |
| cb_spic | Solo contrabass, spiccato |
| hn_stac / hn_sus | French horn, staccato and sustain (no samples between C4 and D5 in the source) |
| tpt_stac / tpt_sus, tbn_stac / tbn_sus, tuba_stac | Trumpet, tenor trombone, tuba |
| timp_hit / timp_roll | Timpani hits and rolls |
| bdrum, snare, cym | Concert bass drum, snare (drum1), crash cymbals plus a soft-mallet suspended roll |
| glock | Glockenspiel |

Rebuild with `scripts/build_orch.py` (usage in its header). `src/orchestra.js` decodes the clips at 32 kHz the first time music is needed, which takes about 33 MB of RAM.
