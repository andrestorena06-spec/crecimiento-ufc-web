// ============================================================
// Recuento de UFC por gota (drop plate) a partir de diluciones seriadas en placa de 96 pocillos.
//   - Cada FILA de la placa de diluciones es una réplica de una muestra.
//   - Cada COLUMNA j (1..12) es la dilución j: la concentración se divide por factor^j respecto del pocillo de partida.
//   - De cada pocillo se siembra una gota de `vol` mL (20 µL = 0,02 mL) y se cuentan las colonias.
//   UFC/mL = colonias / vol × factor^j
// ============================================================
import { LETRAS } from './lectura.js'
import { convertirNumero } from './lectura.js'
import { desvio, finito, interpolar, media } from './analisis.js'

export const ufcDef = () => ({
  vol: 0.02,            // mL por gota
  factor: 5,            // cada columna está `factor` veces más diluida que la anterior
  c0: 1e6,              // UFC/mL esperada en el pocillo de partida a T = 0
  min: 3, max: 30,      // colonias por gota que se consideran contables
  tiempos: [0, 1, 2, 3, 4, 5, 6],
  esperadoDe: 'od',     // 'od' (según la curva de OD) o 'manual'
})

export const ufcVacio = () => ({ par: ufcDef(), layout: [], conteos: {}, esperado: {} })

export const normalizarUfc = (u = {}) => {
  const d = ufcVacio()
  return {
    par: { ...d.par, ...(u.par || {}) },
    layout: Array.isArray(u.layout) ? u.layout : [],
    conteos: u.conteos && typeof u.conteos === 'object' ? u.conteos : {},
    esperado: u.esperado && typeof u.esperado === 'object' ? u.esperado : {},
  }
}

const colDe = (p) => Number(p.slice(1))
const filaDe = (p) => p[0]
export const claveT = (t) => String(Math.round(Number(t) * 1000) / 1000)

// Concentración esperada (UFC/mL) del pocillo de partida a cada tiempo.
//  - 'manual': la importada de la plantilla (o c0 en T = 0)
//  - 'od': c0 × OD(T)/OD(0) con la curva media del experimento (OD ya corregida)
export function esperadoStock(ufc, curva) {
  const out = {}
  const { par, esperado } = ufc
  const ts = par.tiempos
  ts.forEach((t) => {
    const k = claveT(t)
    if (par.esperadoDe === 'manual' && finito(esperado[k])) { out[k] = esperado[k]; return }
    if (par.esperadoDe === 'od' && curva && curva.t.length > 2) {
      const y0 = curva.y[0]
      const yt = interpolar(curva.t, curva.y, [t * 3600])[0]
      if (finito(y0) && y0 > 0 && finito(yt)) { out[k] = par.c0 * (yt / y0); return }
    }
    out[k] = finito(esperado[k]) ? esperado[k] : par.c0
  })
  return out
}

// UFC/mL de una gota con n colonias en la columna j
export const ufcDeGota = (n, j, par) => (n / par.vol) * par.factor ** j
export const coloniasEsperadas = (stock, j, par) => (stock / par.factor ** j) * par.vol
export const contable = (n, par) => finito(n) && n >= par.min && n <= par.max

