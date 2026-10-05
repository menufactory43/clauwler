export type RGB = readonly [number, number, number]

/** DawnBringer 16, the whole palette. */
export const P: Record<string, RGB> = {
  k: [20, 12, 28],
  p: [68, 36, 52],
  n: [48, 52, 109],
  g: [78, 74, 78],
  b: [133, 76, 48],
  e: [52, 101, 36],
  r: [208, 70, 72],
  o: [117, 113, 97],
  u: [89, 125, 206],
  a: [210, 125, 44],
  s: [133, 149, 161],
  G: [109, 170, 44],
  t: [210, 170, 153],
  c: [109, 194, 202],
  y: [218, 212, 94],
  w: [222, 238, 214],
}

export type Sprite = { w: number; h: number; rows: readonly string[] }

const sprite = (rows: readonly string[]): Sprite => ({ w: rows[0]?.length ?? 0, h: rows.length, rows })

// The champion: laurel, red cape, steel boots. Two walking frames.
export const HERO = [
  sprite([
    '...kkkk...',
    '..kyGyGk..',
    '.kttttttk.',
    '.ktkttktk.',
    '.kttttttk.',
    '..krrrrk..',
    '.krwwwrrk.',
    'kkrwwwwrkk',
    '.krwwwwrk.',
    '..knnnnk..',
    '..ks..sk..',
    '..kk..kk..',
  ]),
  sprite([
    '...kkkk...',
    '..kyGyGk..',
    '.kttttttk.',
    '.ktkttktk.',
    '.kttttttk.',
    '..krrrrk..',
    '.krwwwrrk.',
    'kkrwwwwrkk',
    '.krwwwwrk.',
    '..knnnnk..',
    '...ks.sk..',
    '...kk.kk..',
  ]),
]

export const RAT = sprite([
  '.....kk..',
  '..kkkssk.',
  '.kssssssk',
  'ksrsssssk',
  '.kssssskk',
  '..k.k.k..',
])

export const GOBLIN = sprite([
  '..kkkk..',
  '.kGGGGk.',
  'kGrGGrGk',
  '.kGGGGk.',
  '..kbbk..',
  '.kbbbbk.',
  'kGkbbkGk',
  '..kbbk..',
  '..k..k..',
])

export const SLUG = sprite([
  '...kkk...',
  '..kyyyk..',
  '.kykykyk.',
  'kyyyyyyyk',
  'kayayayak',
  '.kkkkkkk.',
])

export const SKELETON = sprite([
  '..kkkk..',
  '.kwwwwk.',
  '.kwkkwk.',
  '.kwwwwk.',
  '..kwwk..',
  '.kwkkwk.',
  'kwkwwkwk',
  '..kwwk..',
  '.kwkkwk.',
  '.kk..kk.',
])

export const LARVA = sprite([
  '.kkkk.',
  'kppppk',
  'kpcpck',
  '.kkkk.',
])

export const BUG = sprite([
  '.k.k.',
  'krrrk',
  'kryrk',
  '.k.k.',
])

/** Prêcheur du Lint: a hooded preacher, his hem all squiggly underlines. */
export const LINTER = sprite([
  '...kk...',
  '..kuuk..',
  '.kuuuuk.',
  'kuukkuuk',
  'kukykyuk',
  '.kuuuuk.',
  'kunuunuk',
  'kunnnnuk',
  'kyuyuyuk',
  '.kkkkkk.',
])

/** Nécromant du Fork: a robed caster, his staff forked at the top. */
export const FORKER = sprite([
  'y.y.......',
  '.y...kkk..',
  '.b..kpppk.',
  '.b.kpcpcpk',
  '.b.kppppk.',
  '.bkpnppnpk',
  'kbpnnppnpk',
  '.bkpnppnk.',
  '.b.kpnnpk.',
  '.b.kppppk.',
  '..kkkkkkk.',
])

/** Tourelle CI: a squat steel turret, its status light on top. */
export const TURRET = sprite([
  '...kkkk...',
  '..ksssSk..',
  '.ksrwrsSk.',
  'kssssssSSk',
  'kgsSssSsgk',
  'kggggggggk',
  'kSgSgSgSgk',
  'kggggggggk',
  '.kkkkkkkk.',
])

/** Poseur de Breakpoints: a sapper in a helmet, red dots on his pack. */
export const MINER = sprite([
  '..kkkk..',
  '.kaaaak.',
  'kaywwyak',
  '.ktkktk.',
  '.kbrrbk.',
  'kbbrrbbk',
  '.kbbbbk.',
  '.kbkkbk.',
  '.kk..kk.',
])

/** Ver de Cache: a worm head out of the floor, a ring of teeth. */
export const BURROWER = sprite([
  '..kkkkk..',
  '.kqqqqqk.',
  'kqkwkwkqk',
  'kqRRRRRqk',
  'kqkwkwkqk',
  '.kqqtqqk.',
  '..kqtqk..',
  '.kbbbbbk.',
  'kbBbBbBbk',
])

