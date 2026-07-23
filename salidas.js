//  CONFIGURACIÓN SUPABASE ← ACTUALIZA AQUÍ CON TUS CREDENCIALES
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

//  INIT
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([cargarProductos(), cargarBuses()]);
    await cargarSalidas();
    renderizarTodo();
    bindUI();
});

//  CARGA DE DATOS
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

//  RENDERIZADO
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
            tr.style.cursor = 'pointer'; // Feedback visual
            tr.innerHTML = `
                <td class="col-codigo">${s.codigo || ''}</td>
                <td class="col-desc">${descripcionDeCodigo(s.codigo)}</td>
                <td class="col-cant">${formatCant(s.cantidad)}</td>
                <td class="col-hora">${s.hora || ''}</td>
                <td class="col-recibe">${s.recibe || '—'}</td>
                <td class="col-tipo ${s.tipo === 'T' ? 'tipo-T' : 'tipo-V'}">${s.tipo === 'T' ? '🚌 Bus' : '🧾 Venta'}</td>
                <td>${nombreBus(s.bus)}</td>`;

            // Abrir menú directamente con un clic
            tr.addEventListener('click', e => abrirMenuContextual(e, s));
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

            // Abrir menú directamente al tocar/hacer clic
            card.addEventListener('click', e => abrirMenuContextual(e, s));

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

//  SHEET: ABRIR / CERRAR
function abrirSheet(salidaEditar = null) {
    itemsPendientes = [];
    productoSeleccionado = null;
    salidaEdicionOriginal = salidaEditar;

    // Limpieza inicial de inputs
    document.getElementById('inputProducto').value = '';
    document.getElementById('inputCantidad').value = '1';
    document.getElementById('inputRecibe').value = '';
    document.getElementById('selBus').value = '';
    document.getElementById('dropdownProductos').style.display = 'none';

    if (salidaEditar) {
        // Modo edición: Pre-cargar ÚNICAMENTE los controles superiores
        document.getElementById('sheetTitulo').textContent = 'Editar Salida';
        setModo(salidaEditar.tipo || 'V');
        document.getElementById('inputRecibe').value = salidaEditar.recibe || '';
        if (salidaEditar.bus) document.getElementById('selBus').value = salidaEditar.bus;

        // 1. Vincular el producto seleccionado en el input superior
        const cant = parseFloat(salidaEditar.cantidad) || 1;
        const prod = todosProductos.find(p => p.codigo === salidaEditar.codigo);
        
        if (prod) {
            productoSeleccionado = prod;
            document.getElementById('inputProducto').value = `${prod.codigo} - ${prod.descripcion}`;
        } else {
            document.getElementById('inputProducto').value = `${salidaEditar.codigo} - ${descripcionDeCodigo(salidaEditar.codigo)}`;
        }

        // 2. Cargar la cantidad original en el input superior
        document.getElementById('inputCantidad').value = cant;

        // NOTA: La mini tabla (itemsPendientes) se deja vacía intencionalmente.
        // El usuario ajustará arriba y presionará "＋ Agregar Producto".

    } else {
        // Modo nueva salida
        document.getElementById('sheetTitulo').textContent = 'Nueva Salida';
        setModo('V');
    }

    // Renderiza la mini tabla vacía lista para recibir lo que el usuario agregue
    renderMiniTabla();

    document.getElementById('overlaySheet').classList.add('visible');
    setTimeout(() => document.getElementById('hojaSheet').classList.add('visible'), 10);
}

function cerrarSheet() {
    document.getElementById('hojaSheet').classList.remove('visible');
    document.getElementById('overlaySheet').classList.remove('visible');
    document.getElementById('dropdownProductos').style.display = 'none';
    
    // Limpiamos los estados de edición y pendientes
    itemsPendientes = [];
    productoSeleccionado = null;
    salidaEdicionOriginal = null;
}

//  MODO V / T
function setModo(modo) {
    modoActual = modo;
    document.getElementById('btnModoVenta').classList.toggle('activo', modo === 'V');
    document.getElementById('btnModoBus').classList.toggle('activo', modo === 'T');
    document.getElementById('campoBus').style.display = modo === 'T' ? 'block' : 'none';
    document.getElementById('labelRecibe').textContent = modo === 'T' ? 'Recibe (técnico)' : 'Cliente';
}

//  DROPDOWN PRODUCTOS
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

        const seleccionar = (e) => {
            // Evitar que el clic continúe hacia los elementos que están debajo
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }

            productoSeleccionado = p;
            document.getElementById('inputProducto').value = `${p.codigo} — ${p.descripcion}`;
            drop.style.display = 'none';
        };

        // Usar e.preventDefault() en mousedown evita que el foco o el clic traspasen
        div.addEventListener('mousedown', seleccionar);
        div.addEventListener('touchstart', seleccionar, { passive: false });
        drop.appendChild(div);
    });
}

