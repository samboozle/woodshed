import Vex from 'vexflow';
import _ from 'lodash';
import theKeys from '../music-logic/theKeys';

const { Accidental, Beam, Formatter, Renderer, Stave, StaveNote, Voice } = Vex.Flow;

export default (noodle, windowWidth, windowHeight) => {

  // Boilerplate
  let canvasWidth = Math.max(windowWidth * 0.75, 500);
  let canvasHeight = Math.max(windowHeight * 0.75, 500);

  let vexDiv = document.getElementById("score");
  let renderer = new Renderer(vexDiv, Renderer.Backends.SVG);
  renderer.resize(canvasWidth, canvasHeight);
  let context = renderer.getContext();
  let formatter = new Formatter();

  // rendering logic begins
  let { clefs, /* ties */ } = noodle;
  let measures = noodle.measures.reduce(simplifyMeasures, []);
  let x = 0;
  let y = 0;

  //
  measures.forEach((m, i) => {
    let { beats, keySig, timeSig, clefChange, keyChange, timeChange } = m;

    let beatValue = +_.last(timeSig.split("/"));

    
    console.log(_.maxBy(m.voices, voice => voice.length).length * 80)

    let width = Math.min(
      Math.ceil(beats) * 50,
      _.maxBy(m.voices, voice => voice.length ).length * 80
    );

    if (width + x > canvasWidth) {
      x = 0;
      y += (clefs.length === 2 ? 200 : 100);
    }

    if (i === 0) { 
      width += 80;
    } else if (x === 0) {
      width += 60;
    }

    // max staves is 2
    if (clefs.length === 2) {
      // todo -> support two-stave stuff
      let [one, two] = clefs;

    } else if (clefs.length === 1) {
      let clef = clefs[0];
      let stave = new Stave(x, y, width);

      // time signatures only appear at the start and on change;
      // clefs and key signatures only appear on change and at the starts of lines;
      if (clefChange || x === 0) { stave.addClef(clef) };
      if (keyChange || x === 0) { stave.addKeySignature(keySig); }
      if (timeChange) { stave.addTimeSignature(timeSig); }

      stave.setContext(context).draw();

      let voices = m.voices.map(voice => {
        let notes = renderNotes(voice, keySig);
        // let beams = Beam.generateBeams(notes);
        
        // Formatter.FormatAndDraw(context, stave, notes);
        // beams.forEach(beam => { beam.setContext(context).draw(); });

        return new Voice({num_beats: beats, beat_value: beatValue})
          .addTickables(notes);
      })

      // voiceNotes.forEach(notes => {
      //   let beams = Beam.generateBeams(notes);
      //   Formatter.FormatAndDraw(context, stave, notes);
      // })


      formatter.joinVoices(voices).format(voices, width - 80);
      Formatter.FormatAndDraw(context, stave, voices);
      // voices.forEach(voice => { voice.draw(context, stave) });


      // let notes = renderNotes(m.notes, keySig);
      // let beams = Beam.generateBeams(notes);
  
    }

    x += width;
  })
}

const renderNotes = (notes, keySig) => {
  return notes.map(({ clef, keys, duration }) => {
    let note = new StaveNote({ clef, keys, duration });
    keys.forEach((key, i) => {
      let k = key.split("/")[0];
      if (isAccidental(k, keySig)) { 
        let accid = k.slice(1);
        console.log(accid)
        note.addAccidental(i, new Accidental(accid));
      }
    })
    if (duration.endsWith("d")) { note.addDotToAll(); }

    return note;
  })
}

const simplifyMeasures = (acc, measure) => {

  if (acc.length === 0) {
    measure.timeChange = true;
    return [ measure ];
  }

  let lastMeasure = _.last(acc);

  if (lastMeasure.timeSig !== measure.timeSig) {
    measure.timeChange = true;
  }

  if (lastMeasure.keySig !== measure.keySig) {
    measure.keyChange = true;
  }

  if (lastMeasure.clef !== measure.clef) {
    measure.clefChange = true;
  }

  return [...acc, measure];

}

const isAccidental = (pitch, key) => !theKeys[key].includes(pitch);