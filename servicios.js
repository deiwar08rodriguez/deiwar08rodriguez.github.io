// THERMOAIR SAS - SERVICIOS Y TRABAJOS EN TALLER CON INTEGRACIÓN GEMINI IA

// ── CONFIGURACIÓN SUPABASE ──
const SUPABASE_URL  = 'https://vdlxmajvzdtbewchyowm.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── CONFIGURACIÓN GEMINI IA ──
const GEMINI_API_KEY = 'AQ.Ab8RN6Ji4Fv4g2m_zGByTvDSuvIrkvXI1R-Fq1-hDmVMQcLJkw'; 
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
// ── ESTADO GLOBAL ──
let todosTrabajos   = []; 
let todosServicios  = []; 
let todosBuses      = []; 
let itemsPendientes = []; 

// Edición
let trabajoEnContexto = null;
let trabajoEdicionOriginal = null;
let editIndex = null;

// Dropdown servicio seleccionado
let servicioSeleccionado = null;

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
    console.log("🚀 [INIT] Cargando app THERMOAIR SAS...");
    await Promise.all([cargarServicios(), cargarBuses()]);
    await cargarTrabajos();
    renderizarTodo();
    bindUI();
    console.log("✅ [INIT] Carga inicial completa.");
});

// ── CARGA DE DATOS ──
async function cargarServicios() {
    console.log("📦 [SUPABASE] Solicitando tabla 'servicios'...");
    const { data, error } = await sb.from('servicios').select('codigo, descripcion, precio');
    if (error) { 
        console.error('❌ Error cargando servicios:', error); 
        mostrarToast('Error al cargar servicios', 'err');
        return; 
    }
    todosServicios = data || [];
    console.log(`✅ [SUPABASE] ${todosServicios.length} servicios cargados.`);
}

async function cargarBuses() {
    console.log("🚌 [SUPABASE] Solicitando tabla 'buses' (estado = ABIERTO)...");
    const { data, error } = await sb
        .from('buses')
        .select('id, bus, placa, estado, cliente') 
        .eq('estado', 'ABIERTO')
        .order('placa');

    if (error) { 
        console.error('❌ Error cargando buses:', error); 
        mostrarToast('Error al cargar buses', 'err');
        return; 
    }

    todosBuses = data || [];
    console.log(`✅ [SUPABASE] ${todosBuses.length} buses abiertos cargados:`, todosBuses);

    const sel = document.getElementById('selBus');
    if (sel) {
        sel.innerHTML = '<option value="">— Seleccionar bus —</option>';
        todosBuses.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b.id;
            opt.textContent = `${b.placa} — ${b.bus}`;
            sel.appendChild(opt);
        });
    }
}

async function cargarTrabajos() {
    console.log("📋 [SUPABASE] Solicitando tabla 'trabajos'...");
    const { data, error } = await sb
        .from('trabajos')
        .select('*')
        .order('FECHA', { ascending: false })
        .order('id', { ascending: false });

    if (error) { 
        console.error('❌ Error cargando trabajos:', error); 
        mostrarToast('Error al cargar trabajos', 'err');
        return; 
    }
    todosTrabajos = data || [];
    console.log(`✅ [SUPABASE] ${todosTrabajos.length} trabajos cargados.`);
}

// ── RENDERIZADO ──
function renderizarTodo(filtro = '') {
    const txt = filtro.trim().toLowerCase();
    let lista = todosTrabajos;

    if (txt) {
        lista = lista.filter(t => 
            (t.TRABAJO || '').toLowerCase().includes(txt) ||
            (t.PLACA   || '').toLowerCase().includes(txt) ||
            (t.N_BUS   || '').toLowerCase().includes(txt) ||
            (t.tecnico || '').toLowerCase().includes(txt) ||
            (t.CLIENTE || '').toLowerCase().includes(txt)
        );
    }

    const grupos = agruparPorFecha(lista);
    renderPC(grupos);
    renderMobile(grupos);
}

function agruparPorFecha(lista) {
    const map = new Map();
    lista.forEach(t => {
        const key = t.FECHA || 'Sin fecha';
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(t);
    });
    return map;
}

