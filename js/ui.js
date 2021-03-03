
/* Osc1 Oscilators */
var dial = new Nexus.Dial('osc1-det',{
  'size': [40,40],
  'interaction': 'radial', // "radial", "vertical", or "horizontal"
  'mode': 'relative', // "absolute" or "relative"
  'min': 0,
  'max': 1,
  'step': 0,
  'value': 0
})

var dial = new Nexus.Dial('osc1-fm',{
  'size': [40,40],
  'interaction': 'radial',
  'mode': 'relative',
  'min': 0,
  'max': 1,
  'step': 0,
  'value': 0
})

var dial = new Nexus.Dial('osc1-sub',{
  'size': [40,40],
  'interaction': 'radial',
  'mode': 'relative',
  'min': 0,
  'max': 1,
  'step': 0,
  'value': 0
})


/* Osc2 Oscilators */
var button = new Nexus.Button('#osc2-ring',{
  'size': [16,16],
  'mode': 'toggle',
  'state': false
})

var button = new Nexus.Button('#osc2-sync',{
  'size': [16,16],
  'mode': 'toggle',
  'state': false
})

var button = new Nexus.Button('#osc2-track',{
  'size': [16,16],
  'mode': 'toggle',
  'state': false
})


var button = new Nexus.Button('#osc2-pitch',{
  'size': [16,16],
  'mode': 'toggle',
  'state': false
})
var dial = new Nexus.Dial('#osc2-pitch-dial',{
  'size': [40,40],
  'interaction': 'radial',
  'mode': 'relative',
  'min': 0,
  'max': 1,
  'step': 0,
  'value': 0
})

var button = new Nexus.Button('#osc2-fine',{
  'size': [16,16],
  'mode': 'toggle',
  'state': false
})
var dial = new Nexus.Dial('#osc2-fine-dial',{
  'size': [40,40],
  'interaction': 'radial',
  'mode': 'relative',
  'min': 0,
  'max': 1,
  'step': 0,
  'value': 0
})

var button = new Nexus.Button('#osc2-m-env',{
  'size': [16,16],
  'mode': 'toggle',
  'state': false
})

var dial = new Nexus.Dial('#osc2-a',{
  'size': [40,40],
  'interaction': 'radial',
  'mode': 'relative',
  'min': 0,
  'max': 1,
  'step': 0,
  'value': 0
})

var dial = new Nexus.Dial('#osc2-d',{
  'size': [40,40],
  'interaction': 'radial',
  'mode': 'relative',
  'min': 0,
  'max': 1,
  'step': 0,
  'value': 0
})

var dial = new Nexus.Dial('#osc2-amt',{
  'size': [40,40],
  'interaction': 'radial',
  'mode': 'relative',
  'min': 0,
  'max': 1,
  'step': 0,
  'value': 0
})

var number = new Nexus.Number('#osc2-num',{
  'size': [60,30],
  'value': 0,
  'min': 0,
  'max': 127,
  'step': 1
})

var dial = new Nexus.Dial('osc2-mix',{
  'size': [40,40],
  'interaction': 'radial', // "radial", "vertical", or "horizontal"
  'mode': 'relative', // "absolute" or "relative"
  'min': 0,
  'max': 1,
  'step': 0,
  'value': 0
})

var dial = new Nexus.Dial('osc2-pw',{
  'size': [40,40],
  'interaction': 'radial', // "radial", "vertical", or "horizontal"
  'mode': 'relative', // "absolute" or "relative"
  'min': 0,
  'max': 1,
  'step': 0,
  'value': 0
})

var dial = new Nexus.Dial('osc2-phase',{
  'size': [40,40],
  'interaction': 'radial', // "radial", "vertical", or "horizontal"
  'mode': 'relative', // "absolute" or "relative"
  'min': 0,
  'max': 1,
  'step': 0,
  'value': 0
})

var dial = new Nexus.Dial('osc2-tune',{
  'size': [40,40],
  'interaction': 'radial', // "radial", "vertical", or "horizontal"
  'mode': 'relative', // "absolute" or "relative"
  'min': 0,
  'max': 1,
  'step': 0,
  'value': 0
})