/** Monolithe Gluant: a slab of slime that splits into microservices. */
export const MONOLITH = sprite([
  '....kkkk....',
  '..kkuuuukk..',
  '.kuwuuuuuuk.',
  'kuwuuuuuuunk',
  'kuukwuukwunk',
  'kuukkuukkunk',
  'kuuuuuuuuunk',
  'kunuuuuuunnk',
  '.knnnnnnnnk.',
  '..kkkkkkkk..',
])

export const MICRO = sprite([
  '.kkkk.',
  'kwccck',
  'kckcck',
  'kcccck',
  '.kkkk.',
])

/** Sentinelle CORS: an armoured guard; its tower shield is drawn apart, where it faces. */
export const SENTINEL = sprite([
  '...rr...',
  '..krrk..',
  '.kssssk.',
  '.kskkSk.',
  '.kssssk.',
  'kSssssSk',
  'ksWsssSk',
  'ksssssSk',
  '.kSnnSk.',
  '.ks..sk.',
  '.kk..kk.',
])

/** Relecteur LGTM: a green-robed monk, a big tick on his chest. */
export const REVIEWER = sprite([
  '..kkkk..',
  '.kttttk.',
  '.ktkktk.',
  '..kttk..',
  '.kGGGGk.',
  'kGGGGwGk',
  'kGwGwGGk',
  'kGGwGGGk',
  '.kGGGGk.',
  '.kk..kk.',
])

/** Fuite Mémoire: a swollen blob on a short fuse. */
export const LEAK = sprite([
  '....y...',
  '...kak..',
  '..kqqqk.',
  '.kqwqqqk',
  'kqwqqqqk',
  'kqkqqkRk',
  'kqqqqRRk',
  '.kqqRRk.',
  '..kkkk..',
])

/** Profileur Embusqué: a grey hood, one red lens. */
export const SNIPER = sprite([
  '..kkkk..',
  '.kooook.',
  'kokrkgok',
  'kooooogk',
  '.kgoogk.',
  'kgoooogk',
  'kooyoogk',
  'kgoooogk',
  '.kogggk.',
  '.kk..kk.',
])

export const FAMILIAR = sprite([
  '.kk.kk.',
  'kcckcck',
  'kcwccwk',
  '.kcccck',
  '..kkkk.',
])

export const CHEST = sprite([
  '.kkkkkk.',
  'kbbbbbbk',
  'kkkyykkk',
  'kbbyybbk',
  'kbbbbbbk',
  '.kkkkkk.',
])

export const ICONS: Record<string, Sprite> = {
  boon: sprite(['..y..', '.yyy.', 'yyyyy', '.yyy.', '..y..']),
  eclats: sprite(['..c..', '.ccc.', 'ccwcc', '.ccc.', '..c..']),
  heal: sprite(['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..']),
  vigor: sprite(['.a.a.', 'aaaaa', 'aawaa', '.aaa.', '..a..']),
  boss: sprite(['.www.', 'wkwkw', 'wwwww', '.w.w.', '.....']),
  heart: sprite(['.r.r.', 'rrrrr', '.rrr.', '..r..']),
  shard: sprite(['.c.', 'cwc', '.c.']),
  /** An item, not a boon: a gem on a gold chain. */
  item: sprite(['.y.y.', '..y..', '.uuu.', 'ucwcu', '.unu.', '..u..']),
}

/** Each biome's floor, wall and pillar tones. */
export const BIOME_TONES: { floor: [RGB, RGB]; crack: RGB; wall: RGB; wallTop: RGB; pillar: RGB }[] = [
  { floor: [[44, 30, 48], [52, 36, 58]], crack: [30, 20, 34], wall: [68, 36, 52], wallTop: [117, 70, 90], pillar: [88, 52, 74] },
  { floor: [[50, 34, 26], [58, 40, 30]], crack: [96, 40, 20], wall: [90, 40, 30], wallTop: [160, 80, 44], pillar: [110, 56, 36] },
  { floor: [[30, 54, 50], [36, 62, 58]], crack: [24, 40, 38], wall: [36, 70, 60], wallTop: [109, 170, 140], pillar: [60, 100, 90] },
]

// 3x5 pixel font: uppercase, digits, a few marks.
const FONT_ROWS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  '0': '111101101101111', '1': '010110010010111', '2': '110001010100111', '3': '110001010001110',
  '4': '101101111001001', '5': '111100110001110', '6': '011100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001110',
  ' ': '000000000000000', '.': '000000000000010', '!': '010010010000010', '?': '110001010000010',
  ':': '000010000010000', '-': '000000111000000', '+': '000010111010000', '/': '001001010100100',
  '%': '101001010100101', "'": '010010000000000', '>': '100010001010100', '<': '001010100010001',
  '(': '010100100100010', ')': '010001001001010', ',': '000000000010100',
}

