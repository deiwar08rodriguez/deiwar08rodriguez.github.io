// THERMOAIR SAS - SERVICIOS Y TRABAJOS EN TALLER

// ── CONFIGURACIÓN SUPABASE ──
const SUPABASE_URL  = 'https://vdlxmajvzdtbewchyowm.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM';

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── ESTADO GLOBAL ──
let todosTrabajos   = [];  // Trabajos de la tabla 'trabajos'
let todosServicios  = [];  // { codigo, descripcion, precio } del catálogo
let todosBuses      = [];  // { id, bus, placa, cliente, empresa, estado }
let itemsPendientes = [];  // Servicios acumulados en el sheet antes de confirmar

// Edición
let trabajoEnContexto = null;
let trabajoEdicionOriginal = null;
let editIndex = null;

// Dropdown servicio seleccionado
let servicioSeleccionado = null;

// ── INIT ──
document.addEventListener('DOMContentLoaded', async () => {
    await Promise.all([cargarServicios(), cargarBuses()]);
    await cargarTrabajos();
    renderizarTodo();
    bindUI();
});

// ── CARGA DE DATOS ──
async function cargarServicios() {
    const { data, error } = await sb.from('servicios').select('codigo, descripcion, precio');
    if (error) { 
        console.error('Error cargando servicios:', error); 
        mostrarToast('Error al cargar servicios', 'err');
        return; 
    }
    todosServicios = data || [];
}

async function cargarBuses() {
    // Se elimina 'empresa' del .select() porque no existe en la tabla buses
    const { data, error } = await sb
        .from('buses')
        .select('id, bus, placa, estado, cliente') 
        .eq('estado', 'ABIERTO')
        .order('placa');

    if (error) { 
        console.error('Error cargando buses:', error); 
        mostrarToast('Error al cargar buses', 'err');
        return; 
    }

    todosBuses = data || [];

    // Poblar select del sheet
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
    const { data, error } = await sb
        .from('trabajos')
        .select('*')
        .order('FECHA', { ascending: false })
        .order('id', { ascending: false });

    if (error) { 
        console.error('Error cargando trabajos:', error); 
        mostrarToast('Error al cargar trabajos', 'err');
        return; 
    }
    todosTrabajos = data || [];
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
        
        // ── DETECTAR TECLA ENTER ──
        inputServ.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Evita el submit del formulario si existe
                
                // Ocultar dropdown si está visible
                const drop = document.getElementById('dropdownServicios');
                if (drop) drop.style.display = 'none';

                // Agregar el ítem a la mini tabla
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
}

// ── SHEET: ABRIR / CERRAR ──
function abrirSheet(trabajoEditar = null) {
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

        // Buscar bus por coincidencia de placa o n_bus
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

    document.getElementById('overlaySheet').classList.add('visible');
    setTimeout(() => document.getElementById('hojaSheet').classList.add('visible'), 10);
}

