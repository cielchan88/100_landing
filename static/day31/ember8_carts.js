/* Ember-8 — bundled cartridges (Day 31).
 * Each cart is { v: 1, name, code, sprites } where sprites is 8192 hex chars:
 * the 128x64 sprite sheet (16x8 slots of 8x8), one palette index per nibble,
 * row-major across the full sheet. Bundled carts are read-only originals;
 * loading one copies it into the editor. */
(function () {
  'use strict';

  function blankSheet() {
    return new Uint8Array(128 * 64);
  }

  // Stamp an ASCII art block onto the sheet. '.' = leave 0, hex digit = color.
  function stamp(sheet, px, py, rows) {
    for (var y = 0; y < rows.length; y++) {
      var row = rows[y];
      for (var x = 0; x < row.length; x++) {
        var ch = row.charAt(x);
        if (ch !== '.') sheet[(py + y) * 128 + (px + x)] = parseInt(ch, 16);
      }
    }
  }

  function sheetToHex(sheet) {
    var out = new Array(sheet.length);
    for (var i = 0; i < sheet.length; i++) out[i] = sheet[i].toString(16);
    return out.join('');
  }

  // Slot layout: sprite n lives at column n%16, row floor(n/16).
  // Slot 0 is left empty on purpose (color 0 doubles as "transparent" in spr).
  var PADDLE = [ // slots 1+2: a copper ember-bucket, 16x8
    '................',
    '.99999999999999.',
    '9444444444444449',
    '9444444444444449',
    '9442222222222449',
    '9422222222222249',
    '.94222222222249.',
    '..999999999999..',
  ];

  var FLAME = [ // slot 3: a small ember flame
    '........',
    '....8...',
    '...98...',
    '...998..',
    '..9aa98.',
    '..9aaa9.',
    '...999..',
    '........',
  ];

  var FACE = [ // slot 4: a friendly blob for the template cart
    '.aaaaaa.',
    'aaaaaaaa',
    'aa0aa0aa',
    'aaaaaaaa',
    'a0aaaa0a',
    'aa0000aa',
    'aaaaaaaa',
    '.aaaaaa.',
  ];

  function defaultSheet() {
    var s = blankSheet();
    stamp(s, 8, 0, PADDLE);  // slots 1-2
    stamp(s, 24, 0, FLAME);  // slot 3
    stamp(s, 32, 0, FACE);   // slot 4
    return s;
  }

  var DEFAULT_HEX = sheetToHex(defaultSheet());

  var EMBER_CATCH_CODE = [
    '-- EMBER CATCH',
    '-- catch falling embers in the bucket.',
    '-- arrows: move   X: restart',
    '',
    'function _init()',
    ' px=56',
    ' score=0',
    ' lives=3',
    ' over=false',
    ' embers={}',
    ' spd=0.6',
    ' tmr=20',
    ' flash=0',
    'end',
    '',
    'function spawn()',
    ' table.insert(embers,{',
    '  x=4+rnd(120),',
    '  y=-3,',
    '  v=spd+rnd(0.4),',
    '  c=8+flr(rnd(3))',
    ' })',
    'end',
    '',
    'function _update()',
    ' if over then',
    '  if btnp(5) then _init() end',
    '  return',
    ' end',
    '',
    ' if btn(0) then px=px-2 end',
    ' if btn(1) then px=px+2 end',
    ' px=mid(0,px,112)',
    '',
    ' tmr=tmr-1',
    ' if tmr<=0 then',
    '  spawn()',
    '  tmr=14+flr(rnd(16))',
    ' end',
    '',
    ' for i=#embers,1,-1 do',
    '  local e=embers[i]',
    '  e.y=e.y+e.v',
    '  if e.y>=117 and e.x>=px-2 and e.x<=px+18 then',
    '   -- caught!',
    '   score=score+1',
    '   spd=spd+0.03',
    '   flash=4',
    '   beep(520+rnd(200),0.05,1)',
    '   table.remove(embers,i)',
    '  elseif e.y>130 then',
    '   -- missed',
    '   lives=lives-1',
    '   beep(110,0.2,0)',
    '   table.remove(embers,i)',
    '   if lives<=0 then',
    '    over=true',
    '    beep(55,0.5,2)',
    '   end',
    '  end',
    ' end',
    '',
    ' if flash>0 then flash=flash-1 end',
    'end',
    '',
    'function _draw()',
    ' cls(1)',
    '',
    ' for i=1,#embers do',
    '  local e=embers[i]',
    '  circfill(e.x,e.y,2,e.c)',
    '  pset(e.x,e.y-3,e.c)',
    ' end',
    '',
    ' spr(1,px,120,2)',
    '',
    ' print("SCORE "..score,2,2,flash>0 and 10 or 7)',
    ' for i=1,lives do',
    '  rectfill(118-(i-1)*6,2,121-(i-1)*6,5,8)',
    ' end',
    '',
    ' if over then',
    '  rectfill(20,48,108,80,0)',
    '  rect(20,48,108,80,9)',
    '  print("GAME OVER",46,54,8)',
    '  print("SCORE "..score,46,62,7)',
    '  print("PRESS X",50,70,6)',
    ' end',
    'end',
  ].join('\n');

  var STARFIELD_CODE = [
    '-- STARFIELD',
    '-- a parallax demo: pure code,',
    '-- no sprites.',
    '',
    'function _init()',
    ' stars={}',
    ' for i=1,120 do',
    '  stars[i]={',
    '   x=flr(rnd(128)),',
    '   y=flr(rnd(128)),',
    '   z=1+flr(rnd(3))',
    '  }',
    ' end',
    'end',
    '',
    'function _update()',
    ' for i=1,120 do',
    '  local s=stars[i]',
    '  s.y=s.y+s.z*0.4',
    '  if s.y>127 then',
    '   s.y=0',
    '   s.x=flr(rnd(128))',
    '  end',
    ' end',
    'end',
    '',
    'function _draw()',
    ' cls(0)',
    ' local cols={5,6,7}',
    ' for i=1,120 do',
    '  local s=stars[i]',
    '  pset(s.x,s.y,cols[s.z])',
    ' end',
    ' local ty=56+math.sin(t()*1.5)*8',
    ' print("EMBER-8",51,ty+1,2)',
    ' print("EMBER-8",50,ty,9)',
    'end',
  ].join('\n');

  var TEMPLATE_CODE = [
    '-- MY CART',
    '-- _init runs once. _update and',
    '-- _draw both run 30 times a',
    '-- second. arrows move the blob.',
    '',
    'function _init()',
    ' x=60',
    'end',
    '',
    'function _update()',
    ' if btn(0) then x=x-1 end',
    ' if btn(1) then x=x+1 end',
    ' x=mid(0,x,120)',
    'end',
    '',
    'function _draw()',
    ' cls(1)',
    ' print("HELLO EMBER-8",38,40,7)',
    ' spr(4,x,70)',
    'end',
  ].join('\n');

  var api = {
    EMBER_CATCH: { v: 1, name: 'EMBER CATCH', code: EMBER_CATCH_CODE, sprites: DEFAULT_HEX },
    STARFIELD: { v: 1, name: 'STARFIELD', code: STARFIELD_CODE, sprites: DEFAULT_HEX },
    TEMPLATE: { v: 1, name: 'MY CART', code: TEMPLATE_CODE, sprites: DEFAULT_HEX },
    DEFAULT_HEX: DEFAULT_HEX,
    sheetToHex: sheetToHex,
    blankSheet: blankSheet,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.E8_CARTS = api;
})();