const ACCENTS: Record<string, string> = {
  À: 'A', Â: 'A', Ä: 'A', Ç: 'C', É: 'E', È: 'E', Ê: 'E', Ë: 'E', Î: 'I', Ï: 'I', Ô: 'O', Ö: 'O',
  Ù: 'U', Û: 'U', Ü: 'U', Œ: 'OE', Æ: 'AE', '’': "'", '«': '<', '»': '>', '—': '-', '–': '-',
}

/** Text as the pixel font can write it: uppercase, accents folded. */
export function fold(text: string): string {
  let out = ''
  for (const ch of text.toUpperCase()) out += ACCENTS[ch] ?? (FONT_ROWS[ch] ? ch : ' ')
  return out
}

export function glyph(ch: string): string | undefined {
  return FONT_ROWS[ch]
}

// ---------- fine art: two pixels to a world pixel ----------

/** Shades the DawnBringer set lacks, for the fine sprites. */
Object.assign(P, {
  R: [140, 36, 48],
  q: [238, 112, 92],
  T: [166, 116, 100],
  W: [164, 176, 170],
  Y: [164, 132, 42],
  E: [34, 70, 30],
  S: [86, 98, 118],
  B: [86, 48, 34],
  N: [30, 32, 72],
  h: [246, 214, 132],
} satisfies Record<string, RGB>)

/** A sprite drawn one fine pixel a mark: each mark a colour and a light, -1 shadow to +1 lit. */
export type Fine = { w: number; h: number; ch: string[]; light: Int8Array }

function fineOf(rows: readonly string[]): string[][] {
  return rows.map(row => [...row])
}

/** Scale2x: doubles a sprite and rounds its diagonals instead of stacking blocks. */
function scale2x(src: string[][]): string[][] {
  const h = src.length
  const w = src[0]?.length ?? 0
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : src[y]![x]!)
  const out = Array.from({ length: h * 2 }, () => new Array<string>(w * 2).fill('.'))
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = at(x, y)
    const a = at(x, y - 1)
    const b = at(x + 1, y)
    const c = at(x - 1, y)
    const d = at(x, y + 1)
    out[y * 2]![x * 2] = c === a && c !== d && a !== b ? a : p
    out[y * 2]![x * 2 + 1] = a === b && a !== c && b !== d ? b : p
    out[y * 2 + 1]![x * 2] = d === c && d !== b && c !== a ? c : p
    out[y * 2 + 1]![x * 2 + 1] = b === d && b !== a && d !== c ? d : p
  }
  return out
}

/**
 * Lights a fine sprite from the top left: marks on an upper-left edge catch the
 * light, marks near a lower-right edge fall in shadow. Outline marks on the
 * silhouette take the colour of what they wrap, darkened (selout).
 */
function shade(grid: string[][], isLit: boolean): Fine {
  const h = grid.length
  const w = grid[0]?.length ?? 0
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : grid[y]![x]!)
  const isEdge = (c: string) => c === '.' || c === 'k'
  const ch: string[] = []
  const light = new Int8Array(w * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = at(x, y)
    let l = 0
    if (c === 'k') {
      const touchesOut = at(x - 1, y) === '.' || at(x + 1, y) === '.' || at(x, y - 1) === '.' || at(x, y + 1) === '.'
      const inner = [at(x + 1, y), at(x - 1, y), at(x, y + 1), at(x, y - 1)].find(n => !isEdge(n))
      if (touchesOut && inner) { c = inner; l = -3 }
    } else if (c !== '.' && isLit) {
      if (isEdge(at(x - 1, y)) || isEdge(at(x, y - 1))) l = 1
      if (isEdge(at(x + 1, y)) || isEdge(at(x, y + 1))) l = -2
      else if (isEdge(at(x + 2, y + 1)) || isEdge(at(x + 1, y + 2))) l = -1
    }
    ch.push(c)
    light[y * w + x] = l
  }
  return { w, h, ch, light }
}

/** A coarse sprite made fine: doubled, rounded, lit. */
export function refine(s: Sprite): Fine {
  return shade(scale2x(fineOf(s.rows)), true)
}

/** A sprite already drawn fine, shading and all: only its outline is coloured. */
function drawn(rows: readonly string[]): Fine {
  return shade(fineOf(rows), false)
}

/** The colour of a mark under its light. */
export function lit(c: RGB, l: number): RGB {
  if (l === 0) return c
  if (l > 0) return [Math.min(245, c[0] * 1.16 + 14), Math.min(245, c[1] * 1.12 + 10), Math.min(245, c[2] * 1.04 + 4)]
  const k = l === -1 ? 0.84 : l === -2 ? 0.68 : 0.45
  return [c[0] * k * 0.92, c[1] * k * 0.96, Math.min(255, c[2] * k + 6)]
}

