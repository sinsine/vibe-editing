// The sound design for THIS project.
//
// `build-sfx-map.mjs` loads this file and calls the default export with a set of
// placement helpers bound to the measured track. You describe the sound design here;
// the script handles timing, validation and beat-alignment reporting.
//
// Copy this file to your project root as `sfx-design.mjs` (init-project.mjs does it)
// and edit it. Everything you place must be justified by the picture — the helpers
// encode the four placement physics so you cannot accidentally place a whoosh by feel:
//
//   whoosh(file, atCutTime, gainDb, note)   centred ON a cut (air passes as the shot changes)
//   hit(file, atBeatTime, gainDb, note)     attack ON the beat
//   riser(file, atRevealTime, seconds, gainDb, note)   ENDS on the reveal
//   bed(file, fromTime, toTime, gainDb, note)          long low layer under a span
//
// Inputs you get:
//   frames      cue-map frames: [{ frame, start, end, dur, startBar, endBar, cues }]
//   frame(n)    that entry for frame number n
//   beat(k)     absolute time of beat k on the fitted grid
//   bar(k)      absolute time of bar k
//   beatAt(t)   the beat line nearest to time t
//   barAt(t)    the bar line nearest to time t
//   grid        { bpm, period, offset, barDuration, totalBeats, totalBars }
//   len(file)   the prepped length of a sound, in seconds (so nothing runs past a cut)
//
// The reference implementation for a 161-second film placed 43 cues: 8 whooshes on
// section changes, 1 riser into the climax, 31 hits/ticks/pings on visual accents,
// 3 long beds. Gains ran -32…-10 dB. See references/06-sound.md.
export default function design({ frames, frame, beat, bar, beatAt, barAt, grid, len }) {
  const cues = [];

  // ---------------------------------------------------------------------------
  // Example — replace with your own. This is the shape, not a template to keep.
  // ---------------------------------------------------------------------------
  //
  // // a section change: the whoosh is centred on the cut
  // whoosh('168-fast-air-sweep-transition.wav', frame(4).start, -13, 'F4 时空切换');
  //
  // // the film's biggest moment: a riser that lands exactly on the reveal,
  // // followed by an impact whose attack is on the same beat
  // riser('632-cinematic-drama-riser.wav', frame(22).start, 1.9, -13, 'riser 冲进揭晓');
  // hit('563-drum-deep-impact.wav', frame(22).start, -10, 'F22 揭晓（全片最强重音）');
  //
  // // a tick per rule landing, taken from the frame's own bar lines — never a
  // // guessed pattern, or the last one lands past the end of its own frame
  // {
  //   const f = frame(5);
  //   const b0 = Math.round((f.start - grid.offset) / grid.period);
  //   [b0, b0 + 4, b0 + 7].forEach((k, i) => hit('1061-clock-ticker-single.wav', beat(k), -19, `F5 第${i + 1}条规则`));
  // }
  //
  // // a low bed under a run of frames
  // bed('1237-wind-in-the-forest.wav', frame(4).start, frame(8).end, -30, '麦田风声床');
  // ---------------------------------------------------------------------------

  return { cues, notes: 'edit sfx-design.mjs to design the sound for this project' };
}
