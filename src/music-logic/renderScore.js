import Vex from 'vexflow';
import _ from 'lodash';
import theKeys from './theKeys';

const { Barline, Beam, Factory, Registry, // StaveModifier,
      } = Vex.Flow;

// const { END } = StaveModifier.Position;

// this function was inspired by this test in the VexFlow project on github:
// https://github.com/0xfe/vexflow/blob/master/tests/bach_tests.js

export default (noodle, scale) => {

  // registry allows notes to be marked with unique identifiers for later decoration
  let registry = new Registry();
  Registry.enableDefaultRegistry(registry);
  const retrieve = id => registry.getElementById(id);

  let measures = noodle.measures.reduce(simplifyMeasures(scale), []);

  // instantiate score
  let vex = new Factory({ renderer: { elementId: "score", width: scale * 1024,
                                      height: scale * (_.last(measures).y + (150 * Object.keys(measures[0].staves).length)) }, // adds clearance to bottom of score
                          stave: { space: 10 },
                          font: { face: "Arial", point: 10, style: "" }
                        });

  let context = vex.getContext();
  let score = vex.EasyScore();
  context.scale(scale, scale);

  // Helpers - shorthand for score.[method]
  let makeVoice = score.voice.bind(score);
  let makeNotes = score.notes.bind(score);
  // let makeBeam = score.beam.bind(score); as of now handled with Beam.generateBeams (subject to change)
  // let makeTuplet = score.tuplet.bind(score); as of yet unimplimented
  // TODO -> implement tuplet support

  let makeSystem = (x, y, width) => {
    return vex.System({ x: x, y: y, width: width, spaceBetweenStaves: 9 });
  }

  let modifications = {};
  let beams = [];

  measures.forEach((measure, mNo) => {
    let { keySig, timeSig,
      showClef, showKey, showTime,
      staves, barlines, connectors,
      x, y, width
    } = measure;

    score.set({ time: timeSig });

    let staveCount = Object.keys(staves).length;

    let system = makeSystem(x, y, width);

    for (let staveClef in staves) {
      let voices = staves[staveClef];
      let vs = [];
     
      voices.forEach((voice, vNo) => {
        let ns = [];
        let accidSoFar = [];
        let strip = stripAccidental(keySig);
        let accid = isAccidental(keySig);

        voice.forEach((noteObj, nNo) => {
          let { clef, keys, duration, modifiers } = noteObj;

          let strippedKeys = [];
          
          // this block handles accidentals; accidentals are only shown
          // on the first instance of the note in question PER REGISTER
          // e.g., c#4 -> c#4 will only show one sharp symbol, but
          //       bb4 -> bb3 will show both.
          keys.forEach(key => {
            let [pitch, register] = key.split("/");
            let accidOverwriteIdx = accidSoFar.findIndex(note => {
              return note.startsWith(pitch[0]) && note.endsWith(register);
            });

            let explicitAccid = null;
            if (modifiers && modifiers["explicitAccid"]) {
              explicitAccid = modifiers["explicitAccid"];
            }

            if (accid(pitch)) {
              if (accidSoFar.includes(key)) {
                strippedKeys.push([pitch[0], register].join(""));
              } else if (accidOverwriteIdx !== -1) {
                accidSoFar.splice(accidOverwriteIdx, 1, key);
                strippedKeys.push([pitch, register].join(""));
              } else {
                accidSoFar.push(key);
                strippedKeys.push(strip(key));
              }
            } else if (accidOverwriteIdx !== -1) {
                accidSoFar.splice(accidOverwriteIdx, 1, key);
                strippedKeys.push([pitch, register].join(""));
            } else if (explicitAccid && explicitAccid.includes(key)) { // for the case where the author wants a non-accidental made explicit,
              strippedKeys.push([pitch, register].join(""));           // e.g, the previous measure ended with an accidental and the new measure starts with the same pitch and register, but no accidental. (f#/4 | fn/4)
            } else {
              strippedKeys.push(strip(key));
            }
          });

          let note = (strippedKeys.length === 1 ? strippedKeys[0] : `(${strippedKeys.join(" ")})`) + `/${duration}`;

          if (modifiers) {
            // the nesting of this measure object lets us assign a unique identifier to each note
            // TODO -> consider giving each notehead an id. currently, id is assigned to temporal instance
            let noteId = `M${mNo}C${staveClef}V${vNo}N${nNo}`;
            modifications[noteId] = modifiers;
            note += `[id="${noteId}"]`;
          }
          ns.push(makeNotes(note, { clef }));
        });

        ns = ns.reduce(concat);

        // TODO -> beaming logic should be more involved considering
        // there can be multiple voices in a given stave. WIP
        beams.push(Beam.generateBeams(ns));

        vs.push(makeVoice(ns));
      })

      let staff = system.addStave({ voices: vs });

      // I originally had logic for showing time- and key-signature changes
      // at the ends of measures, but Vexflow's rendering for end-of-measure
      // signatures didn't behave as I expected.

      if (showClef) { staff.addClef(staveClef); }

      if (showKey) { staff.addKeySignature(keySig); }

      if (showTime) { staff.addTimeSignature(timeSig); }

      staff.addModifier(new Barline(barlines.left));
      staff.setEndBarType(barlines.right);

    }

    if (staveCount > 1) {
      connectors.forEach(conn => { system.addConnector(conn); });
    }

  });

  for (let id in modifications) {
    let modObject = modifications[id];
    let currNote = retrieve(id);
    for (let modKey in modObject) {
      let mod = modObject[modKey];
      switch (modKey) {
        case "artic":
          currNote.addModifier(0, vex.Articulation(mod));
          break;
        case "finger":
          currNote.addModifier(0, vex.Fingering(mod));
          break;
        case "grace":
          let graceNotes = mod.notes.map(grace => vex.GraceNote(grace));
          currNote.addModifier(0, vex.GraceNoteGroup({ notes: graceNotes }));
          vex.StaveTie({ from: _.last(graceNotes), to: currNote});
          break;
        default:
          break;
      }
    }
  }
  
  vex.draw();

  beams.forEach(beamGroup => beamGroup.forEach(beam => { beam.setContext(context).draw() }))

  Registry.disableDefaultRegistry();

}