// The champion, drawn fine: laurel, brown hair, red cape over a white tunic, gold belt, steel boots.
const HERO_TOP = [
  '......kkkkkkkk......',
  '.....kGyGhyGyGk.....',
  '....kBbBbbbbBbBk....',
  '....kbttttttttbk....',
  '....kqtttttttTTk....',
  '....ktwkttttwkTk....',
  '....kttttttttTTk....',
  '.....kTttrrtTTk.....',
  '......kkTTTTkk......',
  '....kRrrwwwwrrRk....',
  '...kRrqwwwwwwrrRk...',
  '..kRrqwwwwwwWWrrRk..',
  '..kRtkwwwwwwWWkTRk..',
  '..kRtkyhyyyyYYkTRk..',
  '..kRrkwwwwwwWWkrRk..',
  '..kRRkwwwwwWWWkRRk..',
  '...kRkWwwwwwWWkRk...',
  '....kknnnnnnNNkk....',
  '.....knnnkknnNk.....',
]

export const HERO_FINE: Fine[] = [
  drawn([
    ...HERO_TOP,
    '.....knNk..knNk.....',
    '.....ksSk..ksSk.....',
    '....kssSk..ksSSk....',
    '....kkkkk..kkkkk....',
  ]),
  drawn([
    ...HERO_TOP,
    '....knNk....knNk....',
    '....ksSk....ksSk....',
    '...kssSk....ksSSk...',
    '...kkkkk....kkkkk...',
  ]),
]