function parsearFecha(fechaStr) {
    if (!fechaStr) return null;
    const s = fechaStr.trim();

    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const d = new Date(s.substring(0, 10) + 'T00:00:00');
        return isNaN(d) ? null : d;
    }

    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(s)) {
        const [dd, mm, aaaa] = s.split('/');
        const anio = aaaa.length === 2 ? '20' + aaaa : aaaa;
        const d = new Date(`${anio}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}T00:00:00`);
        return isNaN(d) ? null : d;
    }

    const d = new Date(s);
    return isNaN(d) ? null : d;
}

function etiquetaFecha(fechaStr) {
    if (!fechaStr) return 'Sin fecha';
    const d = parsearFecha(fechaStr);
    if (!d) return fechaStr;

    const hoy    = new Date(); hoy.setHours(0,0,0,0);
    const ayer   = new Date(hoy); ayer.setDate(hoy.getDate()-1);
    const semana = new Date(hoy); semana.setDate(hoy.getDate()-7);
    d.setHours(0,0,0,0);

    if (d.getTime() === hoy.getTime())  return 'Hoy';
    if (d.getTime() === ayer.getTime()) return 'Ayer';
    if (d >= semana) return 'Esta semana';

    return d.toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

function renderPC(grupos) {
    const tbody = document.getElementById('tablaBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (grupos.size === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:60px;color:#94a3b8;">Sin trabajos registrados</td></tr>`;
        return;
    }

    grupos.forEach((filas, fechaKey) => {
        const trGrupo = document.createElement('tr');
        trGrupo.innerHTML = `
            <td colspan="5" style="background:#f8fafc;padding:8px 14px;">
                <span style="font-size:12px;font-weight:bold;color:#284B87;text-transform:uppercase;letter-spacing:.5px;">
                    ${etiquetaFecha(fechaKey)} — ${filas.length} trabajo${filas.length!==1?'s':''}
                </span>
            </td>`;
        tbody.appendChild(trGrupo);

        filas.forEach(t => {
            const tr = document.createElement('tr');
            tr.dataset.id = t.id;
            tr.style.cursor = 'pointer';

            tr.innerHTML = `
                <td class="col-bus"><strong>${t.PLACA || ''}</strong> ${t.N_BUS ? '— ' + t.N_BUS : ''}</td>
                <td class="col-trabajo">${t.TRABAJO || '—'}</td>
                <td class="col-tecnico">${t.tecnico || '—'}</td>
                <td class="col-cliente">${t.CLIENTE || '—'}</td>
                <td class="col-empresa">${t.EMPRESA || '—'}</td>`;

            tr.addEventListener('click', e => abrirMenuContextual(e, t));
            tbody.appendChild(tr);
        });
    });
}

function renderMobile(grupos) {
    const cont = document.getElementById('vistaMobile');
    if (!cont) return;
    cont.innerHTML = '';

    if (grupos.size === 0) {
        cont.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#94a3b8;">Sin trabajos registrados</div>`;
        return;
    }

    grupos.forEach((filas, fechaKey) => {
        const grupo = document.createElement('div');
        grupo.style.marginBottom = '20px';

        const header = document.createElement('div');
        header.style.cssText = 'font-size:12px;font-weight:bold;color:#284B87;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;';
        header.textContent = `${etiquetaFecha(fechaKey)} — ${filas.length} trabajo${filas.length!==1?'s':''}`;

        grupo.appendChild(header);

        filas.forEach(t => {
            const card = document.createElement('div');
            card.style.cssText = 'background:white;border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:10px;cursor:pointer;';
            card.dataset.id = t.id;

            card.innerHTML = `
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
                    <div style="flex:1;">
                        <div style="font-weight:bold;color:#203764;margin-bottom:4px;">${t.TRABAJO || 'Sin descripción'}</div>
                        <div style="font-size:12px;color:#64748b;margin-bottom:4px;">🚌 ${t.PLACA || ''} ${t.N_BUS ? '— Bus: ' + t.N_BUS : ''}</div>
                        <div style="font-size:12px;color:#64748b;">Técnico: ${t.tecnico || '—'}</div>
                    </div>
                    <div style="text-align:right;font-size:12px;color:#64748b;">
                        <div>${t.CLIENTE || ''}</div>
                    </div>
                </div>`;

            card.addEventListener('click', e => abrirMenuContextual(e, t));
            grupo.appendChild(card);
        });

        cont.appendChild(grupo);
    });
}

// ── BIND UI ──
function bindUI() {
    const txtBuscar = document.getElementById('txtBuscar');
    if (txtBuscar) {
        txtBuscar.addEventListener('input', e => renderizarTodo(e.target.value));
    }

    const btnNuevo = document.getElementById('btnNuevoTrabajo');
    if (btnNuevo) btnNuevo.addEventListener('click', () => abrirSheet());

    const btnIA = document.getElementById('btnProcesarIA');
    if (btnIA) {
        btnIA.addEventListener('click', async (e) => {
            e.preventDefault(); // Evita recarga de página
            console.log("🤖 Click en botón Procesar IA");
            const texto = prompt('Ingresa o dicta el reporte de trabajo para la IA:');
            console.log("📝 Texto ingresado en prompt:", texto);
            if (texto) {
                await procesarTextoConIA(texto);
            } else {
                console.warn("⚠️ Operación cancelada o prompt vacío.");
            }
        });
    }

    const overlay = document.getElementById('overlaySheet');
    const handle = document.getElementById('sheetHandle');
    if (overlay) overlay.addEventListener('click', cerrarSheet);
    if (handle) handle.addEventListener('click', cerrarSheet);

    document.addEventListener('click', e => {
        const menu = document.getElementById('menuContextual');
        if (menu && menu.classList.contains('visible') && !menu.contains(e.target)) {
            menu.classList.remove('visible');
        }
    });

    const inputServ = document.getElementById('inputServicio');
    if (inputServ) {
        inputServ.addEventListener('input', e => buscarServicioDropdown(e.target.value));
        
        inputServ.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const drop = document.getElementById('dropdownServicios');
                if (drop) drop.style.display = 'none';
                agregarItemPendiente();
            }
        });

        inputServ.addEventListener('blur', () => {
            setTimeout(() => { 
                const drop = document.getElementById('dropdownServicios');
                if (drop) drop.style.display = 'none'; 
            }, 200);
        });
    }

    const btnConfirmar = document.getElementById('btnConfirmar');
    if (btnConfirmar) {
        btnConfirmar.addEventListener('click', confirmarSalidas);
    }
}

