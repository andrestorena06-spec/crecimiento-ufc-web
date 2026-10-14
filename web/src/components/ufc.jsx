import { ACEPTA_LIBRO } from '../libro.js'
import { useMemo, useRef, useState } from 'react'
import { LineChart } from './charts.jsx'
import { Campo, Check, Num, Panel, Select } from './ui.jsx'
import { PlacaTab, Vacio } from './placa.jsx'
import { TablaAvanzada } from './tabla.jsx'
import { estiloCurvaDefecto, ejesDefecto } from './estilo.jsx'
import { signif } from '../ayuda.js'
import { finito } from '../motor/analisis.js'
import { hojasDe, LETRAS, leerCrudo } from '../motor/lectura.js'
import { claveT, coloniasEsperadas, contable, leerPlantillaUfc } from '../motor/ufc.js'
import { descargarBlob, fmt } from '../utils.js'
import { excelMatriz } from '../excel.js'

const sci = (x) => (finito(x) ? x.toExponential(1).replace('e+', 'E+').replace('e-', 'E-') : '–')
const COLS = Array.from({ length: 12 }, (_, i) => i + 1)

const fondoCelda = (n, par) => {
  if (!finito(n)) return undefined
  if (contable(n, par)) return '#e3f1dc'
  if (n > par.max) return '#f8d9d6'
  if (n === 0) return '#efece6'
  return '#fbf0cf'
}

