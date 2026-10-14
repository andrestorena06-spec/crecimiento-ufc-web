import { ACEPTA_LIBRO } from '../libro.js'
import { useRef, useState } from 'react'
import { Campo, Modal, Select } from './ui.jsx'
import { aCSV, descargarBlob, descargarTexto, fmt, pocillos96 } from '../utils.js'

const nConteos = (u) => Object.values(u.conteos).reduce((n, o) => n + Object.keys(o).length, 0)

// ===============================================================
// ARCHIVO: experimentos (cada uno con su curva de OD y su recuento de UFC), muestras, sesión y layout
// ===============================================================
export function ArchivoTab({ s }) {
  const [nueva, setNueva] = useState('')
  const [edit, setEdit] = useState(null)
  const [cargando, setCargando] = useState(false)
  const inputRef = useRef()
  const destinoRef = useRef(null)      // experimento al que se le asigna la curva de OD (si venía sin ella)
  const sesionRef = useRef()
  const layoutRef = useRef()
  const destinoLayout = useRef(false)  // true = el CSV va a todos los experimentos

  const abrir = async (files, idDestino = null) => {
    if (!files || !files.length) return
    setCargando(true)
    await s.cargarArchivos(files, idDestino)
    setCargando(false)
  }

  const exportarLayout = () => {
    const filas = [...s.config].sort((x, y) => pocillos96().indexOf(x.Pocillo) - pocillos96().indexOf(y.Pocillo))
      .map((c) => ({ Pocillo: c.Pocillo, Muestra: c.Muestra, Replica: c.Replica, Blanco: c.EsBlanco ? 1 : 0 }))
    descargarTexto(aCSV(filas, ['Pocillo', 'Muestra', 'Replica', 'Blanco']), 'layout_placa_od.csv')
  }

  const importarLayout = async (file, aTodas) => {
    const txt = (await file.text()).replace(/^﻿/, '')
    const lineas = txt.split(/\r?\n/).filter(Boolean)
    if (!lineas.length) return s.avisar('El archivo está vacío.', 'error')
    const sep = lineas[0].includes(';') ? ';' : lineas[0].includes('\t') ? '\t' : ','
    const cab = lineas[0].split(sep).map((x) => x.trim().toLowerCase())
    const ix = (n) => cab.findIndex((c) => n.includes(c))
    const iP = ix(['pocillo', 'well']), iM = ix(['muestra', 'sample']), iR = ix(['replica', 'rep']), iB = ix(['blanco', 'blank', 'esblanco'])
    if (iP < 0 || iM < 0) return s.avisar("El layout necesita las columnas 'Pocillo' y 'Muestra'.", 'error')
    const validos = new Set(pocillos96())
    const cfg = []
    for (const l of lineas.slice(1)) {
      const c = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ''))
      const p = c[iP]?.toUpperCase().replace(/^([A-H])0+(\d)/, '$1$2')
      if (!p || !validos.has(p) || !c[iM] || cfg.some((x) => x.Pocillo === p)) continue
      cfg.push({ Pocillo: p, Muestra: c[iM], Replica: iR >= 0 ? Number(c[iR]) || 0 : 0,
        EsBlanco: iB >= 0 && ['1', 'true', 'si', 'sí', 'yes', 'x'].includes((c[iB] || '').toLowerCase()) })
    }
    if (!cfg.length) return s.avisar('Ningún pocillo válido (A1 a H12) con muestra en el layout.', 'error')
    const ordenados = cfg.sort((x, y) => pocillos96().indexOf(x.Pocillo) - pocillos96().indexOf(y.Pocillo))
    const cont = {}
    ordenados.forEach((c) => { cont[c.Muestra] = (cont[c.Muestra] || 0) + 1; if (!c.Replica) c.Replica = cont[c.Muestra] })
    s.aplicarLayout(ordenados, aTodas)
  }

  const guardarSesion = () => descargarBlob(new Blob([JSON.stringify(s.exportarSesion())], { type: 'application/json' }), 'sesion_crecimiento_ufc.json')
  const cargarSesion = async (file) => {
    try { s.importarSesion(JSON.parse(await file.text())); s.avisar('Sesión cargada.') } catch { s.avisar('No se pudo leer la sesión.', 'error') }
  }

  const agregar = () => {
    const n = nueva.trim()
    if (!n) return
    if (s.muestras.some((m) => m.toLowerCase() === n.toLowerCase())) return s.avisar(`La muestra '${n}' ya existe.`, 'error')
    s.setMuestras([...s.muestras, n])
    setNueva('')
  }

  const d = s.datos
  const act = s.a
  const nT = d ? d.tiempos.length : 0
  const dur = d && nT ? (Math.max(...d.tiempos) - Math.min(...d.tiempos)) / 3600 : 0
  return (
    <div className="pagina">
      <section className="tarjeta">
        <div className="titulo-fila">
          <h2>Experimentos {s.exps.length > 0 && <small className="ayuda">({s.exps.length})</small>}</h2>
          <button onClick={s.nuevoExperimentoUfc}>Crear experimento solo UFC</button>
        </div>
        <p className="ayuda aviso-privacidad">Los cálculos se hacen en tu navegador: los archivos y los resultados <b>no se envían a ningún servidor</b>. Cada experimento tiene su curva de absorbancia (OD) y su recuento de UFC.</p>
        <div className="dropzone" onClick={() => { destinoRef.current = null; inputRef.current.click() }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); abrir(e.dataTransfer.files) }}>
          <strong>{cargando ? 'Leyendo…' : 'Soltá uno o varios Excel acá, o hacé clic para elegirlos'}</strong>
          <span>Excel o LibreOffice (.xlsx, .xls, .odsâ€¦). Cada archivo (o cada hoja con una curva) se agrega como un experimento. Formatos del lector: «Time [s]» con los pocillos A1 a H12, columna de tiempo con los pocillos como encabezados, o bloques «T=0, T=1…» con la matriz A..H de cada tiempo.</span>
        </div>
        <input ref={inputRef} type="file" multiple hidden accept={ACEPTA_LIBRO}
          onChange={(e) => { abrir(e.target.files, destinoRef.current); e.target.value = ''; destinoRef.current = null }} />

        {s.exps.length > 0 && (
          <div className="tabla-scroll" style={{ marginTop: 14 }}>
            <table className="tabla">
              <thead><tr><th>Experimento</th><th>Archivo de OD</th><th>Pocillos</th><th>Configurados</th><th>Muestras en la placa de diluciones</th><th>Conteos de UFC</th><th /></tr></thead>
              <tbody>
                {s.exps.map((x) => (
                  <tr key={x.id} className={x.id === s.a?.id ? 'fila-activa' : ''}>
                    <td><b>{x.nombre}</b>{x.id === s.a?.id && <small className="ayuda"> · activo</small>}</td>
                    {x.datos ? (
                      <>
                        <td>{x.archivo ? `${x.archivo.nombre}${x.archivo.hoja && x.archivo.hoja !== 'csv' ? ' · ' + x.archivo.hoja : ''}` : ''}</td>
                        <td>{Object.keys(x.datos.pocillos).length}</td>
                      </>
                    ) : (
                      <td colSpan={2}>
                        <span className="ayuda">Sin curva de OD. </span>
                        <button className="chico primario" onClick={() => { destinoRef.current = x.id; inputRef.current.click() }}>Cargar archivo</button>
                      </td>
                    )}
                    <td>{x.config.length}</td>
                    <td>{[...new Set(x.ufc.layout.map((c) => c.Muestra))].join(', ') || '–'}</td>
                    <td>{nConteos(x.ufc)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {x.id !== s.a?.id && <button className="chico" onClick={() => s.setActiva(x.id)}>Abrir</button>}{' '}
                      <button className="chico" onClick={() => setEdit({ id: x.id, nombre: x.nombre })}>Renombrar</button>{' '}
                      <button className="chico peligro" onClick={() => s.quitarExp(x.id)}>Quitar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {s.exps.length === 0 && <p className="ayuda">Todavía no hay experimentos. Cargá un Excel con la curva de absorbancia, o creá uno solo para el recuento de UFC.</p>}
        {s.archivo?.hojas?.length > 1 && s.tieneArchivo && (
          <Campo label={`Hoja del Excel de «${act.nombre}»`}>
            <Select value={s.archivo.hoja} onChange={(h) => s.cambiarHoja(h)} opciones={s.archivo.hojas.map((h) => [h, h])} />
          </Campo>
        )}
        {d && (
          <dl className="datos">
            <dt>Experimento activo</dt><dd>{act.nombre}</dd>
            <dt>Pocillos con datos</dt><dd>{Object.keys(d.pocillos).length}</dd>
            <dt>Mediciones por pocillo</dt><dd>{nT}</dd>
            <dt>Duración</dt><dd>{fmt(dur, 2)} h</dd>
          </dl>
        )}
      </section>

      <div className="rejilla-2">
        <section className="tarjeta">
          <h2>Muestras</h2>
          <p className="ayuda" style={{ marginTop: 0 }}>La lista de muestras es común a todos los experimentos y a la placa de diluciones. Para que la OD y las UFC se junten en «Comparar», la muestra tiene que llamarse igual en ambas.</p>
          <div className="fila-ctrl">
            <input className="grande" placeholder="Nombre de la muestra y Enter (ej.: L100A1)" value={nueva}
              onChange={(e) => setNueva(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && agregar()} />
            <button className="primario" onClick={agregar}>Agregar</button>
          </div>
          <ul className="lista-muestras">
            {s.muestras.map((m, i) => {
              const n = s.exps.reduce((t, x) => t + x.config.filter((c) => c.Muestra === m).length + x.ufc.layout.filter((c) => c.Muestra === m).length, 0)
              return (
                <li key={m}>
                  <span><b>{m}</b>{n > 0 && <small> ({n} {n === 1 ? 'pocillo' : 'pocillos'} en total)</small>}</span>
                  <span>
                    <button onClick={() => setEdit({ i, viejo: m, nuevo: m })}>Modificar</button>
                    <button className="peligro" onClick={() => s.borrarMuestra(m)}>Borrar</button>
                  </span>
                </li>
              )
            })}
            {!s.muestras.length && <li className="ayuda">Todavía no hay muestras. También podés escribir una nueva al configurar un pocillo.</li>}
          </ul>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <section className="tarjeta">
            <h2>Sesión</h2>
            <p className="ayuda" style={{ marginTop: 0 }}>Guarda <b>todos los experimentos con sus datos del Excel</b>, la configuración de pocillos, el recuento de UFC (diluciones y conteos), exclusiones, ajustes y estilos. Para continuar otro día alcanza con cargar la sesión: no hace falta volver a subir los Excel.</p>
            <div className="fila-ctrl">
              <button className="primario" onClick={guardarSesion} disabled={!s.exps.length}>Guardar sesión</button>
              <button onClick={() => sesionRef.current.click()}>Cargar sesión</button>
              <input ref={sesionRef} type="file" hidden accept=".json" onChange={(e) => { e.target.files[0] && cargarSesion(e.target.files[0]); e.target.value = '' }} />
            </div>
          </section>
          <section className="tarjeta">
            <h2>Layout de la placa de OD</h2>
            <p className="ayuda" style={{ marginTop: 0 }}>CSV con las columnas Pocillo, Muestra y, opcionalmente, Replica y Blanco (1/0). Se aplica a la placa activa o a todas. (La placa de diluciones se define en «Recuento UFC».)</p>
            <div className="fila-ctrl">
              <button onClick={exportarLayout} disabled={!s.config.length}>Exportar CSV</button>
              <button onClick={() => { destinoLayout.current = false; layoutRef.current.click() }} disabled={!d}>
                Importar CSV en «{act?.nombre || 'experimento activo'}»
              </button>
              {s.exps.length > 1 && (
                <button className="primario" onClick={() => { destinoLayout.current = true; layoutRef.current.click() }} disabled={!s.exps.some((x) => x.datos)}>
                  Importar CSV en todos
                </button>
              )}
              <input ref={layoutRef} type="file" hidden accept=".csv,.txt"
                onChange={(e) => { e.target.files[0] && importarLayout(e.target.files[0], destinoLayout.current); e.target.value = '' }} />
            </div>
            {s.exps.length > 1 && (
              <div className="fila-ctrl">
                <button disabled={!s.config.length} onClick={() => s.copiarConfig()}>Copiar el layout de este experimento a los demás</button>
              </div>
            )}
          </section>
        </div>
      </div>

      {s.preview && (
        <section className="tarjeta">
          <h2>Vista previa del archivo de «{act.nombre}»</h2>
          <div className="tabla-scroll">
            <table className="tabla">
              <tbody>
                {s.preview.map((fila, i) => (
                  <tr key={i}>{fila.map((v, j) => <td key={j}>{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {edit && edit.id && (
        <Modal titulo="Renombrar experimento" onClose={() => setEdit(null)}
          pie={<><button onClick={() => setEdit(null)}>Cancelar</button>
            <button className="primario" onClick={() => { s.renombrarExp(edit.id, edit.nombre.trim()); setEdit(null) }}>Guardar</button></>}>
          <Campo label="Nombre del experimento"><input autoFocus value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Enter') { s.renombrarExp(edit.id, edit.nombre.trim()); setEdit(null) } }} /></Campo>
        </Modal>
      )}
      {edit && !edit.id && (
        <Modal titulo="Modificar muestra" onClose={() => setEdit(null)}
          pie={<><button onClick={() => setEdit(null)}>Cancelar</button>
            <button className="primario" onClick={() => { s.renombrarMuestra(edit.viejo, edit.nuevo.trim()); setEdit(null) }}>Guardar</button></>}>
          <Campo label="Nuevo nombre"><input autoFocus value={edit.nuevo} onChange={(e) => setEdit({ ...edit, nuevo: e.target.value })} /></Campo>
          <p className="ayuda">El cambio también se aplica a los pocillos de todos los experimentos que ya usan esta muestra.</p>
        </Modal>
      )}
    </div>
  )
}
