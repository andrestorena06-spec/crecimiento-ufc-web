import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ArchivoTab } from './components/archivo.jsx'
import { PlacaTab } from './components/placa.jsx'
import { PreprocTab } from './components/preproc.jsx'
import { GraficoTab } from './components/grafico.jsx'
import { AnalisisTab } from './components/analisis.jsx'
import { UfcTab } from './components/ufc.jsx'
import { CompararTab } from './components/comparar.jsx'
import { DatosTab, MetodosTab } from './components/datos.jsx'
import { Modal } from './components/ui.jsx'
import { normalizarEjes, normalizarEstilo } from './components/estilo.jsx'
import { ajustesDef } from './ayuda.js'
import { estilosPocillos, paletaMuestras } from './colores.js'
import { hojasDe, leerArchivo } from './motor/lectura.js'
import { analizarTodos, clavePunto, curvaMedia, estadoVacio, preprocesar } from './motor/pipeline.js'
import { calcularUfc, esperadoStock, normalizarUfc, ufcVacio } from './motor/ufc.js'

const CLAVE = 'crecimiento-ufc-v1'

const optsDef = () => ({
  graf: { tmin: '', tmax: '', click: false },
  det: { modo: 'pocillo', pocillo: '', muestra: '', replicas: true, modelo: 'ninguno', fases: true },
  mapa: { param: 'mu_max' },
  modelos: { sel: ['gompertz', 'logistico', 'richards', 'baranyi'] },
  ufc: { sub: 'conteos', t: 0 },
  comp: { exps: null, muestras: null, modo: 'por_exp', od: true, ufc: true, escala: 'log10', error: 'sd' },
})
const optsDe = (x) => {
  const d = optsDef()
  return Object.fromEntries(Object.keys(d).map((k) => [k, { ...d[k], ...(x.opts?.[k] || {}) }]))
}

function cargarGuardado() {
  try { return JSON.parse(localStorage.getItem(CLAVE)) || {} } catch { return {} }
}

// JSON guarda NaN como null: se restituye al leer
const reviveDatos = (d) => (d && d.tiempos && d.pocillos ? {
  tiempos: d.tiempos.map((x) => (x === null ? NaN : x)),
  pocillos: Object.fromEntries(Object.entries(d.pocillos).map(([k, v]) => [k, v.map((x) => (x === null ? NaN : x))])),
} : null)

const nuevoId = () => Math.random().toString(36).slice(2, 10)
const expVacio = (nombre) => ({
  id: nuevoId(), nombre, archivo: null, datos: null, preview: null, config: [], E: estadoVacio(),
  blancosSel: null, selMuestras: null, selReps: {}, ufc: ufcVacio(),
})
const normExp = (x) => ({
  ...expVacio(x.nombre || 'Experimento'), ...x,
  datos: reviveDatos(x.datos), E: { ...estadoVacio(), ...(x.E || {}) }, config: x.config || [], selReps: x.selReps || {},
  ufc: normalizarUfc(x.ufc),
})
const expsDe = (g) => (Array.isArray(g.exps) ? g.exps.map(normExp) : [])

const PESTANAS = [
  ['archivo', 'Archivo', 'Experimentos y sesión'],
  ['placa', 'Configurar pocillos', 'Placa de densidad óptica'],
  ['preproc', 'Preprocesado y QC', 'Blanco, filtros y calidad'],
  ['grafico', 'Gráfico', 'Curvas de crecimiento'],
  ['analisis', 'Análisis', 'μmax, lag, K, modelos'],
  ['ufc', 'Recuento UFC', 'Diluciones y conteos'],
  ['comparar', 'Comparar', 'OD + UFC de todo'],
  ['datos', 'Datos', 'Tablas y Excel'],
  ['metodos', 'Métodos', 'Cómo se calcula'],
]