// ══════════════════════════════════════════════════════════
//  ESTADO Y MINI TABLA: AGREGAR / EDITAR / QUITAR / RENDER
// ══════════════════════════════════════════════════════════

// Variable para saber si estamos editando una fila existente (null si es nuevo)
let editIndex = null; 

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

    if (editIndex !== null) {
        // Modo Edición: Actualizar la fila seleccionada
        itemsPendientes[editIndex] = {
            codigo:      productoSeleccionado.codigo,
            descripcion: productoSeleccionado.descripcion,
            cantidad:    cantInput
        };
        editIndex = null; // Limpiar modo edición
    } else {
        // Modo Creación: Verificar si ya existe en la lista para sumar o agregar
        const existente = itemsPendientes.find(i => i.codigo === productoSeleccionado.codigo);
        if (existente) {
            existente.cantidad += cantInput;
        } else {
            itemsPendientes.push({
                codigo:      productoSeleccionado.codigo,
                descripcion: productoSeleccionado.descripcion,
                cantidad:    cantInput,
            });
        }
    }

    resetearInputs();
    renderMiniTabla();
}

function cargarItemParaEditar(idx) {
    const item = itemsPendientes[idx];
    if (!item) return;

    // Asignar productoSeleccionado para que el botón de agregar/guardar lo reconozca
    productoSeleccionado = {
        codigo: item.codigo,
        descripcion: item.descripcion
    };

    // Llenar los inputs del formulario
    document.getElementById('inputProducto').value = `${item.codigo} - ${item.descripcion}`;
    document.getElementById('inputCantidad').value = item.cantidad;

    // Guardar el índice que estamos editando
    editIndex = idx;
}

function quitarItemPendiente(idx, event) {
    // Detener la propagación para que el clic en '✕' no active la edición de la fila
    if (event) event.stopPropagation();

    itemsPendientes.splice(idx, 1);

    // Si estábamos editando la fila que se eliminó, cancelamos la edición
    if (editIndex === idx) {
        editIndex = null;
        resetearInputs();
    } else if (editIndex > idx) {
        // Ajustar el índice de edición si se borró un ítem previo
        editIndex--;
    }

    renderMiniTabla();
}

function resetearInputs() {
    productoSeleccionado = null;
    editIndex = null;
    document.getElementById('inputProducto').value = '';
    document.getElementById('inputCantidad').value = '1';
    
    const dropdown = document.getElementById('dropdownProductos');
    if (dropdown) dropdown.style.display = 'none';
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
        
        // Estilo opcional para destacar visualmente el renglón si se está editando
        if (idx === editIndex) {
            tr.style.backgroundColor = '#f1f5f9';
        }
        tr.style.cursor = 'pointer';

        // Al presionar en la fila cargamos los datos para edición
        tr.onclick = () => cargarItemParaEditar(idx);

        tr.innerHTML = `
            <td class="mt-codigo">${item.codigo}</td>
            <td class="mt-desc">${item.descripcion}</td>
            <td class="mt-cant">${formatCant(item.cantidad)}</td>
            <td class="mt-del">
                <button 
                    class="btn-mini-del" 
                    onclick="quitarItemPendiente(${idx}, event)" 
                    style="background:none;border:none;cursor:pointer;color:#dc2626;font-weight:bold;padding:4px 8px;">✕</button>
            </td>`;
        tbody.appendChild(tr);
    });
}

//  CONFIRMAR → SUPABASE
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
        // ── SI ES UNA EDICIÓN: Limpiar registro previo y restaurar su stock ──
        if (salidaEdicionOriginal) {
            const cantOrig = parseFloat(salidaEdicionOriginal.cantidad) || 0;
            
            // 1. Revertir stock del producto original
            await ajustarStock(salidaEdicionOriginal.codigo, cantOrig);

            // 2. Eliminar la salida antigua en Supabase
            const { error: errDelete } = await sb
                .from('salidas')
                .delete()
                .eq('id', salidaEdicionOriginal.id);

            if (errDelete) throw errDelete;
        }

        // ── GUARDAR ITEMS FINALES (Nuevos o Modificados) ──
        let conteoGuardadas = 0;

        for (const item of itemsPendientes) {
            // Insertar salida en Supabase
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

            // Descontar nuevo stock
            await ajustarStock(item.codigo, -item.cantidad);
            conteoGuardadas++;
        }

        salidaEdicionOriginal = null; // Resetear estado de edición
        cerrarSheet();
        await cargarSalidas();
        await cargarProductos(); // Refrescar stocks locales
        
        renderizarTodo(document.getElementById('txtBuscar')?.value || '');
        mostrarToast('Cambios guardados correctamente', 'ok');

    } catch (err) {
        console.error('Error guardando:', err);
        mostrarToast('Error al guardar: ' + (err.message || 'Error desconocido'), 'err');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Confirmar y guardar';
    }
}