// ── SHEET: ABRIR / CERRAR ──
function abrirSheet(trabajoEditar = null) {
    console.log("📂 [SHEET] Abriendo panel lateral...");
    itemsPendientes = [];
    servicioSeleccionado = null;
    trabajoEdicionOriginal = trabajoEditar;
    editIndex = null;

    const inputServ = document.getElementById('inputServicio');
    const inputTec  = document.getElementById('inputTecnico');
    const selBus    = document.getElementById('selBus');
    const drop      = document.getElementById('dropdownServicios');

    if (inputServ) inputServ.value = '';
    if (inputTec) inputTec.value = '';
    if (selBus) selBus.value = '';
    if (drop) drop.style.display = 'none';

    if (trabajoEditar) {
        document.getElementById('sheetTitulo').textContent = 'Editar Trabajo';
        if (inputTec) inputTec.value = trabajoEditar.tecnico || '';

        const busObj = todosBuses.find(b => b.placa === trabajoEditar.PLACA || b.bus === trabajoEditar.N_BUS);
        if (busObj && selBus) selBus.value = busObj.id;

        const servObj = todosServicios.find(s => s.descripcion === trabajoEditar.TRABAJO || s.codigo === trabajoEditar.TRABAJO);
        if (servObj) {
            servicioSeleccionado = servObj;
            if (inputServ) inputServ.value = `${servObj.codigo} — ${servObj.descripcion}`;
        } else {
            if (inputServ) inputServ.value = trabajoEditar.TRABAJO || '';
        }
    } else {
        document.getElementById('sheetTitulo').textContent = 'Nuevo Trabajo para Bus';
    }

    renderMiniTabla();

    const overlay = document.getElementById('overlaySheet');
    const hoja = document.getElementById('hojaSheet');
    if (overlay) overlay.classList.add('visible');
    if (hoja) setTimeout(() => hoja.classList.add('visible'), 10);
}

