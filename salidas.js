// ══════════════════════════════════════════════════════════
//  CONFIGURACIÓN SUPABASE ← ACTUALIZA AQUÍ CON TUS CREDENCIALES
// ══════════════════════════════════════════════════════════
const SUPABASE_URL  = 'https://vdlxmajvzdtbewchyowm.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Estado global ──
let todasSalidas  = [];   // raw de supabase
let todosProductos = [];  // { row_id, codigo, descripcion, stock }
let todosBuses     = [];  // { id, bus, placa }
let modoActual     = 'V'; // 'V' venta, 'T' bus
let itemsPendientes = []; // items acumulados en el sheet antes de confirmar

// Edición
let salidaEnContexto = null; // objeto salida para el menú contextual

// Dropdown producto seleccionado
let productoSeleccionado = null;

// Long-press
let pressTimer = null;
const LONG_PRESS_MS = 600;

// ══════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([cargarProductos(), cargarBuses()]);
    await cargarSalidas();
    renderizarTodo();
    bindUI();
});

// ══════════════════════════════════════════════════════════
//  CARGA DE DATOS
// ══════════════════════════════════════════════════════════
async function cargarProductos() {
    const { data, error } = await sb.from('productos').select('row_id, codigo, descripcion, stock');
    if (error) { 
        console.error('Error cargando productos:', error); 
        mostrarToast('Error al cargar productos', 'err');
        return; 
    }
    todosProductos = data || [];
}

async function cargarBuses() {
    const { data, error } = await sb.from('buses').select('id, bus, placa').order('placa');
    if (error) { 
        console.error('Error cargando buses:', error); 
        mostrarToast('Error al cargar buses', 'err');
        return; 
    }
    todosBuses = data || [];

    // Poblar select del sheet
    const sel = document.getElementById('selBus');
    sel.innerHTML = '<option value="">— Seleccionar bus —</option>';
    todosBuses.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.id;
        opt.textContent = `${b.placa} — ${b.bus}`;
        sel.appendChild(opt);
    });
}

async function cargarSalidas() {
    const { data, error } = await sb
        .from('salidas')
        .select('*')
        .order('fecha', { ascending: false })
        .order('hora', { ascending: false });

    if (error) { 
        console.error('Error cargando salidas:', error); 
        mostrarToast('Error al cargar salidas', 'err');
        return; 
    }
    todasSalidas = data || [];
}

// ══════════════════════════════════════════════════════════
//  RENDERIZADO
// ══════════════════════════════════════════════════════════
function renderizarTodo(filtro = '') {
    const txt = filtro.trim().toLowerCase();

    let lista = todasSalidas;

    // Filtro de tipos ignorados (SR, MO igual que en Access)
    lista = lista.filter(s => s.tipo !== 'SR' && s.tipo !== 'MO');

    if (txt) {
        lista = lista.filter(s => {
            const desc = descripcionDeCodigo(s.codigo).toLowerCase();
            return (
                (s.codigo  || '').toLowerCase().includes(txt) ||
                desc.includes(txt) ||
                (s.recibe  || '').toLowerCase().includes(txt) ||
                (s.tipo    || '').toLowerCase().includes(txt)
            );
        });
    }

    // Agrupar por fecha
    const grupos = agruparPorFecha(lista);
    renderPC(grupos);
    renderMobile(grupos);
}

function agruparPorFecha(lista) {
    const map = new Map();
    lista.forEach(s => {
        const key = s.fecha || 'Sin fecha';
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(s);
    });
    return map;
}

function parsearFecha(fechaStr) {
    // Soporta: 'yyyy-mm-dd', 'dd/mm/yyyy', 'dd/mm/yy', ISO completo
    if (!fechaStr) return null;
    const s = fechaStr.trim();

    // ISO: 2025-06-27 o 2025-06-27T...
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const d = new Date(s.substring(0, 10) + 'T00:00:00');
        return isNaN(d) ? null : d;
    }

    // dd/mm/yyyy o dd/mm/yy
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
        const [dd, mm, aaaa] = s.split('/');
        const anio = aaaa.length === 2 ? '20' + aaaa : aaaa;
        const d = new Date(`${anio}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T00:00:00`);
        return isNaN(d) ? null : d;
    }

    // Cualquier otro intento
    const d = new Date(s);
    return isNaN(d) ? null : d;
}