// ---------------------------------------------------------------
// Grilla de conteos de un tiempo
// ---------------------------------------------------------------
function GrillaConteos({ s, t }) {
  const { ufc, stock, ufcRes } = s
  const par = ufc.par
  const k = claveT(t)
  const cont = ufc.conteos[k] || {}
  const de = Object.fromEntries(ufc.layout.map((c) => [c.Pocillo, c.Muestra]))
  const st = stock[k]
  const refs = useRef({})

  const poner = (mapa) => s.setUfc((u) => {
    const actual = { ...(u.conteos[k] || {}) }
    Object.entries(mapa).forEach(([p, v]) => { if (v === null) delete actual[p]; else actual[p] = v })
    return { ...u, conteos: { ...u.conteos, [k]: actual } }
  })
  const enfocar = (f, c) => { const el = refs.current[LETRAS[f] + c]; if (el) { el.focus(); el.select() } }
  const tecla = (e, f, c) => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); enfocar(Math.min(f + 1, 7), c) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); enfocar(Math.max(f - 1, 0), c) }
    else if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) { e.preventDefault(); enfocar(f, Math.min(c + 1, 12)) }
    else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) { e.preventDefault(); enfocar(f, Math.max(c - 1, 1)) }
  }
  // pegar un bloque copiado de Excel a partir de la celda elegida
  const pegar = (e, f, c) => {
    const txt = e.clipboardData.getData('text')
    if (!/[\t\n]/.test(txt.trim())) return
    e.preventDefault()
    const mapa = {}
    txt.trim().split(/\r?\n/).forEach((fila, i) => fila.split('\t').forEach((v, j) => {
      const ff = f + i, cc = c + j
      if (ff > 7 || cc > 12) return
      const p = LETRAS[ff] + cc
      if (!de[p]) return
      const n = Number(String(v).trim().replace(',', '.'))
      if (String(v).trim() === '') mapa[p] = null
      else if (Number.isFinite(n) && n >= 0) mapa[p] = n
    }))
    poner(mapa)
  }

  const repDe = (L) => s.ufcRes.reps.find((r) => r.Fila === L && r.T_h === t)
  const muestraDe = (L) => ufc.layout.find((c) => c.Pocillo[0] === L)?.Muestra

  return (
    <div className="placa-wrap">
      <table className="grilla-ufc">
        <thead>
          <tr>
            <th />
            <th className="cab-fila">Muestra</th>
            {COLS.map((c) => (
              <th key={c} title={`Dilución ${par.factor}^${c}`}>
                <b>−{c}</b>
                <small>{sci(st / par.factor ** c)}</small>
              </th>
            ))}
            <th className="cab-fila">UFC/mL</th>
          </tr>
        </thead>
        <tbody>
          {LETRAS.map((L, f) => {
            const r = repDe(L)
            const muestra = muestraDe(L)
            const color = muestra ? s.coloresGlobal[muestra] : null
            return (
              <tr key={L}>
                <th>{L}</th>
                <td className="nombre-fila">{muestra ? <><i className="punto-color" style={{ background: color }} />{muestra}</> : <span className="ayuda">sin muestra</span>}</td>
                {COLS.map((c) => {
                  const p = L + c
                  const n = cont[p]
                  const activo = !!de[p]
                  return (
                    <td key={p} style={{ background: fondoCelda(n, par) }}>
                      <input ref={(el) => { refs.current[p] = el }} type="number" min="0" step="1" disabled={!activo}
                        value={finito(n) ? n : ''} placeholder={finito(st) ? String(Number(coloniasEsperadas(st, c, par).toPrecision(2))) : ''}
                        title={activo ? `${p} · ${de[p]}` : 'Definí la muestra de este pocillo en «Distribución»'}
                        onChange={(e) => { const v = e.target.value; poner({ [p]: v === '' ? null : Math.max(0, Math.round(Number(v))) }) }}
                        onKeyDown={(e) => tecla(e, f, c)} onPaste={(e) => pegar(e, f, c)} />
                    </td>
                  )
                })}
                <td className="res-fila">{r && finito(r.UFC_mL) ? sci(r.UFC_mL) : '–'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="ayuda">
        Escribí cuántas colonias salieron en la gota de cada pocillo (el número gris es lo esperado según la concentración estimada).
        <span className="leyenda-ufc"><i style={{ background: '#e3f1dc' }} /> contable ({par.min}–{par.max})</span>
        <span className="leyenda-ufc"><i style={{ background: '#fbf0cf' }} /> pocas</span>
        <span className="leyenda-ufc"><i style={{ background: '#f8d9d6' }} /> demasiadas</span>
        {' '}Se pueden pegar bloques copiados de Excel; Enter y las flechas mueven entre celdas.
      </p>
    </div>
  )
}

// ---------------------------------------------------------------
// Distribución de muestras en la placa de diluciones
// ---------------------------------------------------------------
function Distribucion({ s }) {
  const [filas, setFilas] = useState({})
  const todas = [...new Set([...s.muestras, ...s.todasMuestras])]
  const set = (config) => s.setUfc((u) => ({ ...u, layout: config.map((c) => ({ Pocillo: c.Pocillo, Muestra: c.Muestra })) }))
  const stub = {
    datos: { pocillos: Object.fromEntries(LETRAS.flatMap((L) => COLS.map((c) => [L + c, true]))) },
    config: s.ufc.layout.map((c) => ({ ...c, Replica: 1, EsBlanco: false })),
    setConfig: (c) => set(typeof c === 'function' ? c(s.ufc.layout) : c),
    muestras: s.muestras, setMuestras: s.setMuestras, avisar: s.avisar,
    colores: { porPocillo: Object.fromEntries(s.ufc.layout.map((c) => [c.Pocillo, { color: s.coloresGlobal[c.Muestra] || '#999' }])) },
    sinReplicas: true, sinBlanco: true,
    tituloPlaca: 'Placa de diluciones: muestras',
    ayudaPlaca: 'Hacé clic en un pocillo, o clic y arrastrá para seleccionar varios, y elegí la muestra. Cada FILA es una réplica de la muestra y cada COLUMNA una dilución. Para asignar filas enteras podés usar el atajo de abajo.',
  }
  const aplicar = () => {
    const nuevos = []
    LETRAS.forEach((L) => { const m = filas[L]; if (m) COLS.forEach((c) => nuevos.push({ Pocillo: L + c, Muestra: m })) })
    if (!nuevos.length) return s.avisar('Elegí al menos una muestra para alguna fila.', 'error')
    const nuevas = [...new Set(nuevos.map((x) => x.Muestra))].filter((m) => !s.muestras.includes(m))
    if (nuevas.length) s.setMuestras([...s.muestras, ...nuevas])
    const filasDef = new Set(Object.keys(filas).filter((L) => filas[L]))
    s.setUfc((u) => ({ ...u, layout: [...u.layout.filter((c) => !filasDef.has(c.Pocillo[0])), ...nuevos] }))
    s.avisar('Muestras asignadas por fila.')
  }
  return (
    <>
      <section className="tarjeta" style={{ marginBottom: 14 }}>
        <h2>Atajo: una muestra por fila</h2>
        <div className="fila-ctrl">
          {LETRAS.map((L) => (
            <Campo key={L} label={`Fila ${L}`}>
              <select value={filas[L] ?? ''} onChange={(e) => setFilas({ ...filas, [L]: e.target.value })}>
                <option value="">(sin cambio)</option>
                {todas.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </Campo>
          ))}
        </div>
        <div className="fila-ctrl">
          <button className="primario" onClick={aplicar}>Aplicar a las 12 columnas de cada fila</button>
          <button onClick={() => setFilas({ A: todas[0], B: todas[1], C: todas[0], D: todas[1], E: todas[0], F: todas[1], G: todas[0], H: todas[1] })} disabled={todas.length < 2}>Alternar las dos primeras muestras</button>
          <button className="peligro" onClick={() => s.setUfc((u) => ({ ...u, layout: [] }))} disabled={!s.ufc.layout.length}>Vaciar la placa</button>
        </div>
      </section>
      <PlacaTab s={stub} />
    </>
  )
}

// ---------------------------------------------------------------
// Resultados
// ---------------------------------------------------------------
function Resultados({ s }) {
  const { reps, res } = s.ufcRes
  const filasRes = useMemo(() => res.filter((r) => r.Con_conteos > 0).map((r) => ({
    Muestra: r.Muestra, T_h: r.T_h, Replicas_con_conteos: r.Con_conteos, Replicas_validas: r.N,
    UFC_mL: finito(r.UFC_mL) ? signif(r.UFC_mL, 4) : null, DE: finito(r.DE) ? signif(r.DE, 3) : null,
    log10_UFC_mL: finito(r.log10) ? signif(r.log10, 4) : null, DE_log10: finito(r.DE_log10) ? signif(r.DE_log10, 3) : null,
  })), [res])
  const filasRep = useMemo(() => reps.filter((r) => r.Conteos > 0).map((r) => ({
    Muestra: r.Muestra, T_h: r.T_h, Fila: r.Fila, Diluciones_usadas: r.Diluciones_usadas || '(ninguna contable)',
    UFC_mL: finito(r.UFC_mL) ? signif(r.UFC_mL, 4) : null, log10_UFC_mL: finito(r.log10) ? signif(r.log10, 4) : null,
  })), [reps])
  if (!filasRes.length) return <Vacio texto="Todavía no hay conteos cargados. Escribí las colonias en la pestaña «Conteos»." />
  const porM = {}
  res.filter((r) => finito(r.log10)).forEach((r) => { (porM[r.Muestra] ||= []).push(r) })
  const series = Object.entries(porM).map(([m, rs]) => ({
    id: m, nombre: m, color: s.coloresGlobal[m] || '#555', puntos: true, radio: 4.5, grosor: 1.6, errores: true,
    data: rs.sort((a, b) => a.T_h - b.T_h).map((r) => ({ x: r.T_h, y: r.log10, err: r.DE_log10, tip: `${m}\nT = ${r.T_h} h\nlog10 UFC/mL = ${r.log10.toFixed(2)}${finito(r.DE_log10) ? ` ± ${r.DE_log10.toFixed(2)}` : ''}\nUFC/mL = ${sci(r.UFC_mL)}\n${r.N} réplicas válidas` })),
  }))
  const est = estiloCurvaDefecto()
  est.titulo.texto = ''
  const vals = series.flatMap((x) => x.data.flatMap((d) => [d.y - (d.err || 0), d.y + (d.err || 0)]))
  const xs = series.flatMap((x) => x.data.map((d) => d.x))
  const a = vals.length ? Math.min(...vals) : 0, b = vals.length ? Math.max(...vals) : 1
  const pad = (b - a) * 0.1 || 0.3
  const x0 = Math.min(...xs), x1 = Math.max(...xs)
  return (
    <>
      {series.length > 0 && (
        <LineChart series={series} xlim={[x0 - 0.3, x1 + 0.3]} ylim={[a - pad, b + pad]} est={est} ejes={ejesDefecto()}
          xTxt="Tiempo (h)" yTxt="log10 UFC/mL (media ± DE de las réplicas)" altoBase={320} />
      )}
      <p className="ayuda">Cada punto es la media de las réplicas (filas) de la muestra; de cada réplica se usan las diluciones con {s.ufc.par.min} a {s.ufc.par.max} colonias por gota. La barra es la desviación estándar entre réplicas en escala log10.</p>
      <TablaAvanzada id="ufc_muestras" titulo="UFC/mL por muestra y tiempo" columnas={Object.keys(filasRes[0])} filas={filasRes} onVista={s.onVista} />
      <TablaAvanzada id="ufc_replicas" titulo="UFC/mL por réplica (fila de la placa)" columnas={Object.keys(filasRep[0] || { Muestra: 1 })} filas={filasRep} onVista={s.onVista} />
    </>
  )
}

// ===============================================================
// RECUENTO DE UFC
// ===============================================================
export function UfcTab({ s }) {
  const importRef = useRef()
  if (!s.a) return <Vacio texto="Cargá un Excel con la curva de OD o creá un experimento solo para el recuento de UFC (arriba, «+ Experimento solo UFC»)." />
  const { ufc } = s
  const par = ufc.par
  const o = s.opts.ufc
  const setO = (k, v) => s.setOpt('ufc', k, v)
  const setPar = (k, v) => s.setUfc((u) => ({ ...u, par: { ...u.par, [k]: v } }))
  const ts = [...par.tiempos].sort((a, b) => a - b)
  const t = ts.includes(Number(o.t)) ? Number(o.t) : ts[0]
  const k = claveT(t)

  const agregarTiempo = () => {
    const v = window.prompt('Tiempo en horas (por ejemplo 7 o 7.5)')
    if (v === null) return
    const n = Number(String(v).replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return s.avisar('Tiempo inválido.', 'error')
    if (ts.includes(n)) return s.avisar('Ese tiempo ya existe.', 'error')
    setPar('tiempos', [...ts, n].sort((a, b) => a - b))
    setO('t', n)
  }
  const quitarTiempo = () => {
    if (ts.length < 2) return
    const n = Object.keys(ufc.conteos[k] || {}).length
    if (n && !window.confirm(`T=${t} h tiene ${n} conteos cargados. Si lo quitás se borran. ¿Continuar?`)) return
    s.setUfc((u) => { const c = { ...u.conteos }; delete c[k]; return { ...u, conteos: c, par: { ...u.par, tiempos: u.par.tiempos.filter((x) => x !== t) } } })
  }

  // Importa una planilla: distribución de muestras (celdas con texto), conteos (celdas con números) y concentración esperada
  const importar = async (file) => {
    try {
      const { hojas } = await hojasDe(file)
      const L = new Map(), cont = {}, esp = {}, tiempos = new Set()
      let ok = 0
      for (const h of hojas) {
        try {
          const r = leerPlantillaUfc(await leerCrudo(file, h))
          ok++
          r.layout.forEach((c) => { if (!L.has(c.Pocillo)) L.set(c.Pocillo, c.Muestra) })
          Object.entries(r.conteos).forEach(([kk, o2]) => { cont[kk] = { ...(cont[kk] || {}), ...o2 } })
          Object.assign(esp, r.esperado)
          r.tiempos.forEach((x) => tiempos.add(x))
        } catch { /* hoja sin bloques */ }
      }
      if (!ok) throw new Error('No encontré bloques «T=…» con la placa A..H en ninguna hoja.')
      const nuevas = [...new Set([...L.values()])].filter((m) => !s.muestras.includes(m))
      if (nuevas.length) s.setMuestras([...s.muestras, ...nuevas])
      s.setUfc((u) => ({
        ...u,
        layout: L.size ? [...L].map(([Pocillo, Muestra]) => ({ Pocillo, Muestra })) : u.layout,
        conteos: { ...u.conteos, ...Object.fromEntries(Object.entries(cont).map(([kk, v]) => [kk, { ...(u.conteos[kk] || {}), ...v }])) },
        esperado: { ...u.esperado, ...esp },
        par: { ...u.par, tiempos: [...new Set([...u.par.tiempos, ...tiempos])].sort((a, b) => a - b), esperadoDe: Object.keys(esp).length && !s.datos ? 'manual' : u.par.esperadoDe },
      }))
      const nC = Object.values(cont).reduce((n, v) => n + Object.keys(v).length, 0)
      s.avisar(`Planilla importada: ${L.size} pocillos con muestra, ${nC} conteos, ${tiempos.size} tiempos${Object.keys(esp).length ? ', concentración esperada' : ''}.`)
    } catch (e) { s.avisar(e.message, 'error') }
  }

  const exportar = async () => {
    const bloques = (conNombres) => {
      const m = []
      const de = Object.fromEntries(ufc.layout.map((c) => [c.Pocillo, c.Muestra]))
      ts.forEach((tt) => {
        const kk = claveT(tt)
        const st = s.stock[kk]
        m.push([`T=${tt}`, finito(st) ? Number(Math.log10(st).toFixed(2)) : '', ...COLS.map((c) => (finito(st) ? Math.round(st / par.factor ** c) : ''))])
        m.push(['Conc esperada', finito(st) ? st : '', ...COLS.map((c) => (finito(st) ? st / par.factor ** c : ''))])
        m.push(['', '', ...COLS.map((c) => -c)])
        LETRAS.forEach((L) => m.push(['', L, ...COLS.map((c) => {
          const p = L + c
          if (conNombres) return de[p] || ''
          const n = (ufc.conteos[kk] || {})[p]
          return finito(n) ? n : ''
        })]))
        m.push([])
      })
      return m
    }
    const b = await excelMatriz([{ nombre: 'Distribucion', matriz: bloques(true) }, { nombre: 'Conteos', matriz: bloques(false) }])
    descargarBlob(b, `recuento_ufc_${(s.a.nombre || 'experimento').replace(/[^\w-]+/g, '_')}.xlsx`)
  }

  const sub = o.sub
  return (
    <div className="con-lateral">
      <Panel titulo="Recuento de UFC">
        <p className="ayuda">Siembra de gotas sobre agar a partir de diluciones seriadas en una placa de 96 pocillos. <b>UFC/mL = colonias ÷ volumen de la gota × factor^columna</b>.</p>
        <Campo label="Volumen de la gota (µL)"><Num value={par.vol * 1000} min={1} step={1} onChange={(v) => setPar('vol', v === '' ? 0.02 : v / 1000)} /></Campo>
        <Campo label="Factor de dilución entre columnas"><Num value={par.factor} min={1.1} step={0.5} onChange={(v) => setPar('factor', v === '' ? 5 : v)} /></Campo>
        <Campo label="UFC/mL esperadas en el pocillo de partida a T=0"><Num value={par.c0} min={1} step={100000} onChange={(v) => setPar('c0', v === '' ? 1e6 : v)} /></Campo>
        <div className="fila-ctrl">
          <Campo label="Contable desde"><Num value={par.min} min={1} onChange={(v) => setPar('min', v === '' ? 3 : v)} /></Campo>
          <Campo label="hasta (colonias/gota)"><Num value={par.max} min={2} onChange={(v) => setPar('max', v === '' ? 30 : v)} /></Campo>
        </div>
        <Campo label="Concentración esperada en cada hora">
          <Select value={par.esperadoDe} onChange={(v) => setPar('esperadoDe', v)}
            opciones={[['od', 'Según la curva de OD (c0 × OD(T)/OD(0))'], ['manual', 'La de la planilla importada']]} />
        </Campo>
        <p className="ayuda">La concentración esperada solo sirve de guía (números grises) para saber qué diluciones van a ser contables; <b>no entra en el cálculo</b>.</p>
        <h3>Planilla de Excel</h3>
        <p className="ayuda">Podés importar una planilla con bloques «T=0, T=1…» (muestras por pocillo, concentración esperada y, si ya los tiene, los conteos).</p>
        <div className="fila-ctrl">
          <button onClick={() => importRef.current.click()}>Importar planilla (.xlsx)</button>
          <button onClick={exportar} disabled={!ufc.layout.length}>Exportar a Excel</button>
        </div>
        <input ref={importRef} type="file" hidden accept={ACEPTA_LIBRO} onChange={(e) => { e.target.files[0] && importar(e.target.files[0]); e.target.value = '' }} />
      </Panel>
      <div className="principal">
        <div className="subtabs">
          {[['conteos', 'Conteos por hora'], ['dist', 'Distribución de muestras'], ['res', 'Resultados']].map(([id, tt]) => (
            <button key={id} className={sub === id ? 'on' : ''} onClick={() => setO('sub', id)}>{tt}</button>
          ))}
        </div>
        {sub === 'conteos' && (
          !ufc.layout.length ? (
            <Vacio texto="Primero definí qué muestra hay en cada pocillo de la placa de diluciones (pestaña «Distribución de muestras») o importá la planilla." />
          ) : (
            <>
              <div className="fila-ctrl">
                {ts.map((x) => <button key={x} className={`chip-t ${x === t ? 'on' : ''}`} onClick={() => setO('t', x)}>T={x} h</button>)}
                <button className="chico" onClick={agregarTiempo}>+ Tiempo</button>
                <button className="chico peligro" onClick={quitarTiempo} disabled={ts.length < 2}>Quitar T={t}</button>
              </div>
              <p className="ayuda">Concentración esperada en el pocillo de partida a T={t} h: <b>{sci(s.stock[k])} UFC/mL</b> (log10 = {finito(s.stock[k]) ? Math.log10(s.stock[k]).toFixed(2) : '–'}) · {par.esperadoDe === 'od' && s.curvaExp ? 'estimada con la curva de OD' : 'valor cargado'}.</p>
              <GrillaConteos s={s} t={t} />
            </>
          )
        )}
        {sub === 'dist' && <Distribucion s={s} />}
        {sub === 'res' && <Resultados s={s} />}
      </div>
    </div>
  )
}