// Resultados por réplica (fila) y por muestra y tiempo
export function calcularUfc(ufc) {
  const { par, layout, conteos } = ufc
  const muestras = [...new Set(layout.map((c) => c.Muestra))]
  const reps = [], res = []
  const ts = [...new Set([...par.tiempos, ...Object.keys(conteos).map(Number)])].filter(finito).sort((a, b) => a - b)
  for (const t of ts) {
    const cont = conteos[claveT(t)] || {}
    for (const m of muestras) {
      const wells = layout.filter((c) => c.Muestra === m)
      const filas = [...new Set(wells.map((w) => filaDe(w.Pocillo)))].sort()
      const vals = []
      let conDatos = 0
      filas.forEach((f, i) => {
        const ws = wells.filter((w) => filaDe(w.Pocillo) === f).sort((a, b) => colDe(a.Pocillo) - colDe(b.Pocillo))
        const usados = [], todos = []
        ws.forEach((w) => {
          const n = cont[w.Pocillo]
          if (!finito(n)) return
          todos.push(w.Pocillo)
          if (contable(n, par)) usados.push({ p: w.Pocillo, n, u: ufcDeGota(n, colDe(w.Pocillo), par) })
        })
        if (todos.length) conDatos++
        const u = usados.length ? media(usados.map((x) => x.u)) : NaN
        if (finito(u)) vals.push(u)
        reps.push({
          Muestra: m, T_h: t, Fila: f, Replica: i + 1, Conteos: todos.length,
          Diluciones_usadas: usados.map((x) => `-${colDe(x.p)} (${x.n})`).join(', '), UFC_mL: u,
          log10: finito(u) && u > 0 ? Math.log10(u) : NaN,
        })
      })
      const lg = vals.filter((v) => v > 0).map(Math.log10)
      res.push({
        Muestra: m, T_h: t, Replicas: filas.length, Con_conteos: conDatos, N: vals.length,
        UFC_mL: vals.length ? media(vals) : NaN, DE: vals.length > 1 ? desvio(vals) : NaN,
        log10: lg.length ? media(lg) : NaN, DE_log10: lg.length > 1 ? desvio(lg) : NaN,
      })
    }
  }
  return { reps, res, muestras, ts }
}

// ------------------------------------------------------------
// Lectura de una plantilla / planilla de conteos desde Excel (matriz cruda)
//   Bloques «T=<horas>» con: fila de concentración esperada («Conc esperada»), fila de exponentes (-1..-12)
//   y 8 filas A..H. Las celdas con TEXTO son muestras; las celdas con NÚMEROS son conteos de colonias.
// ------------------------------------------------------------
export function leerPlantillaUfc(raw) {
  const re = /^\s*T\s*=\s*([0-9]+(?:[.,][0-9]+)?)\s*$/i
  const layout = new Map()
  const conteos = {}
  const esperado = {}
  const tiempos = []
  for (let r = 0; r < raw.length; r++) {
    let m = null
    for (const c of raw[r]) { m = re.exec(String(c ?? '')); if (m) break }
    if (!m) continue
    const t = convertirNumero(m[1])
    const k = claveT(t)
    tiempos.push(t)
    // concentración esperada del pocillo de partida: primer número de la fila «Conc esperada»
    for (let i = r; i < Math.min(raw.length, r + 5); i++) {
      if (/conc/i.test(String(raw[i][0] ?? ''))) {
        const v = raw[i].slice(1).map(convertirNumero).find(finito)
        if (finito(v)) esperado[k] = v
        break
      }
    }
    for (let i = r + 1, q = 0; i < Math.min(raw.length, r + 22) && q < 8; i++) {
      const cel = raw[i]
      const cl = cel.findIndex((x) => String(x ?? '').trim().toUpperCase() === LETRAS[q])
      if (cl < 0) continue
      const vals = cel.slice(cl + 1, cl + 13)
      vals.forEach((v, j) => {
        const p = LETRAS[q] + (j + 1)
        if (v === '' || v === null || v === undefined) return
        const n = typeof v === 'number' ? v : NaN
        if (finito(n)) {
          if (!conteos[k]) conteos[k] = {}
          conteos[k][p] = n
        } else {
          const txt = String(v).trim()
          if (txt && !layout.has(p)) layout.set(p, txt)   // la distribución se toma del primer bloque que la define
        }
      })
      q++
    }
  }
  if (!tiempos.length) throw new Error('No encontré bloques «T=…» con la placa A..H. Cada bloque empieza con una celda «T=0», «T=1», etc.')
  return {
    layout: [...layout].map(([Pocillo, Muestra]) => ({ Pocillo, Muestra })),
    conteos, esperado, tiempos: [...new Set(tiempos)].sort((a, b) => a - b),
  }
}