function etiquetaFecha(fechaStr) {
    if (!fechaStr) return 'Sin fecha';
    const d = parsearFecha(fechaStr);
    if (!d) return fechaStr; // mostrar tal cual si no se pudo parsear

    const hoy    = new Date(); hoy.setHours(0,0,0,0);
    const ayer   = new Date(hoy); ayer.setDate(hoy.getDate()-1);
    const semana = new Date(hoy); semana.setDate(hoy.getDate()-7);
    d.setHours(0,0,0,0);

    if (d.getTime() === hoy.getTime())  return 'Hoy';
    if (d.getTime() === ayer.getTime()) return 'Ayer';
    if (d >= semana) return 'Esta semana';

    return d.toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

// ── Vista PC ──
function renderPC(grupos) {
    const tbody = document.getElementById('tablaBody');
    tbody.innerHTML = '';

    if (grupos.size === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:60px;color:#94a3b8;">Sin salidas registradas</td></tr>`;
        return;
    }

    grupos.forEach((filas, fechaKey) => {
        // Fila de grupo
        const trGrupo = document.createElement('tr');
        trGrupo.innerHTML = `
            <td colspan="7" style="background:#f8fafc;padding:8px 14px;">
                <span style="font-size:12px;font-weight:bold;color:#284B87;text-transform:uppercase;letter-spacing:.5px;">
                    ${etiquetaFecha(fechaKey)} — ${filas.length} salida${filas.length!==1?'s':''}
                </span>
            </td>`;
        tbody.appendChild(trGrupo);

        filas.forEach(s => {
            const tr = document.createElement('tr');
            tr.dataset.id = s.id;
            tr.innerHTML = `
                <td class="col-codigo">${s.codigo || ''}</td>
                <td class="col-desc">${descripcionDeCodigo(s.codigo)}</td>
                <td class="col-cant">${formatCant(s.cantidad)}</td>
                <td class="col-hora">${s.hora || ''}</td>
                <td class="col-recibe">${s.recibe || '—'}</td>
                <td class="col-tipo ${s.tipo === 'T' ? 'tipo-T' : 'tipo-V'}">${s.tipo === 'T' ? '🚌 Bus' : '🧾 Venta'}</td>
                <td>${nombreBus(s.bus)}</td>`;

            // Long press en PC (click derecho simulado con hold)
            tr.addEventListener('mousedown', e => iniciarLongPress(e, s));
            tr.addEventListener('mouseup',   cancelarLongPress);
            tr.addEventListener('mouseleave',cancelarLongPress);
            tbody.appendChild(tr);
        });
    });
}

// ── Vista móvil ──
function renderMobile(grupos) {
    const cont = document.getElementById('vistaMobile');
    cont.innerHTML = '';

    if (grupos.size === 0) {
        cont.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#94a3b8;">Sin salidas registradas</div>`;
        return;
    }

    grupos.forEach((filas, fechaKey) => {
        const grupo = document.createElement('div');
        grupo.style.marginBottom = '20px';

        const header = document.createElement('div');
        header.style.cssText = 'font-size:12px;font-weight:bold;color:#284B87;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;';
        header.textContent = `${etiquetaFecha(fechaKey)} — ${filas.length} salida${filas.length!==1?'s':''}`;

        grupo.appendChild(header);

        filas.forEach(s => {
            const card = document.createElement('div');
            card.style.cssText = 'background:white;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:10px;cursor:pointer;';
            card.dataset.id = s.id;

            const esT = s.tipo === 'T';
            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
                    <div style="flex:1;">
                        <div style="font-weight:bold;color:#203764;margin-bottom:4px;">${descripcionDeCodigo(s.codigo)}</div>
                        <div style="font-size:12px;color:#64748b;margin-bottom:6px;">${s.codigo || ''}</div>
                        <div style="font-size:12px;color:#64748b;">${s.recibe || '—'} ${s.hora ? '· ' + s.hora : ''}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:18px;">${esT ? '🚌' : '🧾'}</div>
                        <div style="font-weight:bold;color:#284B87;margin-top:4px;">${formatCant(s.cantidad)} u.</div>
                    </div>
                </div>`;

            // Long press móvil
            card.addEventListener('touchstart',  e => iniciarLongPress(e, s), { passive: true });
            card.addEventListener('touchend',    cancelarLongPress);
            card.addEventListener('touchcancel', cancelarLongPress);
            card.addEventListener('mousedown', e => iniciarLongPress(e, s));
            card.addEventListener('mouseup',   cancelarLongPress);

            grupo.appendChild(card);
        });

        cont.appendChild(grupo);
    });
}

// ══════════════════════════════════════════════════════════
//  BUSCADOR
// ══════════════════════════════════════════════════════════
function bindUI() {
    document.getElementById('txtBuscar').addEventListener('input', e => {
        renderizarTodo(e.target.value);
    });

    // FAB
    document.getElementById('btnNuevaSalida').addEventListener('click', () => abrirSheet());

    // Cerrar sheet
    document.getElementById('overlaySheet').addEventListener('click', cerrarSheet);
    document.getElementById('sheetHandle').addEventListener('click', cerrarSheet);

    // Cerrar menú contextual al hacer click fuera
    document.addEventListener('click', e => {
        const menu = document.getElementById('menuContextual');
        if (menu.classList.contains('visible') && !menu.contains(e.target)) {
            menu.classList.remove('visible');
        }
    });

    // Dropdown de productos
    document.getElementById('inputProducto').addEventListener('input', e => {
        buscarProductoDropdown(e.target.value);
    });
    document.getElementById('inputProducto').addEventListener('blur', () => {
        setTimeout(() => { document.getElementById('dropdownProductos').style.display = 'none'; }, 200);
    });
}

// ══════════════════════════════════════════════════════════
//  SHEET: ABRIR / CERRAR
// ══════════════════════════════════════════════════════════
function abrirSheet(salidaEditar = null) {
    itemsPendientes = [];
    productoSeleccionado = null;
    document.getElementById('inputProducto').value = '';
    document.getElementById('inputCantidad').value = '1';
    document.getElementById('inputRecibe').value = '';
    document.getElementById('selBus').value = '';
    document.getElementById('dropdownProductos').style.display = 'none';
    renderMiniTabla();

    if (salidaEditar) {
        // Modo edición: pre-cargar datos
        document.getElementById('sheetTitulo').textContent = 'Editar Salida';
        setModo(salidaEditar.tipo || 'V');
        document.getElementById('inputRecibe').value = salidaEditar.recibe || '';
        if (salidaEditar.bus) document.getElementById('selBus').value = salidaEditar.bus;

        // Pre-cargar el item en la mini tabla
        itemsPendientes = [{
            codigo: salidaEditar.codigo,
            descripcion: descripcionDeCodigo(salidaEditar.codigo),
            cantidad: parseFloat(salidaEditar.cantidad) || 0,
            _editId: salidaEditar.id,
            _cantidadOriginal: parseFloat(salidaEditar.cantidad) || 0,
            _codigoOriginal: salidaEditar.codigo,
        }];
        renderMiniTabla();
    } else {
        document.getElementById('sheetTitulo').textContent = 'Nueva Salida';
        setModo('V');
    }

    document.getElementById('overlaySheet').classList.add('visible');
    setTimeout(() => document.getElementById('hojaSheet').classList.add('visible'), 10);
}

function cerrarSheet() {
    document.getElementById('hojaSheet').classList.remove('visible');
    document.getElementById('overlaySheet').classList.remove('visible');
    document.getElementById('dropdownProductos').style.display = 'none';
    itemsPendientes = [];
}

// ══════════════════════════════════════════════════════════
//  MODO V / T
// ══════════════════════════════════════════════════════════
function setModo(modo) {
    modoActual = modo;
    document.getElementById('btnModoVenta').classList.toggle('activo', modo === 'V');
    document.getElementById('btnModoBus').classList.toggle('activo', modo === 'T');
    document.getElementById('campoBus').style.display = modo === 'T' ? 'block' : 'none';
    document.getElementById('labelRecibe').textContent = modo === 'T' ? 'Recibe (técnico)' : 'Cliente';
}

// ══════════════════════════════════════════════════════════
//  DROPDOWN PRODUCTOS
// ══════════════════════════════════════════════════════════
function buscarProductoDropdown(texto) {
    productoSeleccionado = null;
    const drop = document.getElementById('dropdownProductos');
    const q = texto.trim().toLowerCase();

    if (!q) { drop.style.display = 'none'; return; }

    const resultados = todosProductos.filter(p =>
        (p.codigo || '').toLowerCase().includes(q) ||
        (p.descripcion || '').toLowerCase().includes(q)
    ).slice(0, 15);

    if (!resultados.length) { drop.style.display = 'none'; return; }

    drop.innerHTML = '';
    drop.style.display = 'block';

    resultados.forEach(p => {
        const div = document.createElement('div');
        div.className = 'dropdown-item';
        div.innerHTML = `<strong style="color:#284B87">${p.codigo}</strong> <span style="color:#64748b;">— ${p.descripcion}</span>`;

        const seleccionar = () => {
            productoSeleccionado = p;
            document.getElementById('inputProducto').value = `${p.codigo} — ${p.descripcion}`;
            drop.style.display = 'none';
        };

        div.addEventListener('mousedown', seleccionar);
        div.addEventListener('touchstart', seleccionar, { passive: true });
        drop.appendChild(div);
    });
}

// ══════════════════════════════════════════════════════════
//  MINI TABLA: AGREGAR / RENDER / QUITAR
// ══════════════════════════════════════════════════════════
function agregarItemPendiente() {
    if (!productoSeleccionado) {
        mostrarToast('Selecciona un producto válido del listado', 'err');
        return;
    }

    const cantInput = parseFloat(document.getElementById('inputCantidad').value);
    if (!cantInput || cantInput <= 0) {
        mostrarToast('Ingresa una cantidad válida', 'err');
        return;
    }

    // Verificar si ya está en la lista → sumar cantidad
    const existente = itemsPendientes.find(i => i.codigo === productoSeleccionado.codigo && !i._editId);
    if (existente) {
        existente.cantidad += cantInput;
    } else {
        itemsPendientes.push({
            codigo:      productoSeleccionado.codigo,
            descripcion: productoSeleccionado.descripcion,
            cantidad:    cantInput,
        });
    }

    productoSeleccionado = null;
    document.getElementById('inputProducto').value = '';
    document.getElementById('inputCantidad').value = '1';
    document.getElementById('dropdownProductos').style.display = 'none';
    renderMiniTabla();
}

function quitarItemPendiente(idx) {
    itemsPendientes.splice(idx, 1);
    renderMiniTabla();
}

function renderMiniTabla() {
    const tbody = document.getElementById('miniTablaBody');
    if (!itemsPendientes.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="mini-tabla-vacia" style="text-align:center;color:#94a3b8;padding:15px;">Aún no hay items. Agrega productos arriba.</td></tr>`;
        return;
    }
    tbody.innerHTML = '';
    itemsPendientes.forEach((item, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="mt-codigo">${item.codigo}</td>
            <td class="mt-desc">${item.descripcion}</td>
            <td class="mt-cant">${formatCant(item.cantidad)}</td>
            <td class="mt-del"><button class="btn-mini-del" onclick="quitarItemPendiente(${idx})" style="background:none;border:none;cursor:pointer;color:#dc2626;font-weight:bold;">✕</button></td>`;
        tbody.appendChild(tr);
    });
}

// ══════════════════════════════════════════════════════════
//  CONFIRMAR → SUPABASE
// ══════════════════════════════════════════════════════════
async function confirmarSalidas() {
    if (!itemsPendientes.length) {
        mostrarToast('Agrega al menos un producto', 'err');
        return;
    }

    const recibe = document.getElementById('inputRecibe').value.trim();
    const idBus  = document.getElementById('selBus').value;

    if (modoActual === 'T' && !idBus) {
        mostrarToast('Selecciona el bus', 'err');
        return;
    }
    if (modoActual === 'T' && !recibe) {
        mostrarToast('Ingresa quién recibe', 'err');
        return;
    }

    const btn = document.getElementById('btnConfirmar');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    const hoy  = fechaHoy();
    const hora = horaActual();
    const tipo = modoActual;

    try {
        let conteoGuardadas = 0;

        for (const item of itemsPendientes) {
            // ── EDICIÓN: primero revertir stock anterior, luego aplicar nuevo ──
            if (item._editId) {
                // 1. Revertir stock del item original
                await ajustarStock(item._codigoOriginal, item._cantidadOriginal); // suma de vuelta

                // 2. Actualizar la salida en supabase
                const { error: errUpdate } = await sb.from('salidas').update({
                    codigo:   item.codigo,
                    cantidad: String(item.cantidad),
                    recibe:   recibe,
                    tipo:     tipo,
                    bus:      idBus || null,
                }).eq('id', item._editId);

                if (errUpdate) throw errUpdate;

                // 3. Descontar el nuevo stock
                await ajustarStock(item.codigo, -item.cantidad);

            } else {
                // ── INSERCIÓN NUEVA ──
                const { error: errInsert } = await sb.from('salidas').insert({
                    fecha:    hoy,
                    codigo:   item.codigo,
                    cantidad: String(item.cantidad),
                    hora:     hora,
                    recibe:   recibe,
                    tipo:     tipo,
                    bus:      idBus || null,
                });

                if (errInsert) throw errInsert;

                await ajustarStock(item.codigo, -item.cantidad);
            }

            conteoGuardadas++;
        }

        cerrarSheet();
        await cargarSalidas();
        await cargarProductos(); // refrescar stocks locales
        renderizarTodo(document.getElementById('txtBuscar').value);
        mostrarToast(`${conteoGuardadas} salida${conteoGuardadas!==1?'s':''} guardada${conteoGuardadas!==1?'s':''}`, 'ok');

    } catch (err) {
        console.error('Error guardando:', err);
        mostrarToast('Error al guardar: ' + (err.message || 'Error desconocido'), 'err');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirmar y guardar';
    }
}

// ══════════════════════════════════════════════════════════
//  STOCK
// ══════════════════════════════════════════════════════════
async function ajustarStock(codigo, delta) {
    // Solo ajustar si el producto tiene stock numérico (no null)
    const prod = todosProductos.find(p => p.codigo === codigo);
    if (!prod) return;
    if (prod.stock === null || prod.stock === undefined) return;

    const nuevoStock = (parseFloat(prod.stock) || 0) + delta;

    const { error } = await sb
        .from('productos')
        .update({ stock: nuevoStock })
        .eq('row_id', prod.row_id);

    if (error) console.error('Error ajustando stock:', error);
    else prod.stock = nuevoStock; // actualizar local
}

// ══════════════════════════════════════════════════════════
//  LONG PRESS → MENÚ CONTEXTUAL
// ══════════════════════════════════════════════════════════
function iniciarLongPress(e, salida) {
    cancelarLongPress();
    pressTimer = setTimeout(() => {
        salidaEnContexto = salida;
        mostrarMenuContextual(e);
    }, LONG_PRESS_MS);
}

function cancelarLongPress() {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
}

function mostrarMenuContextual(e) {
    const menu = document.getElementById('menuContextual');
    menu.classList.add('visible');

    // Posición: cerca del cursor/toque
    let x, y;
    if (e.touches && e.touches.length) {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
    } else {
        x = e.clientX;
        y = e.clientY;
    }

    // Evitar salir de pantalla
    const mw = 200, mh = 100;
    x = Math.min(x, window.innerWidth  - mw - 10);
    y = Math.min(y, window.innerHeight - mh - 10);

    menu.style.left = x + 'px';
    menu.style.top  = y + 'px';

    // Vibración háptica en móvil
    if (navigator.vibrate) navigator.vibrate(40);
}

function editarSalidaDesdeMenu() {
    document.getElementById('menuContextual').classList.remove('visible');
    if (!salidaEnContexto) return;
    abrirSheet(salidaEnContexto);
}

async function eliminarSalidaDesdeMenu() {
    document.getElementById('menuContextual').classList.remove('visible');
    if (!salidaEnContexto) return;

    const s = salidaEnContexto;
    const cant = parseFloat(s.cantidad) || 0;

    const confirmado = confirm(`¿Eliminar salida de ${cant} × ${descripcionDeCodigo(s.codigo)}?\nSe devolverá el stock si aplica.`);
    if (!confirmado) return;

    try {
        // Eliminar de Supabase
        const { error } = await sb.from('salidas').delete().eq('id', s.id);
        if (error) throw error;

        // Devolver stock (delta positivo → suma)
        await ajustarStock(s.codigo, cant);

        // Actualizar lista local
        todasSalidas = todasSalidas.filter(x => x.id !== s.id);
        await cargarProductos();
        renderizarTodo(document.getElementById('txtBuscar').value);
        mostrarToast('Salida eliminada y stock restaurado', 'ok');
    } catch (err) {
        mostrarToast('Error al eliminar: ' + err.message, 'err');
    }
}

// ══════════════════════════════════════════════════════════
//  UTILIDADES
// ══════════════════════════════════════════════════════════
function descripcionDeCodigo(codigo) {
    if (!codigo) return '';
    const p = todosProductos.find(x => x.codigo === codigo);
    return p ? (p.descripcion || '') : codigo;
}

function nombreBus(idBus) {
    if (!idBus) return '';
    const b = todosBuses.find(x => x.id === idBus);
    return b ? `${b.placa} ${b.bus}` : idBus;
}

function formatCant(v) {
    const n = parseFloat(v);
    if (isNaN(n)) return v || '';
    return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

function fechaHoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function horaActual() {
    const d = new Date();
    let h = d.getHours(), m = d.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')} ${ampm}`;
}

let toastTimer = null;
function mostrarToast(msg, tipo = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'visible ' + tipo;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.className = '', 3000);
}