/** The guardians, drawn fine: a pose a phase, the second one angry. */
export const GUARDIAN_FINE: Fine[][] = [
  // Le Merge Conflict: HEAD in blue, incoming in orange, zipped down the middle by its markers.
  [
    drawn([
      '........k............................k........',
      '.......kuk..........................kak.......',
      '........kck........................kayk.......',
      '........kuck........kkkkkk........kayk........',
      '........kuuck....kkkuckwyykkk....kayak........',
      '.........kuuck..kuccccwkyyaabk..kayak.........',
      '.........kuuuckkcccccckwyyaaabkkayaak.........',
      '..........kuukcccccccuwkyaaaabbkyaak..........',
      '...........kkkukkcccuckwyyaabbkkkkk...........',
      '.............kckkkkkcuwkyaakkkkkk.............',
      '.............kucukkkkkkwakkkkkBBk.............',
      '.............kuuwwwckkwkakkhyaBBk.............',
      '.............kucwwNNuukwyhhRRaaBk.............',
      '.............kuuccNNuuwkayyRRaBBk.............',
      '.............kuuucuuuukwbbaaaBBBk.............',
      '..........kk.knuuuuuunwkbBBBBBBBk.kk..........',
      '........kkuukkknnwkwkwkwkwkwkwBkkkyykk........',
      '.......kcuuuucccnkkkkkkkkkkkkkaabhhyyak.......',
      '......kcuuuucccccNNNNNkwBBBBBaaabbhhhyak......',
      '.....kuuuuncccccccccNNwkBByaaaaaabbhhyyak.....',
      '....kuuunnccccccccccuckwyyayaaaabbbbhhyyak....',
      '...kcuuunucccccccccucuwkyayaaaababbBBhhyyak...',
      '..kcuuuuncucccccucucuukwayaaaaaabbbbBhhhyyak..',
      '.kcuuuunuucucucucuuuuuwkyaaaaaabbbbBBBhhhyaBk.',
      '.kcuuunnuuucucuucnuuuukwaaaabhbbbbBBBBhhyyaak.',
      'kucuuunNuuuuuuucnuuuuuwkaaaaabhbbBBBBBhhhyyaBk',
      'kccuuunNuuuuuucnuuuuuukwaaaabbbhBBBBBByhhyaaBk',
      'kcccuunNuuuuucnuuuuuuuwkaaabbbbbhBBBBByhhhyabk',
      'kcucuunkuuuuuucnuuuuuukwbabbbbbhBBBBBBkhyhyabk',
      'kccuuuukkuuuuuucnuuuuuwkabbbbbhBBBBBBkkhhyyaak',
      'cccuuwnnkuuuuuuucnuunukwbbbbbhBBBBBBBkhhhwyabb',
      'cuuuwunNkkuuuuuuununnnwkbbbBBBBBBBBBkkhyyywabB',
      'uuuwunNNk.knnununnnnnnkwBbBBBBBBBBBk.kyyaaawBB',
      'uuunwNNNk..kkkkkkkkkkkkkkkkkkkkkkkk..kaaabwBBB',
      'knnnNwNk....kkWWkkWWkkWwkkWWkkWWkk....kbbwBBBk',
      '.kNNNNk....kcccNNNNNNNwkBBBBBBBaaBk....kBBBBk.',
      '..kkkk.....kucuuuNNNNNkwBBBBByaabBk.....kkkk..',
      '...........kuuuuunnNkkwkkkyyyaabbBk...........',
      '...........kuuuunnNNk....kaaaabbBBk...........',
      '............knnnnNNk......kbbbbBBk............',
      '.............kNNNNk........kBBBBk.............',
      '..............kkkk..........kkkk..............',
    ]),
    drawn([
      '........k............................k........',
      '.......kuk..........................kak.......',
      '........kck........................kayk.......',
      '........kuck........kkkkkk........kayk........',
      '........kuuck....kkkuRqhyykkk....kayak........',
      '.........kuuck..kuccccqrRyaabk..kayak.........',
      '.........kuuuckkcccccchryyaaabkkayaak.........',
      '..........kuukcccccccuqhyaaaabbkyaak..........',
      '...........kkkukkcccuRqryyaabbkkkkk...........',
      '.............kckkkkkcuhrRaakkkkkk.............',
      '.............kucukkkkkqhakkkkkBBk.............',
      '.............kuuwwwckkqrakkhyaBBk.............',
      '.............kucwwrruuhryhhRRaaBk.............',
      '.............kuuccrruuqhRyyRRaBBk.............',
      '.............kuuucuuuuqrbbaaaBBBk.............',
      '..........kk.knuuuuuunhrbBBBBBBBk.kk..........',
      '........kkuukkknnwkwkwkwkwkwkwBkkkyykk........',
      '.......kcuuuucccnkkkkkkkkkkkkkaabhhyyak.......',
      '......kcuuuucccccNRkRkRkRkRkRaaabbhhhyak......',
      '.....kuuuuncccccccccNNqhBByaaaaaabbhhyyak.....',
      '....kuuunnccccccccccuRqryyayaaaabbbbhhyyak....',
      '...kcuuunucccccccccucuhrRayaaaababbBBhhyyak...',
      '..kcuuuuncucccccucucuuqhayaaaaaabbbbBhhhyyak..',
      '.kcuuuunuucucucucuuuuuqryaaaaaabbbbBBBhhhyaBk.',
      '.kcuuunnuuucucuucnuuuRhraaaabhbbbbBBBBhhyyaak.',
      'kucuuunNuuuuuuucnuuuuuqhRaaaabhbbBBBBBhhhyyaBk',
      'kccuuunNuuuuuucnuuuuuuqraaaabbbhBBBBBByhhyaaBk',
      'kcccuunNuuuuucnuuuuuuuhraaabbbbbhBBBBByhhhyabk',
      'kcucuunkuuuuuucnuuuuuRqhbabbbbbhBBBBBBkhyhyabk',
      'kccuuuukkuuuuuucnuuuuuqrRbbbbbhBBBBBBkkhhyyaak',
      'cccuuwnnkuuuuuuucnuunuhrbbbbbhBBBBBBBkhhhwyabb',
      'cuuuwunNkkuuuuuuununnnqhbbbBBBBBBBBBkkhyyywabB',
      'uuuwunNNk.knnununnnnnRqrBbBBBBBBBBBk.kyyaaawBB',
      'uuunwNNNk..kkkkkkkkkkkkkkkkkkkkkkkk..kaaabwBBB',
      'knnnNwNk....kkWWkkWWkkWWkkWWkkWWkk....kbbwBBBk',
      '.kNNNNk....kcccNNNNNNNqrBBBBBBBaaBk....kBBBBk.',
      '..kkkk.....kucuuuNNNNRhrBBBBByaabBk.....kkkk..',
      '...........kuuuuunnNkkqhRkyyyaabbBk...........',
      '...........kuuuunnNNk....kaaaabbBBk...........',
      '............knnnnNNk......kbbbbBBk............',
      '.............kNNNNk........kBBBBk.............',
      '..............kkkk..........kkkk..............',
    ]),
  ],
  // Le Démon de la Prod: horns, bat wings, a server rack for a heart.
  [
    drawn([
      '..........kwSk..................kwSk..........',
      '..........ksSk..................ksSk..........',
      '..........ksSk........aya.......kSSk..........',
      '..........ksSSk........aya.....kWSSk..........',
      '...........kSSSk.....ayhya....kwsSk...........',
      '...........kSSSSkk..ayhhhya.kkwWSSk...........',
      '...k.......kSSSSSskaayhhhyaawwWsSSk......kk...',
      '..kBk.......kSSSSSSSqqqrrrwwwWsSSk......kpBk..',
      '..kpBk.......kSSSSSSqqrrrrWwWsSSk......kpBk...',
      '...kpBkk......kSSSSSqrqrrrWssSSk......kpBk....',
      '...kRpBBk......kSSkkrqrrrrSkkSk.....kkBBpk....',
      '...kpppBBk.....kqrqkkkrrrkkkRpk....kpBBppk....',
      '...kppppBBk....krrrrrkkrkkRRppk...kpBBpppk....',
      '....kpppRpBk...krrrrhyrrryhRppk..kpBRpppk.....',
      '....kppRpppBkk.krrrrrrrrRRRpppk.kpBRppppk.....',
      '....kpRpppppBBkkrrrrrrrRRRppppkkBBRpppppk.....',
      '...kpRppppppRBBkkrrrRRRRpppppkpBBRppppppRk....',
      '..kpRppppppRppBBkRRkwkkkkkwkppBBRppppppRppk...',
      '.kpRppppppRpppppBqppwpppppwprBpRppppppRppppk..',
      'kpRppppppRppppppqqqqpppppprrrrRppppppRppppppk.',
      'pRppppppRppqrrrqqqqqqqrrrrrrrrRqqqrpRppppppRpk',
      'BBBkkkpRpprrrRRRqqqqqrqrrrrrrrqqqrrrpppkkkkBBB',
      'kkkBBBBBBqrrrRppqqqqrqrrrrrrrrrqqqqrrBBBBBBkkk',
      '...kkRpprrrrRpppqswssssssssSSSrrqqqrrrppkkk...',
      '...kRppqrrrRppppqwsGsGsyssSsSSrrrqqqrrrRpk....',
      '..kRppqrrrrpppprqskkkkkkkkkkkSRrrrqqqrrRppk...',
      '..kppprrrrRppprqrsssssssSsSSSSRRrrrqqqrrppk...',
      '.kppkqqrrRppprrrrssrsGsysSSSSgRppRrrqqrrRppk..',
      '.kBBBqrrrRpprrrrrskkkkkkkkkkkgpppprrqqrrrBBBk.',
      '..kkqrrrRppkrrrrrssssSsSSSSgggppppkrqqqrrpkk..',
      '...kqqrrppkkrrrrrssGSGSySSggggppppkkrqqqrRk...',
      '...kqrrrRpkkrrrrrskkkkkkkkkkkgppppkkrrqrrRk...',
      '...kqqrrpk..krrrrsssSSSSggggggpppk..kqqqrrk...',
      '..krqrrRpk..kRrrrRrRRRRRRppppppppk..krqrrRpk..',
      '..krrrRRpk...kRRRRRRRRRRppppppppk...krrrRRpk..',
      '...kRRppk....kqRRRRRRpRppppppppRk....kRRppk...',
      '....kppk....kqqqpRpppppppppppprRpk....kppk....',
      '....wkk.w...krqrrpppppppppppprrRpk....wkk.w...',
      '......w.....krrrrrRppppppprrrrRppk......w.....',
      '............krrrrRRppkkkkrrrrRRppk............',
      '.............kRRRRppk....kRRRRppk.............',
      '.............kgggkkkk....kgggkkkk.............',
      '..............kkkkkkk.....kkkkkkk.............',
      '..............................................',
    ]),
    drawn([
      '..........kwSk.........aya......kwSk..........',
      '..........ksSk.......ayyya......ksSk..........',
      '..........ksSk.......ayhhhya....kSSk..........',
      '..........ksSSk.....ayhhhya....kWSSk..........',
      '...........kSSSk...aayhhhyaa..kwsSk...........',
      '...........kSSSSkkaayyhhhyyaakwWSSk...........',
      '...k.......kSSSSSsaayyhhhyyaawWsSSk......kk...',
      '..kBk.......kSSSSaayyhhhhhyyaasSSk......kpBk..',
      '..kpBk.......kSSSSSSqqrrrrWwWsSSk......kpBk...',
      '...kpBkk......kSSSSSqrqrrrWssSSk......kpBk....',
      '...kRpBBk......kSSkkrqrrrrSkkSk.....kkBBpk....',
      '...kpppBBk.....kqrqkkkrrrkkkRpk....kpBBppk....',
      '...kppppBBk....krrrrrkkrkkRRppk...kpBBpppk....',
      '....kpppRpBk...krrrrwhrrrhwRppk..kpBRpppk.....',
      '....kppRpppBkk.krrrrrrrrRRRpppk.kpBRppppk.....',
      '....kpRppappBBkkrrrrrrrRRRppppkkBBRppappk.....',
      '...kpRpppappRBBkkrrrRRRRpppppkpBBRpppappRk....',
      '..kpRpppyyyRppBBkRRkwkkkkkwkppBBRpppyyyRppk...',
      '.kpRppppyhypppppBqppwpppppwprBpRppppyhyppppk..',
      'kpRppppyyhyyppppqqqqpppppprrrrRppppyyhyyppppk.',
      'pRppppppRppqrrrqqqqqqqrrrrrrrrRqqqrpRppppppRpk',
      'BBBkkkpRpprrrRRRqqqqqrqrrrrrrrqqqrrrpppkkkkBBB',
      'kkkBBBBBBqrrrRppqqqqrqrrrrrrrrrqqqqrrBBBBBBkkk',
      '...kkRpprrrrRpppqswssssssssSSSrrqqqrrrppkkk...',
      '...kRppqrrrRppppqwsrsqsrssSsSSrrrqqqrrrRpk....',
      '..kRppqrrrrpppprqskkkkkkkkkkkSRrrrqqqrrRppk...',
      '..kppprrrrRppprqrsssssssSsSSSSRRrrrqqqrrppk...',
      '.kppkqqrrRppprrrrssrsqsrsSSSSgRppRrrqqrrRppk..',
      '.kBBBqrrrRpprrrrrskkkkkkkkkkkgpppprrqqrrrBBBk.',
      '..kkqrrrRppkrrrrrssssSsSSSSgggppppkrqqqrrpkk..',
      '...kqqrrppkkrrrrrssrSqSrSSggggppppkkrqqqrRk...',
      '...kqrrrRpkkrrrrrskkkkkkkkkkkgppppkkrrqrrRk...',
      '...kqqrrpk..krrrrsssSSSSggggggpppk..kqqqrrk...',
      '..krqrrRpk..kRrrrRrRRRRRRppppppppk..krqrrRpk..',
      '..krrrRRpk...kRRRRRRRRRRppppppppk...krrrRRpk..',
      '...kRRppk....kqRRRRRRpRppppppppRk....kRRppk...',
      '....kppk....kqqqpRpppppppppppprRpk....kppk....',
      '....wkk.w...krqrrpppppppppppprrRpk....wkk.w...',
      '......w.....krrrrrRppppppprrrrRppk......w.....',
      '............krrrrRRppkkkkrrrrRRppk............',
      '.............kRRRRppk....kRRRRppk.............',
      '.............kgggkkkk....kgggkkkk.............',
      '..............kkkkkkk.....kkkkkkk.............',
      '..............................................',
    ]),
  ],
  // L'Hydre des Dépendances: a coil of necks, packages stuck in its hide; five heads once angry.
  [
    drawn([
      '....................................................',
      '....................................................',
      '....................................................',
      '.........................kk.........................',
      '.......................kkGGkk.......................',
      '......................kyyGGeek......................',
      '.....................kyyyGGeeEk.....................',
      '....................kGyGGyryyGek....................',
      '....................keGGeeGyGGekk...................',
      '.........kk..........keeeEGGeeEEk........kk.........',
      '.......kkGGkk.........kEEEEkkkkkk......kkGGkk.......',
      '......kyyGGeek........keEEEEwkwk......kyyGGeek......',
      '.....kyyyGGeeEk.......keEEEEk........kyyyGGeeEk.....',
      '....kyyGeGryEEEk......kEEEEEk.......kGyGGyryyGek....',
      '...kykGeEEeEEEEk......kEEEEEk.......keGGeeGyGGekk...',
      '...kGeeEEEEEEEk.......kEEEEEk........keeeEGGeeEEk...',
      '...kEkkkkkEEEk.......keEEEEEk.........kEEEEkkkkkk...',
      '....kkwkwEEEEk.......keEEEEEk.........keEEEEwkwk....',
      '.......kEEEEEk.......keEEEEEk.........keEEEEk.......',
      '.......kEEEEEk.......keEEEEEk.........kEEEEEk.......',
      '.......kEEEEEEk......keEEEEEk........keeEEEEk.......',
      '.......keEEEEEk......kEEEEEEk........keEEEEEk.......',
      '........kEEEEEEk.....keEEEEEk.......kGeEEEEk........',
      '........kEEEEEEk.....kEEEEEEk.......keEEEEEk........',
      '.........kEEEEEEk....kEEEEEEkk.....keeEEEEk.........',
      '.........kEEEEEEEk..kkyyyGGGGekk..kGeEEEEEk.........',
      '..........kEEEEEEEkkyyyyyyGGeeeekkGeeEEEEk..........',
      '..........kEEEEEEEyyyyyyyGGGGeeEEEGeEEEEEk..........',
      '...........kEEEyyGGyyyGyGGGGeeeEEEEeEEEEk...........',
      '............kyyyyGGGyGGGGeeeeeEEEEEeeEEk............',
      '...........kyyyyyGGGGGeGeeeeEEEEEEEaaaaEk...........',
      '..........kyyyyyyeeeeeeeeeeEEEEEEEEaybBEEk..........',
      '.........kGyyyaaaaEeeeEeEEEEEEEEEEeabbBEEEk.........',
      '........kGGGyGaybByGEEEEEEEEEEEEeeeaBBBEEEEk........',
      '........kGGGGGabbBGGGGEEEEEEEEeeEeEEEEEEEEEk........',
      '........keGGGGaBBBGGGeGeeeeeeeeEEEEEEEEEEEEk........',
      '........keeGeGeGeGeGeeeeeeeeEeaaaaEEEEEEEEEk........',
      '.........keeeeeEeeEeeEeeEeeEEEaybBEEEEEEEEk.........',
      '..........keeeeeeeeeeaaaaEEEEEabbBEEEEEEEk..........',
      '...........kEEEEeEeEEaybBEEEEEaBBBEEEEEEk...........',
      '............kEEEEEEEEabbBEEEEEEEEEEEEEEk............',
      '.............kkEEEEEEaBBBEEEEEEEEEEEEkk.............',
      '...............kkkEEEEEEEEEEEEEEEEkkk...............',
      '..................kkkkkkkkkkkkkkkk..................',
    ]),
    drawn([
      '....................................................',
      '....................................................',
      '....................................................',
      '.........................kk.........................',
      '.......................kkGGkk.......................',
      '......................kyyGGeek......................',
      '.....................kyyyGGeeEk.....................',
      '....................kGyGGqwyyGek....................',
      '....................keGGeeGyGGekk...................',
      '.........kk..........keeeEGGeeEEk........kk.........',
      '.......kkGGkk.........kEEEEkkkkkk......kkGGkk.......',
      '......kyyGGeek........keEEEEwkwk......kyyGGeek......',
      '.....kyyyGGeeEk.......keEEEEk........kyyyGGeeEk.....',
      '....kyyGeGwqEEEk......kEEEEEk.......kGyGGqwyyGek....',
      '...kykGeEEeEEEEk......kEEEEEk.......keGGeeGyGGekk...',
      '...kGeeEEEEEEEk.......kEEEEEk........keeeEGGeeEEk...',
      '...kEkkkkkEEEk.......keEEEEEk.........kEEEEkkkkkk...',
      '....kkwkwEEEEk.......keEEEEEk.........keEEEEwkwk....',
      '...kk..kEEEEEk.......keEEEEEk.........keEEEEk..kk...',
      '.kkGGkkkEEEEEk.......keEEEEEk.........kEEEEEkkkGGkk.',
      'kyyyGGekEEEEEEk......keEEEEEk........keeEEEEkyyyGGek',
      'yyyGGeeEeEEEEEk......kEEEEEEk........keEEEEEyyyGGeeE',
      'GGeGwqEEEEEEEEEk.....keEEEEEk.......kGeEEEEGGyGqwyyG',
      'GeeEeEEEEEEEEEEk.....kEEEEEEk.......keEEEEEeGeGeyyyG',
      'eeEEEEEEkkEEEEEEk....kEEEEEEkk.....keeEEEEkkeeeeeGee',
      'kkkkEEEk.kEEEEEEEk..kkyyyGGGGekk..kGeEEEEEk.kEEEEkkk',
      'wkwEEEEk..kEEEEEEEkkyyyyyyGGeeeekkGeeEEEEk..keEEEEwk',
      '.kEEEEEEk.kEEEEEEEyyyyyyyGGGGeeEEEGeEEEEEk.kGeEEEEk.',
      '.kEEEEEEEk.kEEEyyGGyyyGyGGGGeeeEEEEeEEEEk.kyeEEEEEk.',
      '..kEEEEEEEk.kyyyyGGGyGGGGeeeeeEEEEEeeEEk.kyGEEEEEk..',
      '..kEEEEEEEEkyyyyyGGGGGeGeeeeEEEEEEEaaaaEkyGeEEEEEk..',
      '...kEEEEEEEyyyyyyeeeeeeeeeeEEEEEEEEaybBEEGeEEEEEk...',
      '....kEEEEEGyyyaaaaEeeeEeEEEEEEEEEEeabbBEEEEEEEEk....',
      '.....kEEEGGGyGaybByGEEEEEEEEEEEEeeeaBBBEEEEEEEk.....',
      '......kEEGGGGGabbBGGGGEEEEEEEEeeEeEEEEEEEEEEEk......',
      '.......kEeGGGGaBBBGGGeGeeeeeeeeEEEEEEEEEEEEEk.......',
      '........keeGeGeGeGeGeeeeeeeeEeaaaaEEEEEEEEEk........',
      '.........keeeeeEeeEeeEeeEeeEEEaybBEEEEEEEEk.........',
      '..........keeeeeeeeeeaaaaEEEEEabbBEEEEEEEk..........',
      '...........kEEEEeEeEEaybBEEEEEaBBBEEEEEEk...........',
      '............kEEEEEEEEabbBEEEEEEEEEEEEEEk............',
      '.............kkEEEEEEaBBBEEEEEEEEEEEEkk.............',
      '...............kkkEEEEEEEEEEEEEEEEkkk...............',
      '..................kkkkkkkkkkkkkkkk..................',
    ]),
  ],
]

export const FINE = {
  rat: refine(RAT),
  goblin: refine(GOBLIN),
  slug: refine(SLUG),
  skeleton: refine(SKELETON),
  larva: refine(LARVA),
  bug: refine(BUG),
  linter: refine(LINTER),
  forker: refine(FORKER),
  turret: refine(TURRET),
  miner: refine(MINER),
  burrower: refine(BURROWER),
  monolith: refine(MONOLITH),
  micro: refine(MICRO),
  sentinel: refine(SENTINEL),
  reviewer: refine(REVIEWER),
  leak: refine(LEAK),
  sniper: refine(SNIPER),
  familiar: refine(FAMILIAR),
  chest: refine(CHEST),
  icons: Object.fromEntries(Object.entries(ICONS).map(([k, s]) => [k, refine(s)])) as Record<string, Fine>,
}