function cerrarSheet() {
    console.log("🚪 [SHEET] Cerrando panel lateral...");
    const overlay = document.getElementById('overlaySheet');
    const hoja = document.getElementById('hojaSheet');
    if (hoja) hoja.classList.remove('visible');
    if (overlay) overlay.classList.remove('visible');
    
    const drop = document.getElementById('dropdownServicios');
    if (drop) drop.style.display = 'none';

    itemsPendientes = [];
    servicioSeleccionado = null;
    trabajoEdicionOriginal = null;
    editIndex = null;
}

// ── DROPDOWN SERVICIOS ──
function buscarServicioDropdown(texto) {
    servicioSeleccionado = null;
    const drop = document.getElementById('dropdownServicios');
    const q = texto.trim().toLowerCase();

    if (!drop || !q) { if (drop) drop.style.display = 'none'; return; }

    const resultados = todosServicios.filter(s =>
        (s.codigo || '').toLowerCase().includes(q) ||
        (s.descripcion || '').toLowerCase().includes(q)
    ).slice(0, 15);

    if (!resultados.length) { drop.style.display = 'none'; return; }

    drop.innerHTML = '';
    drop.style.display = 'block';

    resultados.forEach(s => {
        const div = document.createElement('div');
        div.className = 'dropdown-item';
        div.innerHTML = `<strong style="color:#284B87">${s.codigo}</strong> <span style="color:#64748b;">— ${s.descripcion}</span>`;

        const seleccionar = (e) => {
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
            servicioSeleccionado = s;
            const inputServ = document.getElementById('inputServicio');
            if (inputServ) inputServ.value = `${s.codigo} — ${s.descripcion}`;
            drop.style.display = 'none';
        };

        div.addEventListener('mousedown', seleccionar);
        div.addEventListener('touchstart', seleccionar, { passive: false });
        drop.appendChild(div);
    });
}

// ── ESTADO Y MINI TABLA ──
function agregarItemPendiente() {
    const inputServ = document.getElementById('inputServicio');
    const textoInput = inputServ ? inputServ.value.trim() : '';

    if (!textoInput) {
        mostrarToast('Ingresa un servicio o descripción', 'err');
        return;
    }

    const descItem = (servicioSeleccionado ? servicioSeleccionado.descripcion : textoInput).toUpperCase();
    const codItem  = servicioSeleccionado ? servicioSeleccionado.codigo : '';

    if (editIndex !== null) {
        itemsPendientes[editIndex] = { codigo: codItem, descripcion: descItem };
        editIndex = null;
    } else {
        itemsPendientes.push({ codigo: codItem, descripcion: descItem });
    }

    resetearInputs();
    renderMiniTabla();

    if (inputServ) inputServ.focus();
}

function cargarItemParaEditar(idx) {
    const item = itemsPendientes[idx];
    if (!item) return;

    const servObj = todosServicios.find(s => s.descripcion === item.descripcion || s.codigo === item.codigo);
    const inputServ = document.getElementById('inputServicio');

    if (servObj) {
        servicioSeleccionado = servObj;
        if (inputServ) inputServ.value = `${servObj.codigo} — ${servObj.descripcion}`;
    } else {
        servicioSeleccionado = null;
        if (inputServ) inputServ.value = item.descripcion;
    }

    editIndex = idx;
}

function quitarItemPendiente(idx, event) {
    if (event) event.stopPropagation();
    itemsPendientes.splice(idx, 1);

    if (editIndex === idx) {
        editIndex = null;
        resetearInputs();
    } else if (editIndex > idx) {
        editIndex--;
    }

    renderMiniTabla();
}

function resetearInputs() {
    servicioSeleccionado = null;
    editIndex = null;
    const inputServ = document.getElementById('inputServicio');
    if (inputServ) inputServ.value = '';

    const drop = document.getElementById('dropdownServicios');
    if (drop) drop.style.display = 'none';
}

