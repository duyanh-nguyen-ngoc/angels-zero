# ANGELS ZERO — sound effect credits

Every file here is a trimmed / loop-crossfaded / mixed / re-encoded (mono MP3,
32 kHz) derivative of a freely licensed recording. `src/audio.js` decodes them
with `decodeAudioData` and falls back to procedural DSP if any file is missing.

| File | Source recording(s) | Author | License |
| --- | --- | --- | --- |
| `airframe_buffet.mp3` | [wind whoosh loop](https://opengameart.org/content/wind-whoosh-loop) (low-passed) | SketchMan3 | CC0 |
| `gloc_breathing_heartbeat.mp3` | [Breathing Tired](https://opengameart.org/content/breathing-tired) mixed over the fast loop of [Heartbeat sounds](https://opengameart.org/content/heartbeat-sounds) (low-passed) | mikeask; bart | CC0; CC0 |
| `gloc_warning_chime.mp3` | [Short alarm](https://opengameart.org/content/short-alarm) (trimmed to 1.5 s) | yd | CC0 |
| `f15/*.wav` (58 files) | [FlightGear F-15 Sounds](https://github.com/Zaretto/fg-aircraft/tree/master/aircraft/F-15/Sounds) (complete 58-file bank compiled to 22.05 kHz mono normalized WAVs: F100 whine/exhaust/efflux/intake/AB, wind/airbrake/flaps/stall buffet, JFS/GPU/canopy, Betty VMS, 900 Hz OWS/departure/AoA/115 Hz tones, incoming missile 1-12 clock callouts, M61A1, AIM-9 launch/explosion, strike, flare/flareOut, gear, ground rattle, tyre squeal/sideslip) | Richard Harrison / FlightGear | GPL-2.0 |

The F100 engine sound is synthesized in `src/audio.js` and layered with the compiled FlightGear F-15C propulsion, weapon, and cockpit system samples in `assets/sfx/f15/` (falling back to procedural DSP if any file fails to load).