// Logo: curva de crecimiento con colonias (puntos)
export const LogoCurva = ({ ancho = 40, alto = 30 }) => (
  <svg viewBox="0 0 48 36" width={ancho} height={alto} aria-hidden>
    <path d="M5 4 V31 H45" fill="none" stroke="#ffe3c2" strokeOpacity=".85" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M7 28.5 C16 28.5 18.5 27.5 22.5 19.5 S31 8 43 7" fill="none" stroke="#ffb35c" strokeWidth="2.8" strokeLinecap="round" />
    <circle cx="14" cy="28.3" r="1.7" fill="#ffe3c2" /><circle cx="22.5" cy="19.5" r="1.7" fill="#ffe3c2" /><circle cx="35" cy="9.2" r="1.7" fill="#ffe3c2" />
    <g fill="#ffe3c2" fillOpacity=".9"><circle cx="10" cy="8" r="2.1" /><circle cx="15" cy="6.2" r="1.5" /><circle cx="14.5" cy="11" r="1.7" /></g>
  </svg>
)

const EVACIO = estadoVacio()

export default function App() {
  const g = useMemo(cargarGuardado, [])
  // Si hay un trabajo anterior no se carga solo: se le pregunta a la persona
  const [pendiente, setPendiente] = useState(() => !!(g.exps && g.exps.length))
  const gi = pendiente ? {} : g
  const [tab, setTab] = useState('archivo')
  const [exps, setExps] = useState(() => expsDe(gi))
  const [activeId, setActiveId] = useState(gi.activeId || null)
  const [muestras, setMuestras] = useState(gi.muestras || [])
  const [aj, setAjObj] = useState(() => ({ ...ajustesDef(), ...(gi.aj || {}) }))
  const [estilo, setEstilo] = useState(() => normalizarEstilo(gi.estilo))
  const [ejes, setEjes] = useState(() => normalizarEjes(gi.ejes))
  const [opts, setOpts] = useState(() => optsDe(gi))
  const [modelosRes, setModelosRes] = useState(null)
  const [avisos, setAvisos] = useState([])
  const archivosRef = useRef({})        // id de experimento -> File (solo mientras la pestaña está abierta)
  const arrastrada = useRef(null)
  const [arrastrandoSobre, setArrastrandoSobre] = useState(null)
  const inputExps = useRef()
  const vistas = useRef({})

  const a = exps.find((e) => e.id === activeId) || exps[0] || null
  useEffect(() => { if (a && a.id !== activeId) setActiveId(a.id) }, [a, activeId])

  const avisar = useCallback((texto, tipo = 'ok') => {
    const id = Math.random()
    setAvisos((x) => [...x, { id, texto, tipo }])
    setTimeout(() => setAvisos((x) => x.filter((v) => v.id !== id)), 4200)
  }, [])

  // El trabajo (incluidos los datos de cada Excel) se guarda en el navegador.
  // Mientras se espera la decisión sobre el trabajo anterior no se guarda nada, para no pisarlo.
  useEffect(() => {
    if (pendiente) return
    const t = setTimeout(() => {
      try {
        localStorage.setItem(CLAVE, JSON.stringify({ fecha: new Date().toISOString(), exps, activeId, muestras, aj, estilo, ejes, opts }))
      } catch { /* sin almacenamiento o sin espacio */ }
    }, 400)
    return () => clearTimeout(t)
  }, [pendiente, exps, activeId, muestras, aj, estilo, ejes, opts])

  const aplicarGuardado = (x) => {
    const es = expsDe(x)
    setExps(es)
    setActiveId(x.activeId && es.some((e) => e.id === x.activeId) ? x.activeId : es[0]?.id || null)
    setMuestras(x.muestras || [])
    setAjObj({ ...ajustesDef(), ...(x.aj || {}) })
    setEstilo(normalizarEstilo(x.estilo))
    setEjes(normalizarEjes(x.ejes))
    setOpts(optsDe(x))
    archivosRef.current = {}
  }
  const continuarAnterior = () => { aplicarGuardado(g); setPendiente(false) }
  const empezarDeCero = () => {
    try { localStorage.removeItem(CLAVE) } catch { /* sin almacenamiento */ }
    setPendiente(false)
  }

  // ---------------------------------------------------------------
  // Experimentos
  // ---------------------------------------------------------------
  const upd = useCallback((id, patch) => {
    setExps((es) => es.map((e) => (e.id === id ? { ...e, ...(typeof patch === 'function' ? patch(e) : patch) } : e)))
  }, [])
  const updA = (patch) => { if (a) upd(a.id, patch) }

  const nombreUnico = (base, existentes) => {
    let n = base, i = 2
    while (existentes.includes(n)) n = `${base} (${i++})`
    return n
  }

  // Lee un libro: cada hoja con una placa de curvas se vuelve un experimento
  const leerLibro = async (file) => {
    const { hojas } = await hojasDe(file)
    const lecturas = []
    for (const hoja of hojas) {
      try { lecturas.push({ hoja, l: await leerArchivo(file, hoja) }) } catch (e) { if (hojas.length === 1) throw e }
    }
    if (!lecturas.length) throw new Error('No encontré datos de absorbancia en ninguna hoja.')
    return { hojas, lecturas }
  }

  const cargarArchivos = async (files, idDestino = null) => {
    const nuevos = []
    for (const file of Array.from(files)) {
      try {
        const { hojas, lecturas } = await leerLibro(file)
        const base = file.name.replace(/\.[^.]+$/, '')
        lecturas.forEach(({ hoja, l }) => nuevos.push({ file, hoja, hojas, l, nombre: lecturas.length > 1 ? `${base} · ${hoja}` : base }))
      } catch (e) { avisar(`${file.name}: ${e.message}`, 'error') }
    }
    if (!nuevos.length) return
    const poner = (n, e) => ({
      ...e, archivo: { nombre: n.file.name, hoja: n.hoja, hojas: n.hojas }, datos: n.l.datos, preview: n.l.preview,
      E: estadoVacio(), config: e.config.filter((c) => n.l.datos.pocillos[c.Pocillo]),
    })
    let primero = null
    let resto = nuevos
    if (idDestino) {
      archivosRef.current[idDestino] = nuevos[0].file
      upd(idDestino, (e) => poner(nuevos[0], e))
      primero = idDestino
      resto = nuevos.slice(1)
    }
    const existentes = exps.map((e) => e.nombre)
    const creados = resto.map((n) => {
      const e = poner(n, expVacio(nombreUnico(n.nombre, existentes)))
      archivosRef.current[e.id] = n.file
      existentes.push(e.nombre)
      if (!primero) primero = e.id
      return e
    })
    if (creados.length) setExps((es) => [...es, ...creados])
    setActiveId(primero)
    avisar(nuevos.length === 1 ? `Cargado: ${Object.keys(nuevos[0].l.datos.pocillos).length} pocillos, ${nuevos[0].l.datos.tiempos.length} mediciones.` : `${nuevos.length} experimentos agregados.`)
  }

  const nuevoExperimentoUfc = () => {
    const e = expVacio(nombreUnico('Experimento', exps.map((x) => x.nombre)))
    setExps((es) => [...es, e])
    setActiveId(e.id)
    setTab('ufc')
  }

  const cambiarHoja = async (hoja) => {
    const file = a && archivosRef.current[a.id]
    if (!file) return avisar('Para cambiar de hoja hay que volver a cargar el archivo.', 'error')
    try {
      const l = await leerArchivo(file, hoja)
      upd(a.id, (e) => ({ archivo: { ...e.archivo, hoja }, datos: l.datos, preview: l.preview, E: estadoVacio(), config: e.config.filter((c) => l.datos.pocillos[c.Pocillo]) }))
    } catch (e) { avisar(e.message, 'error') }
  }

  const quitarExp = (id) => {
    const e = exps.find((x) => x.id === id)
    if (e && (e.config.length || Object.keys(e.ufc.conteos).length) && !window.confirm(`Se quitará «${e.nombre}» con su configuración y sus conteos. ¿Continuar?`)) return
    delete archivosRef.current[id]
    setExps((es) => es.filter((x) => x.id !== id))
  }
  const renombrarExp = (id, nombre) => {
    if (!nombre) return avisar('El nombre no puede estar vacío.', 'error')
    if (exps.some((e) => e.id !== id && e.nombre.toLowerCase() === nombre.toLowerCase())) return avisar(`Ya hay un experimento llamado «${nombre}».`, 'error')
    upd(id, { nombre })
  }
  const reordenarExps = (idMovida, idDestino) => {
    if (idMovida === idDestino) return
    setExps((es) => {
      const mov = es.find((p) => p.id === idMovida)
      if (!mov) return es
      const sin = es.filter((p) => p.id !== idMovida)
      const i = sin.findIndex((p) => p.id === idDestino)
      const o = es.findIndex((p) => p.id === idMovida), d = es.findIndex((p) => p.id === idDestino)
      sin.splice(o < d ? i + 1 : i, 0, mov)
      return sin
    })
  }

  // Layout de la placa de densidad óptica: a la placa activa o a todas (solo pocillos con datos en cada una)
  const aplicarLayout = (cfgCrudo, aTodas) => {
    const destinos = aTodas ? exps.filter((e) => e.datos) : a?.datos ? [a] : []
    if (!destinos.length) return avisar('No hay placas con datos para aplicar el layout.', 'error')
    setExps((es) => es.map((e) => {
      if (!destinos.some((d) => d.id === e.id)) return e
      return { ...e, config: cfgCrudo.filter((c) => e.datos.pocillos[c.Pocillo]).map((c) => ({ ...c })), E: estadoVacio() }
    }))
    setMuestras((m) => [...new Set([...m, ...cfgCrudo.map((c) => c.Muestra)])])
    avisar(aTodas ? `Layout aplicado a ${destinos.length} ${destinos.length === 1 ? 'placa' : 'placas'}.` : `Layout importado en «${a.nombre}».`)
  }
  const copiarConfig = () => {
    if (!a) return
    const otras = exps.filter((e) => e.id !== a.id && e.datos)
    if (!otras.length) return avisar('Los demás experimentos no tienen datos de OD.', 'error')
    if (otras.some((e) => e.config.length) && !window.confirm('Los demás experimentos ya tienen configuración. Se va a reemplazar. ¿Continuar?')) return
    setExps((es) => es.map((e) => (e.id === a.id || !e.datos ? e : {
      ...e, config: a.config.filter((c) => e.datos.pocillos[c.Pocillo]).map((c) => ({ ...c })), E: estadoVacio(), blancosSel: a.blancosSel,
    })))
    avisar('Configuración copiada a los demás experimentos.')
  }

  // ---------------------------------------------------------------
  // Datos derivados del experimento activo
  // ---------------------------------------------------------------
  const datos = a?.datos || null
  const config = a?.config || []
  const E = a?.E || EVACIO
  const blancosSel = a ? a.blancosSel : null
  const selMuestrasRaw = a ? a.selMuestras : null
  const selReps = a?.selReps || {}
  const ufc = a?.ufc || ufcVacio()

  const todasMuestras = useMemo(() => {
    const st = new Set(muestras)
    exps.forEach((e) => { e.config.forEach((c) => st.add(c.Muestra)); e.ufc.layout.forEach((c) => st.add(c.Muestra)) })
    return [...st]
  }, [muestras, exps])
  const coloresGlobal = useMemo(() => paletaMuestras(todasMuestras), [todasMuestras])

  const muestrasCfg = useMemo(() => {
    const pres = [...new Set(config.map((c) => c.Muestra))]
    return [...muestras.filter((m) => pres.includes(m)), ...pres.filter((m) => !muestras.includes(m))]
  }, [config, muestras])
  const colores = useMemo(() => estilosPocillos(config), [config])
  const soloBlanco = useMemo(() => muestrasCfg.filter((m) => config.filter((c) => c.Muestra === m).every((c) => c.EsBlanco)), [muestrasCfg, config])
  const selMuestras = selMuestrasRaw ? muestrasCfg.filter((m) => selMuestrasRaw.includes(m)) : (aj.corregir_blanco ? muestrasCfg.filter((m) => !soloBlanco.includes(m)) : muestrasCfg)
  const replicasSel = (m) => {
    const todas = config.filter((c) => c.Muestra === m).map((c) => c.Replica)
    return selReps[m] ? selReps[m].filter((r) => todas.includes(r)) : todas
  }
  const seleccion = useMemo(
    () => config.filter((c) => selMuestras.includes(c.Muestra) && replicasSel(c.Muestra).includes(c.Replica)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config, selMuestras.join('|'), JSON.stringify(selReps)],
  )

  const ajD = useDeferredValue(aj)
  const pre = useMemo(
    () => (datos && config.length ? preprocesar({ datos, config, E, aj: ajD, blancosSel }) : null),
    [datos, config, E, ajD, blancosSel],
  )
  const res = useMemo(() => (pre && !pre.error ? analizarTodos(pre.proc, ajD, E.ventanas) : null), [pre, ajD, E.ventanas])
  useEffect(() => { setModelosRes(null) }, [res, activeId])

  // Recuento de UFC del experimento activo
  const curvaExp = useMemo(() => {
    if (!pre || pre.error) return null
    const ws = pre.proc.filter((w) => !w.EsBlanco)
    return ws.length ? curvaMedia(ws) : null
  }, [pre])
  const ufcRes = useMemo(() => calcularUfc(ufc), [ufc])
  const stock = useMemo(() => esperadoStock(ufc, curvaExp), [ufc, curvaExp])

  // ---------------------------------------------------------------
  // Acciones sobre el experimento activo
  // ---------------------------------------------------------------
  const setAj = (k, v) => {
    if (k === 'corregir_blanco' && v && a && !selMuestrasRaw) {
      updA({ selMuestras: muestrasCfg.filter((m) => !soloBlanco.includes(m)) })
    }
    setAjObj((x) => ({ ...x, [k]: v }))
  }
  const setOpt = (grupo, k, v) => setOpts((o) => ({ ...o, [grupo]: { ...o[grupo], [k]: v } }))
  const setConfig = (c) => { if (a) upd(a.id, (e) => ({ config: typeof c === 'function' ? c(e.config) : c })) }
  const setE = (f) => { if (a) upd(a.id, (e) => ({ E: f(e.E) })) }
  const setUfc = (f) => { if (a) upd(a.id, (e) => ({ ufc: typeof f === 'function' ? f(e.ufc) : f })) }

  const borrarMuestra = (m) => {
    const n = exps.reduce((t, e) => t + e.config.filter((c) => c.Muestra === m).length + e.ufc.layout.filter((c) => c.Muestra === m).length, 0)
    if (n > 0 && !window.confirm(`La muestra '${m}' está asignada a ${n} pocillo(s) en total. Si la borrás, esos pocillos quedan sin asignar. ¿Continuar?`)) return
    setMuestras(muestras.filter((x) => x !== m))
    setExps((es) => es.map((e) => ({ ...e, config: e.config.filter((c) => c.Muestra !== m), ufc: { ...e.ufc, layout: e.ufc.layout.filter((c) => c.Muestra !== m) } })))
  }
  const renombrarMuestra = (viejo, nuevo) => {
    if (!nuevo) return avisar('El nombre no puede estar vacío.', 'error')
    if (muestras.some((m) => m !== viejo && m.toLowerCase() === nuevo.toLowerCase())) return avisar(`Ya existe una muestra llamada '${nuevo}'.`, 'error')
    setMuestras(muestras.map((m) => (m === viejo ? nuevo : m)))
    setExps((es) => es.map((e) => ({
      ...e,
      config: e.config.map((c) => (c.Muestra === viejo ? { ...c, Muestra: nuevo } : c)),
      ufc: { ...e.ufc, layout: e.ufc.layout.map((c) => (c.Muestra === viejo ? { ...c, Muestra: nuevo } : c)) },
      selMuestras: e.selMuestras ? e.selMuestras.map((m) => (m === viejo ? nuevo : m)) : e.selMuestras,
      selReps: e.selReps[viejo] ? { ...Object.fromEntries(Object.entries(e.selReps).filter(([k]) => k !== viejo)), [nuevo]: e.selReps[viejo] } : e.selReps,
    })))
  }

  // Exclusión de puntos y pocillos
  const alternarPunto = (k) => {
    const [p] = k.split('|')
    setE((e) => {
      if (e.puntosExcl.includes(k)) return { ...e, puntosExcl: e.puntosExcl.filter((x) => x !== k) }
      if (e.forzados.includes(k)) return { ...e, forzados: e.forzados.filter((x) => x !== k) }
      const w = pre?.marcado?.find((x) => x.Pocillo === p)
      const f = w?.filas.find((q) => clavePunto(p, q.t) === k)
      if (f && f.marca) return { ...e, forzados: [...e.forzados, k] }
      return { ...e, puntosExcl: [...e.puntosExcl, k] }
    })
  }
  const excluirPocillos = (ps) => setE((e) => ({ ...e, pocillosExcl: [...new Set([...e.pocillosExcl, ...ps])] }))
  const reincorporarPocillos = (ps) => {
    setE((e) => ({ ...e, pocillosExcl: e.pocillosExcl.filter((p) => !ps.includes(p)) }))
    if (ps.some((p) => pre?.auto?.includes(p))) avisar('Algunos pocillos siguen excluidos por el criterio automático. Desactivá la exclusión automática para reincorporarlos.', 'error')
  }
  const alternarPocilloCompleto = (p) => setE((e) => ({ ...e, pocillosExcl: e.pocillosExcl.includes(p) ? e.pocillosExcl.filter((x) => x !== p) : [...e.pocillosExcl, p] }))
  const reincorporarPocillo = (p) => setE((e) => {
    const w = pre?.marcado?.find((x) => x.Pocillo === p)
    const marc = w ? w.filas.filter((f) => f.motivo).map((f) => clavePunto(p, f.t)) : []
    return { ...e, puntosExcl: e.puntosExcl.filter((k) => !k.startsWith(p + '|')), forzados: [...new Set([...e.forzados, ...marc])] }
  })
  const excluirRango = (p, desde, hasta) => {
    if (!(desde <= hasta)) return avisar("'Desde' tiene que ser menor o igual que 'Hasta'.", 'error')
    const ys = datos.pocillos[p] || []
    const nuevos = datos.tiempos.filter((t, i) => Number.isFinite(ys[i]) && t / 3600 >= desde && t / 3600 <= hasta).map((t) => clavePunto(p, t))
    if (!nuevos.length) return avisar('No hay puntos de ese pocillo en ese rango.', 'error')
    setE((e) => ({ ...e, puntosExcl: [...new Set([...e.puntosExcl, ...nuevos])] }))
    avisar(`${nuevos.length} puntos excluidos en ${p}`)
  }
  const reincorporarPuntos = (ks) => setE((e) => ({ ...e, puntosExcl: e.puntosExcl.filter((k) => !ks.includes(k)) }))
  const reincorporarTodosPuntos = () => setE((e) => ({ ...e, puntosExcl: [], forzados: [] }))

  const aplicarVentana = (claves, rango) => setE((e) => {
    const v = { ...e.ventanas }
    claves.forEach((c) => { v[c] = [rango[0], rango[1]] })
    return { ...e, ventanas: v }
  })
  const quitarVentanas = (claves) => setE((e) => {
    if (!claves) return { ...e, ventanas: {} }
    const v = { ...e.ventanas }
    claves.forEach((c) => { delete v[c] })
    return { ...e, ventanas: v }
  })

  // Sesión
  const exportarSesion = () => ({ version: 1, tipo: 'crecimiento-ufc', fecha: new Date().toISOString(), exps, activeId: a?.id || null, muestras, aj, estilo, ejes, opts })
  const importarSesion = (x) => {
    if (!Array.isArray(x?.exps)) throw new Error('inválida')
    aplicarGuardado(x)
  }
  const onVista = useCallback((id, v) => { vistas.current[id] = v }, [])

  const s = {
    // experimentos
    exps, a, setActiva: setActiveId, cargarArchivos, nuevoExperimentoUfc, quitarExp, renombrarExp, reordenarExps, copiarConfig,
    tieneArchivo: !!(a && archivosRef.current[a.id]), cambiarHoja, aplicarLayout,
    // experimento activo (así las pestañas de curvas funcionan igual que en la app de una sola placa)
    archivo: a?.archivo || null, datos, preview: a?.preview || null,
    muestras, setMuestras, muestrasCfg, config, setConfig, colores, coloresGlobal, todasMuestras, borrarMuestra, renombrarMuestra,
    E, aj, setAj, opts, setOpt, estilo, setEstilo, ejes, setEjes,
    blancosSel, setBlancosSel: (b) => updA({ blancosSel: b }),
    selMuestras, setSelMuestras: (x) => updA({ selMuestras: x }), replicasSel,
    setRepsDe: (m, arr) => updA((e) => ({ selReps: { ...e.selReps, [m]: arr } })),
    seleccion, pre, res, modelosRes, setModelosRes, onVista, avisar,
    alternarPunto, excluirPocillos, reincorporarPocillos, alternarPocilloCompleto, reincorporarPocillo, excluirRango,
    reincorporarPuntos, reincorporarTodosPuntos, aplicarVentana, quitarVentanas,
    // UFC
    ufc, setUfc, ufcRes, stock, curvaExp,
    exportarSesion, importarSesion,
  }

  const Vista = { archivo: ArchivoTab, placa: PlacaTab, preproc: PreprocTab, grafico: GraficoTab, analisis: AnalisisTab, ufc: UfcTab, comparar: CompararTab, datos: DatosTab, metodos: MetodosTab }[tab]

  return (
    <div className="app">
      <nav className="barra">
        <div className="marca">
          <div className="logo"><LogoCurva /></div>
          <div><b>Crecimiento y UFC</b><small>Curvas de OD + recuento</small></div>
        </div>
        {PESTANAS.map(([id, t, d], i) => (
          <button key={id} className={`nav ${tab === id ? 'activa' : ''}`} onClick={() => setTab(id)}>
            <span className="num">{i + 1}</span>
            <span><b>{t}</b><small>{d}</small></span>
          </button>
        ))}
        <div className="pie-nav">
          {res?.length > 0 && <div className="chip-odc">{res.length} curvas analizadas</div>}
          <small>{a ? a.nombre : 'Sin experimentos'}</small>
        </div>
      </nav>
      <main className="contenido">
        <div className="barra-placas">
          {exps.map((p) => (
            <div key={p.id} role="tab" tabIndex={0} aria-selected={p.id === a?.id}
              className={`chip-placa ${p.id === a?.id ? 'activa' : ''} ${arrastrandoSobre === p.id ? 'sobre' : ''}`}
              draggable
              onDragStart={(e) => { arrastrada.current = p.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id) }}
              onDragOver={(e) => { if (arrastrada.current) { e.preventDefault(); setArrastrandoSobre(p.id) } }}
              onDragLeave={() => setArrastrandoSobre((v) => (v === p.id ? null : v))}
              onDrop={(e) => { e.preventDefault(); if (arrastrada.current) reordenarExps(arrastrada.current, p.id); arrastrada.current = null; setArrastrandoSobre(null) }}
              onDragEnd={() => { arrastrada.current = null; setArrastrandoSobre(null) }}
              onClick={() => setActiveId(p.id)} title="Clic para ver este experimento · arrastrá para cambiar el orden · doble clic para renombrar"
              onDoubleClick={() => { const n = window.prompt('Nombre del experimento', p.nombre); if (n !== null) renombrarExp(p.id, n.trim()) }}>
              <i className="punto-placa" style={{ background: '#d9731f' }} />
              <span className="nombre-placa">{p.nombre}</span>
              {!p.datos && <small className="sin-datos-placa">sin OD</small>}
              <button className="x-placa" aria-label={`Quitar ${p.nombre}`} onClick={(e) => { e.stopPropagation(); quitarExp(p.id) }}>×</button>
            </div>
          ))}
          <button className="agregar-placa" onClick={() => inputExps.current.click()}>+ Agregar Excel</button>
          <button className="agregar-placa" onClick={nuevoExperimentoUfc}>+ Experimento solo UFC</button>
          <input ref={inputExps} type="file" multiple hidden accept=".xlsx"
            onChange={(e) => { cargarArchivos(e.target.files); e.target.value = '' }} />
        </div>
        <Vista s={s} />
      </main>
      {pendiente && (
        <Modal titulo="Encontré trabajo anterior" ancho={540}
          pie={<>
            <button onClick={empezarDeCero}>Empezar de cero</button>
            <button className="primario" onClick={continuarAnterior}>Continuar con lo anterior</button>
          </>}>
          <p>
            En este navegador quedó guardado un trabajo
            {g.fecha ? <> del <b>{new Date(g.fecha).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })}</b></> : ''}:
          </p>
          <ul className="resumen-guardado">
            {g.exps.map((p) => (
              <li key={p.id}><b>{p.nombre}</b> <small>{p.datos ? `${Object.keys(p.datos.pocillos).length} pocillos de OD` : 'sin OD'} · {p.config?.length || 0} configurados · {Object.values(p.ufc?.conteos || {}).reduce((n, o) => n + Object.keys(o).length, 0)} conteos de UFC</small></li>
            ))}
          </ul>
          <p className="ayuda">«Continuar con lo anterior» recupera todo tal como lo dejaste. «Empezar de cero» borra ese trabajo guardado del navegador y arranca vacío (si querés conservarlo antes, cargá un archivo de sesión que hayas descargado).</p>
        </Modal>
      )}
      <div className="toasts">{avisos.map((x) => <div key={x.id} className={`toast ${x.tipo}`}>{x.texto}</div>)}</div>
    </div>
  )
}