function renderMiniTabla() {
    const tbody = document.getElementById('miniTablaBody');
    if (!tbody) return;

    console.log(`📊 [MINI TABLA] Renders con ${itemsPendientes.length} tareas:`, itemsPendientes);

    if (!itemsPendientes.length) {
        tbody.innerHTML = `<tr><td colspan="3" class="mini-tabla-vacia" style="text-align:center;color:#94a3b8;padding:15px;">Aún no hay servicios. Agrega tareas arriba.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    itemsPendientes.forEach((item, idx) => {
        const tr = document.createElement('tr');
        if (idx === editIndex) tr.style.backgroundColor = '#f1f5f9';
        tr.style.cursor = 'pointer';
        tr.onclick = () => cargarItemParaEditar(idx);

        tr.innerHTML = `
            <td class="mt-codigo">${item.codigo || '—'}</td>
            <td class="mt-desc">${item.descripcion}</td>
            <td class="mt-del">
                <button 
                    class="btn-mini-del" 
                    onclick="quitarItemPendiente(${idx}, event)" 
                    style="background:none;border:none;cursor:pointer;color:#dc2626;font-weight:bold;padding:4px 8px;">✕</button>
            </td>`;
        tbody.appendChild(tr);
    });
}

// ── CONFIRMAR → SUPABASE ──
async function confirmarSalidas() {
    if (!itemsPendientes.length) {
        mostrarToast('Agrega al menos un servicio', 'err');
        return;
    }

    const inputTec = document.getElementById('inputTecnico');
    const tecnico  = inputTec ? inputTec.value.trim() : '';
    const idBus    = document.getElementById('selBus').value;

    if (!idBus) {
        mostrarToast('Selecciona el bus', 'err');
        return;
    }

    const busObj = todosBuses.find(b => String(b.id) === String(idBus));
    if (!busObj) {
        mostrarToast('Bus no válido', 'err');
        return;
    }

    const btn = document.getElementById('btnConfirmar');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Guardando…';
    }

    const hoy = fechaHoy();

    try {
        if (trabajoEdicionOriginal) {
            const { error: errDelete } = await sb
                .from('trabajos')
                .delete()
                .eq('id', trabajoEdicionOriginal.id);

            if (errDelete) throw errDelete;
        }

        for (const item of itemsPendientes) {
            const { error: errInsert } = await sb.from('trabajos').insert({
                FECHA:   hoy,
                CLIENTE: busObj.cliente ? busObj.cliente.toUpperCase() : null,
                EMPRESA: null,
                N_BUS:   busObj.bus     ? busObj.bus.toUpperCase()     : null,
                PLACA:   busObj.placa   ? busObj.placa.toUpperCase()   : null,
                TRABAJO: item.descripcion ? item.descripcion.toUpperCase() : null,
                tecnico: tecnico         ? tecnico.toUpperCase()         : null
            });

            if (errInsert) throw errInsert;
        }

        trabajoEdicionOriginal = null;
        cerrarSheet();
        await cargarTrabajos();
        
        const txtBuscar = document.getElementById('txtBuscar')?.value || '';
        renderizarTodo(txtBuscar);
        mostrarToast('Trabajos asignados correctamente', 'ok');

    } catch (err) {
        console.error('❌ Error guardando:', err);
        mostrarToast('Error al guardar: ' + (err.message || 'Error desconocido'), 'err');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Confirmar y guardar';
        }
    }
}

// ── MENÚ CONTEXTUAL Y ELIMINACIÓN ──
function ocultarMenuContextual() {
    const menu = document.getElementById('menuContextual');
    if (menu) menu.classList.remove('visible');
}

function abrirMenuContextual(e, trabajo) {
    if (e) {
        e.stopPropagation();
        e.preventDefault();
    }

    trabajoEnContexto = { ...trabajo };

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
    if (!trabajoEnContexto) return;
    abrirSheet(trabajoEnContexto);
}

function confirmarEliminacionUI(mensaje) {
    return new Promise((resolve) => {
        let modal = document.getElementById('modalConfirmarEliminar');

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
                    <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 16px;">¿Eliminar trabajo?</h4>
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
    if (!trabajoEnContexto) return;

    const t = trabajoEnContexto;
    const verificado = await confirmarEliminacionUI(`Se eliminará la tarea "${t.TRABAJO}" asignada al bus ${t.PLACA || t.N_BUS}.`);
    if (!verificado) return;

    try {
        const { error } = await sb.from('trabajos').delete().eq('id', t.id);
        if (error) throw error;

        todosTrabajos = todosTrabajos.filter(x => x.id !== t.id);
        
        const txtBuscar = document.getElementById('txtBuscar')?.value || '';
        renderizarTodo(txtBuscar);
        mostrarToast('Trabajo eliminado correctamente', 'ok');

    } catch (err) {
        mostrarToast('Error al eliminar: ' + err.message, 'err');
    }
}

// ── UTILIDADES ──
function fechaHoy() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

let toastTimer = null;
function mostrarToast(msg, tipo = '') {
    console.log(`💬 [TOAST ${tipo.toUpperCase()}] ${msg}`);
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'visible ' + tipo;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.className = '', 3000);
}

function construirSystemPromptIA() {
    const catalogoServicios = todosServicios.map(s => `${s.codigo}: ${s.descripcion}`).join('\n');
    
    // Cambiamos para mostrar claramente el ID como texto exacto
    const catalogoBuses = todosBuses.map(b => 
        `ID: "${b.id}" | Placa: ${b.placa} | Identificador/Bus: ${b.bus} | Cliente: ${b.cliente || 'N/A'}`
    ).join('\n');

    return `Eres un asistente experto para THERMOAIR SAS. Tu objetivo es interpretar reportes dictados por técnicos de taller y estructurar los datos extraídos.

CATÁLOGO DE SERVICIOS DISPONIBLES:
${catalogoServicios}

BUSES REGISTRADOS EN TALLER (ACTIVOS):
${catalogoBuses}

INSTRUCCIONES CRÍTICAS PARA EL BUS:
1. Analiza el reporte del técnico e identifica a qué bus se refiere (puede usar la placa, el número interno del bus, o nombres descriptivos como "bus de prueba", "el de prueba", etc.).
2. Devuelve "id_bus" exactamente con el valor completo del campo ID que aparece entre comillas en la lista (ej: "BUS-1784995292581"). Si no logras identificarlo con certeza, devuelve null.
3. Extrae el nombre del técnico responsable en "tecnico" (string o null).
4. Extrae la lista de tareas en "servicios":
   - Si la tarea coincide con un servicio del catálogo, usa EXACTAMENTE su descripción y código.
   - Si es un trabajo custom o no está en el catálogo, asigna "codigo": null y escribe la "descripcion" en MAYÚSCULAS.`;
}

// ── FUNCIÓN DE PROCESAMIENTO AUTOMÁTICO DE IA ──
async function procesarTextoConIA(textoReporte) {
    mostrarToast('Analizando reporte con Gemini IA...', '');
    
    try {
        const systemPrompt = construirSystemPromptIA();

        const payload = {
            contents: [
                {
                    parts: [
                        { text: systemPrompt },
                        { text: `Reporte del técnico: "${textoReporte}"\n\nDevuelve exclusivamente un objeto JSON válido con las claves: id_bus (string exacto con el ID del bus entre comillas de la lista o null), tecnico (string o null), y servicios (array de objetos con codigo y descripcion). No incluyas markdown ni bloques de código de ningún tipo en la respuesta, solo el JSON plano.` }
                    ]
                }
            ],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        const response = await fetch(GEMINI_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) throw new Error('Error en la comunicación con la API de Gemini');

        const data = await response.json();
        const textoRespuesta = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!textoRespuesta) throw new Error('La IA no devolvió una respuesta válida');

        const resultadoIA = JSON.parse(textoRespuesta);
        console.log("🤖 [IA RESPUESTA]", resultadoIA);

        if (!resultadoIA || !resultadoIA.servicios || resultadoIA.servicios.length === 0) {
            mostrarToast('La IA no pudo extraer servicios del reporte', 'err');
            return;
        }

        // Buscar el bus por ID exacto, o respaldar buscando por placa/número si la IA falló
        let busObj = todosBuses.find(b => String(b.id) === String(resultadoIA.id_bus));
        
        if (!busObj && (resultadoIA.placa || resultadoIA.n_bus)) {
            const p = (resultadoIA.placa || '').toUpperCase();
            const nb = (resultadoIA.n_bus || '').toUpperCase();
            busObj = todosBuses.find(b => 
                (p && b.placa && b.placa.toUpperCase() === p) ||
                (nb && b.bus && b.bus.toUpperCase() === nb)
            );
        }
        
        if (!busObj) {
            console.warn("⚠️ Bus devuelto por la IA no encontrado:", resultadoIA);
            mostrarToast('No se encontró el bus especificado por la IA', 'err');
            return;
        }

        mostrarToast('Guardando automáticamente...', '');
        const hoy = fechaHoy();
        const tecnicoAsignado = resultadoIA.tecnico ? resultadoIA.tecnico.toUpperCase() : null;

        // Insertar cada servicio extraído directamente en Supabase
        for (const item of resultadoIA.servicios) {
            const { error: errInsert } = await sb.from('trabajos').insert({
                FECHA:   hoy,
                CLIENTE: busObj.cliente ? busObj.cliente.toUpperCase() : null,
                EMPRESA: null,
                N_BUS:   busObj.bus     ? busObj.bus.toUpperCase()     : null,
                PLACA:   busObj.placa   ? busObj.placa.toUpperCase()   : null,
                TRABAJO: item.descripcion ? item.descripcion.toUpperCase() : null,
                tecnico: tecnicoAsignado
            });

            if (errInsert) throw errInsert;
        }

        // Actualizar la interfaz y recargar la tabla principal
        await cargarTrabajos();
        const txtBuscar = document.getElementById('txtBuscar')?.value || '';
        renderizarTodo(txtBuscar);
        
        mostrarToast('¡Reporte procesado y guardado con éxito!', 'ok');

    } catch (err) {
        console.error('❌ Error en automatización IA:', err);
        mostrarToast('Error al automatizar: ' + (err.message || 'Error desconocido'), 'err');
    }
}

function verificarYAplicarResultadoIA(datosIA) {
    console.group("⚙️ [APLICAR IA] Inyectando datos en la UI");
    console.log("Datos recibidos:", datosIA);

    if (!datosIA || typeof datosIA !== 'object') {
        console.error("❌ datosIA no es un objeto válido");
        mostrarToast('Estructura de datos no válida.', 'err');
        console.groupEnd();
        return;
    }

    abrirSheet();

    // 1. Asignación del Bus
    const selBus = document.getElementById('selBus');
    if (selBus) {
        if (datosIA.id_bus) {
            console.log(`🎯 Coincidencia directa por id_bus: ${datosIA.id_bus}`);
            selBus.value = datosIA.id_bus;
        } else if (datosIA.placa || datosIA.n_bus) {
            const p = (datosIA.placa || '').toUpperCase();
            const nb = (datosIA.n_bus || '').toUpperCase();
            const busEncontrado = todosBuses.find(b => 
                (p && b.placa && b.placa.toUpperCase() === p) ||
                (nb && b.bus && b.bus.toUpperCase() === nb)
            );
            if (busEncontrado) {
                console.log(`🎯 Bus encontrado por coincidencia de placa/número:`, busEncontrado);
                selBus.value = busEncontrado.id;
            } else {
                console.warn("⚠️ No se encontró coincidencia de bus en la lista abierta.");
            }
        }
    } else {
        console.warn("⚠️ Elemento HTML '#selBus' no encontrado en el DOM");
    }

    // 2. Asignación del Técnico
    const inputTec = document.getElementById('inputTecnico');
    if (inputTec && datosIA.tecnico) {
        inputTec.value = datosIA.tecnico.toUpperCase();
    }

    // 3. Asignación de Servicios/Tareas a la Mini Tabla
    if (Array.isArray(datosIA.servicios) && datosIA.servicios.length > 0) {
        datosIA.servicios.forEach(s => {
            const desc = (s.descripcion || '').toUpperCase();
            const cod = s.codigo || '';
            if (desc) {
                itemsPendientes.push({
                    codigo: cod,
                    descripcion: desc
                });
            }
        });
        renderMiniTabla();
    }

    mostrarToast('Datos procesados e inyectados por la IA', 'ok');
    console.groupEnd();
}