function cerrarSheet() {
    document.getElementById('hojaSheet').classList.remove('visible');
    document.getElementById('overlaySheet').classList.remove('visible');
    
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

    // Reenfocar el input para seguir escribiendo de inmediato
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
        // En caso de edición borramos el registro previo
        if (trabajoEdicionOriginal) {
            const { error: errDelete } = await sb
                .from('trabajos')
                .delete()
                .eq('id', trabajoEdicionOriginal.id);

            if (errDelete) throw errDelete;
        }

        // Dentro de confirmarSalidas(), ajusta el objeto que mandas en el .insert():

        for (const item of itemsPendientes) {
            const { error: errInsert } = await sb.from('trabajos').insert({
                FECHA:   hoy,
                CLIENTE: busObj.cliente ? busObj.cliente.toUpperCase() : null,
                EMPRESA: busObj.empresa ? busObj.empresa.toUpperCase() : null,
                N_BUS:   busObj.bus     ? busObj.bus.toUpperCase()     : null,
                PLACA:   busObj.placa   ? busObj.placa.toUpperCase()   : null,
                TRABAJO: item.descripcion ? item.descripcion.toUpperCase() : null, // <--- Forzar mayúsculas
                tecnico: tecnico          ? tecnico.toUpperCase()          : null  // <--- Forzar mayúsculas
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
        console.error('Error guardando:', err);
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
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'visible ' + tipo;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.className = '', 3000);
}

// =========================================================================
// ── MÓDULO DE INTELIGENCIA ARTIFICIAL (IA, PROMPTS, PARSEO Y VERIFICACIÓN) ──
// =========================================================================

// Configuración del endpoint (Ajusta la URL y API Key de tu proveedor LLM o Edge Function)
const IA_API_URL = 'https://api.openai.com/v1/chat/completions'; // O tu endpoint proxy de Supabase Edge Functions
const IA_API_KEY = 'TU_API_KEY_AQUI'; // En producción, es ideal llamarlo a través de Supabase Edge Functions para no exponer la Key

/**
 * 1. CONSTRUCTOR DEL PROMPT DE SISTEMA
 * Injecta el catálogo actual de servicios y buses en el prompt para guiar al modelo LLM.
 */
function construirSystemPromptIA() {
    // Formatear catálogo reduciendo tokens
    const catalogoServicios = todosServicios.map(s => `${s.codigo}: ${s.descripcion}`).join('\n');
    const catalogoBuses = todosBuses.map(b => `ID:${b.id} | Placa:${b.placa} | Bus:${b.bus} | Cliente:${b.cliente || 'N/A'}`).join('\n');

    return `Eres un asistente experto para THERMOAIR SAS. Tu objetivo es interpretar notas de voz o texto escrito por técnicos de taller y estructurar los datos en formato JSON estricto.

CATÁLOGO DE SERVICIOS DISPONIBLES (código: descripción):
${catalogoServicios}

BUSES REGISTRADOS EN TALLER:
${catalogoBuses}

INSTRUCCIONES DE EXTRACCIÓN Y MATCHING:
1. Identifica el bus (por Placa o Número de Bus/N_BUS). Si coincide con el catálogo, extrae su "id_bus".
2. Identifica el técnico responsable mencionado. Si no hay técnico, asigna null.
3. Extrae la lista de trabajos/servicios realizados:
   - Si la descripción coincide o se parece mucho a un servicio del catálogo, usa EXACTAMENTE la descripción del catálogo y extrae su "codigo".
   - Si es un trabajo custom o no estándar, pon "codigo": null y escribe la "descripcion" en MAYÚSCULAS y limpia.
4. Devuelve ÚNICAMENTE un objeto JSON válido sin bloques markdown markdown (\`\`\`json) ni texto explicativo adicional.

ESTRUCTURA DE RESPUESTA REQUERIDA (JSON):
{
  "bus_identificado": {
    "id": number | null,
    "placa": "string" | null,
    "n_bus": "string" | null
  },
  "tecnico": "string" | null,
  "servicios": [
    {
      "codigo": "string" | null,
      "descripcion": "string"
    }
  ],
  "confianza": "ALTA" | "MEDIA" | "BAJA",
  "observaciones": "string" | null
}`;
}

/**
 * 2. PROCESAMIENTO DE TRANSCRIPCIÓN CON LA IA
 * Recibe el texto de la dictada por voz/teclado y consulta al modelo.
 */
async function procesarTextoConIA(transcripcionTexto) {
    if (!transcripcionTexto || !transcripcionTexto.trim()) {
        mostrarToast('Por favor ingresa o dicta una orden de trabajo.', 'err');
        return null;
    }

    mostrarToast('Analizando reporte con IA...', '');

    const systemPrompt = construirSystemPromptIA();
    const userPrompt = `Transcripción a procesar: "${transcripcionTexto}"`;

    try {
        const response = await fetch(IA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${IA_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini', // O el modelo configurado
                temperature: 0.1,    // Temperatura baja para consistencia estructural
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`Error en el servicio de IA: ${response.statusText}`);
        }

        const data = await response.json();
        const rawContent = data.choices[0].message.content;

        // 3. PARSEO Y SANITIZACIÓN DEL JSON
        const resultadoEstructurado = sanitizarYParsearJSON(rawContent);
        
        // 4. VERIFICACIÓN Y CARGA EN LA UI
        verificarYAplicarResultadoIA(resultadoEstructurado);

    } catch (err) {
        console.error('Error al procesar con IA:', err);
        mostrarToast('Error procesando el texto con IA: ' + err.message, 'err');
    }
}

/**
 * 3. SANITIZACIÓN Y PARSEO ESTRUCTURADO DE JSON
 * Limpia cercas markdown y caracteres indeseados antes de hacer JSON.parse.
 */
function sanitizarYParsearJSON(rawText) {
    if (!rawText) throw new Error('La respuesta de la IA está vacía.');

    // Eliminar etiquetas de bloque de código ```json ... ``` si las incluye
    let cleanText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();

    try {
        return JSON.parse(cleanText);
    } catch (e) {
        console.error('Error parseando JSON raw:', cleanText);
        throw new Error('La respuesta devuelta por la IA no tiene un formato JSON válido.');
    }
}

/**
 * 4. VERIFICACIÓN Y AUTOPROCESAMIENTO EN EL SHEET DE TRABAJOS
 * Valida la respuesta de la IA, autoselecciona el bus y puebla la mini tabla de ítems.
 */
function verificarYAplicarResultadoIA(datosIA) {
    if (!datosIA || typeof datosIA !== 'object') {
        mostrarToast('Estructura de datos no válida.', 'err');
        return;
    }

    // Abrir la hoja lateral (Sheet) limpia
    abrirSheet();

    // A. Verificar y asignar Bus
    if (datosIA.bus_identificado && datosIA.bus_identificado.id) {
        const selBus = document.getElementById('selBus');
        if (selBus) {
            selBus.value = datosIA.bus_identificado.id;
        }
    } else if (datosIA.bus_identificado?.placa || datosIA.bus_identificado?.n_bus) {
        // Búsqueda secundaria por si no devolvió ID exacto
        const busCoincidente = todosBuses.find(b => 
            (datosIA.bus_identificado.placa && b.placa.includes(datosIA.bus_identificado.placa)) ||
            (datosIA.bus_identificado.n_bus && b.bus.includes(datosIA.bus_identificado.n_bus))
        );
        if (busCoincidente) {
            const selBus = document.getElementById('selBus');
            if (selBus) selBus.value = busCoincidente.id;
        }
    }

    // B. Verificar y asignar Técnico
    if (datosIA.tecnico) {
        const inputTec = document.getElementById('inputTecnico');
        if (inputTec) inputTec.value = datosIA.tecnico.toUpperCase();
    }

    // C. Cargar los servicios en la lista de itemsPendientes
    if (Array.isArray(datosIA.servicios) && datosIA.servicios.length > 0) {
        itemsPendientes = datosIA.servicios.map(serv => ({
            codigo: serv.codigo || '',
            descripcion: (serv.descripcion || '').toUpperCase()
        }));

        renderMiniTabla();
        mostrarToast(`Se detectaron ${itemsPendientes.length} tareas con IA`, 'ok');
    } else {
        mostrarToast('Se identificó el bus, pero no se extrajeron servicios.', 'err');
    }
}

// ── EVENT LISTENERS RECOMENDADOS PARA INTEGRAR EN TU BIND UI ──
/*
// Puedes vincular un botón de dictado/procesamiento rápido así:
const btnProcesarIA = document.getElementById('btnProcesarIA');
if (btnProcesarIA) {
    btnProcesarIA.addEventListener('click', () => {
        const textoEntrada = prompt('Ingresa o dicta el reporte de trabajo:');
        if (textoEntrada) {
            procesarTextoConIA(textoEntrada);
        }
    });
}
*/