// A sound control's value on a slider and back. No page here: app/audio.js and the editing panel's model both use it.

/** A parameter that is a set of choices, not a slider: named options, or a few evenly spaced values. */
export const isChoice = (d) => !!(d.options || d.step);
export const choicesOf = (d) => (d.options ? d.options.map((name, i) => ({ value: i, label: name }))
  : Array.from({ length: Math.round((d.max - d.min) / d.step) + 1 }, (_, i) => ({ value: d.min + i * d.step, label: `${d.min + i * d.step}${d.unit ? ' ' + d.unit : ''}` })));
export const snap = (d, v) => (d.options ? Math.round(v) : d.step ? d.min + Math.round((v - d.min) / d.step) * d.step : v);
/** From a slider's place (0 to 1) to the control's own value, and back. */
export const toValue = (d, u) => { const v = d.scale === 'log' ? d.min * Math.pow(d.max / d.min, u) : d.min + (d.max - d.min) * u; return snap(d, Number(v.toPrecision(4))); };
export const toUnit = (d, v) => (d.scale === 'log' ? Math.log(v / d.min) / Math.log(d.max / d.min) : (v - d.min) / (d.max - d.min));