//  STOCK
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

// === MENÚ CONTEXTUAL (POR CLIC) Y ACCIONES ===

// Cerrar menú al hacer clic fuera de él
document.addEventListener('click', (e) => {
    const menu = document.getElementById('menuContextual');
    if (menu && !menu.contains(e.target)) {
        ocultarMenuContextual();
    }
});

function ocultarMenuContextual() {
    const menu = document.getElementById('menuContextual');
    if (menu) menu.classList.remove('visible');
}

function abrirMenuContextual(e, salida) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }

    // Guardamos una copia limpia del objeto
    salidaEnContexto = { ...salida };

    const menu = document.getElementById('menuContextual');
    if (!menu) return;

    let x = e.clientX ?? (e.touches?.[0]?.clientX || 0);
    let y = e.clientY ?? (e.touches?.[0]?.clientY || 0);

    const mw = 200, mh = 120;
    x = Math.max(10, Math.min(x, window.innerWidth - mw - 10));
    y = Math.max(10, Math.min(y, window.innerHeight - mh - 10));

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('visible');

    if (navigator.vibrate) navigator.vibrate(20);
}

function editarSalidaDesdeMenu() {
    ocultarMenuContextual();
    if (!salidaEnContexto) return;
    
    // Aseguramos pasar el objeto completo a la función encargada de poblar el Sheet/Formulario
    abrirSheet(salidaEnContexto);
}

// Modal personalizado en reemplazo de confirm()
function confirmarEliminacionUI(mensaje) {
    return new Promise((resolve) => {
        let modal = document.getElementById('modalConfirmarEliminar');
        
        // Si no existe el HTML del modal en el DOM, lo creamos dinámicamente
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modalConfirmarEliminar';
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(4px);
                display: flex; align-items: center; justify-content: center;
                z-index: 9999; opacity: 0; pointer-events: none; transition: opacity .2s ease;
            `;
            modal.innerHTML = `
                <div style="background: white; border-radius: 12px; padding: 20px 24px; max-width: 360px; width: 90%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
                    <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 16px;">¿Eliminar salida?</h4>
                    <p id="msgConfirmarEliminar" style="margin: 0 0 20px 0; color: #64748b; font-size: 14px; line-height: 1.4;"></p>
                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button id="btnCancelDel" style="padding: 8px 14px; border-radius: 6px; border: 1px solid #cbd5e1; background: white; color: #475569; font-weight: 600; cursor: pointer;">Cancelar</button>
                        <button id="btnOkDel" style="padding: 8px 14px; border-radius: 6px; border: none; background: #ef4444; color: white; font-weight: 600; cursor: pointer;">Eliminar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        document.getElementById('msgConfirmarEliminar').innerText = mensaje;
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';

        const btnOk = document.getElementById('btnOkDel');
        const btnCancel = document.getElementById('btnCancelDel');

        const cerrar = (resultado) => {
            modal.style.opacity = '0';
            modal.style.pointerEvents = 'none';
            btnOk.onclick = null;
            btnCancel.onclick = null;
            resolve(resultado);
        };

        btnOk.onclick = () => cerrar(true);
        btnCancel.onclick = () => cerrar(false);
    });
}

async function eliminarSalidaDesdeMenu() {
    ocultarMenuContextual();
    if (!salidaEnContexto) return;

    const s = salidaEnContexto;
    const cant = parseFloat(s.cantidad) || 0;
    const desc = descripcionDeCodigo(s.codigo);

    const verificado = await confirmarEliminacionUI(`Se eliminará la salida de ${cant} u. de "${desc}". El stock será restaurado automáticamente.`);
    if (!verificado) return;

    try {
        // 1. Eliminar en Supabase
        const { error } = await sb.from('salidas').delete().eq('id', s.id);
        if (error) throw error;

        // 2. Revertir el stock
        await ajustarStock(s.codigo, cant);

        // 3. Refrescar estado local
        todasSalidas = todasSalidas.filter(x => x.id !== s.id);
        await cargarProductos();
        
        const txtBuscar = document.getElementById('txtBuscar')?.value || '';
        renderizarTodo(txtBuscar);
        
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