// simplifyMeasures adds markers to each measure that the Vexflow renderer will use,
// like x and y positioning, markers as to which measures should actually display their
// key and time signatures, etc.

const simplifyMeasures = scale => (acc, measure, index, thisArg) => {
                         // having the scale available will make future 
                         // media-specific resizing simpler.
  let { staves } = measure;
  let voices = [];

  for (let stave in staves) {
    for (let voice of staves[stave]) {
      voices.push(voice);
    }
  }
  
  let maxLength = _.maxBy(voices, v => v.length).length;
  let baseWidth = maxLength * 40; // simply using 40 pixels per notehead.
                                  // consider adjusting this based on note duration.
  let staveCount = Object.keys(staves).length;

  measure.connectors = []; // could instantiate with a default of singleRight, but that creates
                           // a visual bug where overlapping barlines are drawn.
  
  if (_.isEmpty(acc)) { // conditions for first measure
    measure.showClef = true;
    measure.showKey = true;
    measure.showTime = true;
    measure.x = 80;
    measure.y = 10;
    measure.width = Math.min(
      baseWidth,
      890
    ) + 90;

    if (staveCount > 1) {
      measure.connectors.push("brace", "singleLeft");
    }

    return [ measure ];

  } else { // subsequent measures
    let prev = _.initial(acc);
    let lastMeasure  = _.last(acc);

    measure.x = lastMeasure.x + lastMeasure.width;
    measure.y = lastMeasure.y;
    measure.width = baseWidth;

    if (measure.keySig !== lastMeasure.keySig) {
      measure.showKey = true;
      measure.width += 30;
    }

    if (measure.timeSig !== lastMeasure.timeSig) {
      measure.showTime = true;
      measure.width += 30;
    }

    if (measure.x + measure.width > 980) {
      measure.x = 40;
      measure.y += Math.max(120, 100 * staveCount);
      measure.showClef = true;
      measure.showKey = true;
      measure.width += 90;
      lastMeasure.width = 980 - lastMeasure.x;
      lastMeasure.connectors.push("singleRight");
      measure.connectors.push("brace", "singleLeft");
    }

    if (index === thisArg.length - 1) { // is last measure
      measure.width = 980 - measure.x;
      measure.connectors.push("boldDoubleRight");
    }

    return [...prev, lastMeasure, measure];
  }

}

const concat = (a, b) => a.concat(b);
const isAccidental = keySig => pitch => !theKeys[keySig].includes(pitch);
const stripAccidental = keySig => pitch => {
  let [note, register] = pitch.split("/");
  note = isAccidental(keySig)(note) ? note : note[0];
  return [note, register].join("");
}
