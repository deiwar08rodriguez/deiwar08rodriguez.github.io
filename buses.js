const SUPABASE_URL = "https://vdlxmajvzdtbewchyowm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let listaBuses = [];
let listaSalidas = [];
let mapaProductos = new Map(); 
let timeoutBusqueda;

// ═══════════════════════════════════════════════════════════
//  DOBLE CLIC: VARIABLES Y LÓGICA
// ═══════════════════════════════════════════════════════════
let clickTimer = null;
let busEnContexto = null;
let fotoEditarFile = null;

// ═══════════════════════════════════════════════════════════
//  VISOR DE IMAGEN
// ═══════════════════════════════════════════════════════════
function abrirVisorImagen(urlFoto) {
    if (!urlFoto) return; 
    const modal = document.getElementById('visorImagenModal');
    const img = document.getElementById('imgVisorCompleto');
    if (modal && img) {
        img.src = urlFoto;
        modal.style.display = 'flex';
    }
}

// ═══════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════
let toastTimer = null;
function mostrarToast(msg, tipo = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'visible ' + tipo;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.className = '', 3000);
}

// ═══════════════════════════════════════════════════════════
//  FORMATEO
// ═══════════════════════════════════════════════════════════
function formatoMoneda(valor) {
    return Number(valor ?? 0).toLocaleString("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0
    });
}

function formatoFechaVisual(fechaStr) {
    if (!fechaStr || fechaStr.length !== 10) return fechaStr;
    return `${fechaStr[8]}${fechaStr[9]}/${fechaStr[5]}${fechaStr[6]}/${fechaStr[2]}${fechaStr[3]}`;
}

// ═══════════════════════════════════════════════════════════
//  CARGA INICIAL DE DATOS
// ═══════════════════════════════════════════════════════════
async function inicializarBuses() {
    try {
        console.time("⚡ Carga Paralela Supabase");
        const [resBuses, resSalidas, resProductos] = await Promise.all([
            supabaseClient.from("buses").select("id, fecha, bus, placa, cliente, estado, foto"),
            supabaseClient.from("salidas").select("id, fecha, codigo, cantidad, hora, recibe, tipo, bus"),
            supabaseClient.from("productos").select("codigo, descripcion, precio_venta")
        ]);
        console.timeEnd("⚡ Carga Paralela Supabase");

        if (resBuses.error || resSalidas.error || resProductos.error) {
            throw resBuses.error || resSalidas.error || resProductos.error;
        }

        listaBuses = resBuses.data || [];
        listaSalidas = resSalidas.data || [];
        
        mapaProductos.clear();
        (resProductos.data || []).forEach(p => mapaProductos.set(p.codigo, p));

        renderizarBuses(listaBuses);
    } catch (error) {
        console.error("Error cargando datos:", error);
        mostrarToast('Error al cargar datos', 'err');
    }
}

// ═══════════════════════════════════════════════════════════
//  RENDERIZADO PRINCIPAL
// ═══════════════════════════════════════════════════════════
function renderizarBuses(datosBuses) {
    const contenedor = document.getElementById("contenedorBuses");
    if (!contenedor) return;
    if (datosBuses.length === 0) {
        contenedor.innerHTML = `<p style="text-align:center; color:#284B87; padding:20px; font-weight:bold;">No se encontraron registros.</p>`;
        return;
    }

    // Detectar si el usuario es Técnico
    const sessionArea = sessionStorage.getItem("session_area") || "";
    const esTecnico = sessionArea.toLowerCase().trim() === "tecnico";

    let html = "";
    const salidasPorBus = {};
    listaSalidas.forEach(s => {
        if (!salidasPorBus[s.bus]) salidasPorBus[s.bus] = [];
        salidasPorBus[s.bus].push(s);
    });

    datosBuses.forEach(vehiculo => {
        const salidasDelBus = (salidasPorBus[vehiculo.id] || []).concat(salidasPorBus[vehiculo.bus] || []);
        
        let totalAcumulado = 0;
        let tablaSalidasHtml = "";
        let tarjetasMovilHtml = "";

        salidasDelBus.forEach(salida => {
            const prodReferencia = mapaProductos.get(salida.codigo);
            const descripcion = prodReferencia ? prodReferencia.descripcion : "Servicio / Mano de obra";
            const precioVenta = prodReferencia ? Number(prodReferencia.precio_venta ?? 0) : 0;
            
            const cantidadNum = Number(salida.cantidad ?? 1);
            const subtotal = cantidadNum * precioVenta; 
            totalAcumulado += subtotal;

            const fechaFormateada = formatoFechaVisual(salida.fecha);
            const horaFormateada = salida.hora ? salida.hora.slice(0, 5) : "---";
            const quienRecibe = salida.recibe ?? "---";

            const celdaPrecioHtml = esTecnico ? "" : `<td class="precio">${formatoMoneda(precioVenta)}</td>`;

            tablaSalidasHtml += `
            <tr>
                <td>${fechaFormateada}</td>
                <td>${horaFormateada}</td>
                <td class="col-codigo">${salida.codigo ?? ""}</td>
                <td class="col-descripcion">${descripcion}</td>
                <td class="cantidad">${cantidadNum}</td>
                ${celdaPrecioHtml}
                <td class="col-recibe">${quienRecibe}</td>
            </tr>`;

            const precioMovilHtml = esTecnico ? "" : ` &nbsp;|&nbsp; Precio: ${formatoMoneda(precioVenta)}`;

            tarjetasMovilHtml += `
            <div class="salida-card">
                <div class="salida-desc">${descripcion}</div>
                <div class="salida-codigo-badge">${salida.codigo ?? ""}</div>
                <div class="salida-sub">Cant: ${cantidadNum}${precioMovilHtml}</div>
                <div class="salida-footer">
                    <span>📅 ${fechaFormateada} - ${horaFormateada}</span>
                    <span>👤 ${quienRecibe}</span>
                </div>
            </div>`;
        });

        if (salidasDelBus.length === 0) {
            const totalColumnas = esTecnico ? 6 : 7;
            tablaSalidasHtml = `<tr><td colspan="${totalColumnas}" style="text-align:center; color:#284B87; font-weight:bold; padding:15px;">Sin salidas registradas para este bus</td></tr>`;
            tarjetasMovilHtml = `<div style="text-align:center; color:#284B87; font-weight:bold; padding:10px; font-size:13px;">Sin salidas registradas para este bus</div>`;
        }

        const imgHtml = vehiculo.foto 
            ? `<img src="${vehiculo.foto}" alt="Bus" class="bus-foto">` 
            : `<div class="bus-foto-placeholder">Bus</div>`;

        const esFacturado = vehiculo.estado === "FACTURADO" || vehiculo.estado === "FACTURADO_INTERNO";
        
        let btnTexto = "Facturar";
        if (vehiculo.estado === "FACTURADO") btnTexto = "Facturado (Siigo) ✓";
        if (vehiculo.estado === "FACTURADO_INTERNO") btnTexto = "Facturado (Interno) ✓";
        
        const btnEstilo = esFacturado ? "background:#10b981; cursor:not-allowed;" : "";
        const btnDeshabilitado = esFacturado ? "disabled" : "";

        const nombreEscapado = (vehiculo.bus ?? "Bus sin nombre").replace(/'/g, "\\'");
        const placaEscapada = (vehiculo.placa ?? "---").replace(/'/g, "\\'");

        const textoTotalCabecera = esTecnico ? "" : ` &nbsp;|&nbsp; Total: ${formatoMoneda(totalAcumulado)}`;

        const thPrecioHtml = esTecnico ? "" : `<th style="text-align:right;">P VENTA</th>`;

        const btnFacturarHtml = esTecnico ? "" : `
        <div class="panel-acciones">
            <button class="btn-facturar" style="${btnEstilo}" ${btnDeshabilitado} id="btn-fac-${vehiculo.id}" onclick="event.stopPropagation(); prepararYRedireccionarFacturacion('${vehiculo.id}', '${nombreEscapado}', '${placaEscapada}')">${btnTexto}</button>
        </div>`;

        html += `
        <div class="bus-item" id="bus-${vehiculo.id}" data-bus-id="${vehiculo.id}">
            <div class="bus-header" data-bus-id="${vehiculo.id}">
                <div class="bus-foto-wrapper" onclick="event.stopPropagation(); abrirVisorImagen('${vehiculo.foto}')">${imgHtml}</div>
                <div class="bus-info-main">
                    <div class="bus-titulo">${vehiculo.bus ?? "Bus sin nombre"}</div>
                    <div class="bus-detalles-linea1">Placa: ${vehiculo.placa ?? "---"} &nbsp;|&nbsp; Cliente: ${vehiculo.cliente ?? "---"}</div>
                    <div class="bus-detalles-linea2">Salidas: ${salidasDelBus.length}${textoTotalCabecera}</div>
                </div>
                <div class="bus-flecha">▼</div>
            </div>
            <div class="bus-detalle-panel">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>FECHA</th><th>HORA</th><th>CODIGO</th><th>DESCRIPCION</th><th style="text-align:center;">CANT</th>${thPrecioHtml}<th>RECIBE</th>
                            </tr>
                        </thead>
                        <tbody>${tablaSalidasHtml}</tbody>
                    </table>
                </div>
                <div class="mobile-cards-salidas">${tarjetasMovilHtml}</div>
                ${btnFacturarHtml}
            </div>
        </div>`;
    });

    contenedor.innerHTML = html;
    bindClickHandlers();
}

// ═══════════════════════════════════════════════════════════
//  BIND: DETECTAR SINGLE VS DOUBLE CLICK
// ═══════════════════════════════════════════════════════════
function bindClickHandlers() {
    document.querySelectorAll('.bus-header').forEach(header => {
        header.addEventListener('click', handleBusClick);
    });
}

function handleBusClick(e) {
    const idBus = e.currentTarget.dataset.busId;
    if (!idBus) return;

    // Si es doble clic, detener el acordeón
    if (clickTimer !== null) {
        clearTimeout(clickTimer);
        clickTimer = null;
        // Es un doble clic, NO hacer nada aquí
        return;
    }

    // Es un clic simple, programar posible doble clic
    clickTimer = setTimeout(() => {
        // Pasó el tiempo de tolerancia sin otro clic → es un clic simple
        toggleAcordeonBuses(`bus-${idBus}`);
        clickTimer = null;
    }, 300); // 300ms de tolerancia para detectar doble clic
}

// ═══════════════════════════════════════════════════════════
//  TOGGLE ACORDEÓN
// ═══════════════════════════════════════════════════════════
function toggleAcordeonBuses(idElemento) {
    const itemActual = document.getElementById(idElemento);
    if (!itemActual) return;
    const estaAbierto = itemActual.classList.contains("abierto");
    
    document.querySelectorAll(".bus-item.abierto").forEach(item => item.classList.remove("abierto"));
    if (!estaAbierto) itemActual.classList.add("abierto");
}

// ═══════════════════════════════════════════════════════════
//  BÚSQUEDA EN TIEMPO REAL
// ═══════════════════════════════════════════════════════════
document.getElementById("txtBuscar").addEventListener("input", function () {
    clearTimeout(timeoutBusqueda);
    const texto = this.value.trim().toUpperCase();

    timeoutBusqueda = setTimeout(() => {
        if (texto === "") {
            renderizarBuses(listaBuses);
            return;
        }
        const filtrados = listaBuses.filter(b => 
            String(b.bus ?? "").toUpperCase().includes(texto) ||
            String(b.placa ?? "").toUpperCase().includes(texto)
        );
        renderizarBuses(filtrados);
    }, 100);
});

// ═══════════════════════════════════════════════════════════
//  PREPARAR FACTURACIÓN
// ═══════════════════════════════════════════════════════════
function prepararYRedireccionarFacturacion(idBus, nombreBus, placaBus) {
    try {
        const vehiculo = listaBuses.find(b => b.id === idBus);
        if (!vehiculo) return;

        const salidasDelBus = listaSalidas.filter(s => String(s.bus) === String(idBus) || String(s.bus) === String(vehiculo.bus));

        const itemsMapeados = salidasDelBus.map(salida => {
            const prodReferencia = mapaProductos.get(salida.codigo);
            return {
                codigo: salida.codigo || 'GENERICO',
                descripcion: prodReferencia ? prodReferencia.descripcion : 'Servicio / Mano de obra',
                cantidad: parseFloat(salida.cantidad) || 1,
                precio_unitario: prodReferencia ? parseFloat(prodReferencia.precio_venta) : 0,
                descuento: 0,
                tipo: (salida.codigo && salida.codigo.startsWith('SR')) ? 'SERVICIO' : 'PRODUCTO'
            };
        });

        const datosFacturacion = {
            cliente: {
                nombre: vehiculo.cliente || '',
                id: '', 
                direccion: '',
                Ciudad: '',
                telefono: ''
            },
            placa: placaBus,
            busNo: nombreBus,
            items: itemsMapeados,
            manoObraGlobal: 0
        };

        localStorage.setItem('datosBusPrecarga', JSON.stringify(datosFacturacion));
        window.location.href = "facturas_ventas.html";

    } catch (err) {
        console.error("Error al preparar los datos de facturación:", err);
        mostrarToast('Error al transferir datos del bus', 'err');
    }
}

// ═══════════════════════════════════════════════════════════
//  MENÚ CONTEXTUAL DOBLE CLIC
// ═══════════════════════════════════════════════════════════
document.addEventListener('dblclick', (e) => {
    const busHeader = e.target.closest('.bus-header');
    if (!busHeader) return;

    const idBus = busHeader.dataset.busId;
    if (!idBus) return;

    // Buscar el bus en la lista
    busEnContexto = listaBuses.find(b => b.id === idBus);
    if (!busEnContexto) return;

    // Mostrar menú contextual
    abrirMenuContextual(e);
});

function abrirMenuContextual(e) {
    const menu = document.getElementById('menuContextual');
    if (!menu) return;

    let x = e.clientX ?? 0;
    let y = e.clientY ?? 0;

    const mw = 200, mh = 80;
    x = Math.max(10, Math.min(x, window.innerWidth - mw - 10));
    y = Math.max(10, Math.min(y, window.innerHeight - mh - 10));

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.classList.add('visible');

    if (navigator.vibrate) navigator.vibrate(20);
}

function ocultarMenuContextual() {
    const menu = document.getElementById('menuContextual');
    if (menu) menu.classList.remove('visible');
}

// Cerrar menú al hacer clic fuera
document.addEventListener('click', (e) => {
    const menu = document.getElementById('menuContextual');
    if (menu && menu.classList.contains('visible') && !menu.contains(e.target)) {
        ocultarMenuContextual();
    }
});

// ═══════════════════════════════════════════════════════════
//  EDITAR BUS
// ═══════════════════════════════════════════════════════════
function editarBusDesdeMenu() {
    ocultarMenuContextual();
    if (!busEnContexto) return;
    
    abrirSheetEdicion(busEnContexto);
}

function abrirSheetEdicion(bus) {
    fotoEditarFile = null;

    // Llenar inputs con datos actuales
    document.getElementById('editBus').value = bus.bus || '';
    document.getElementById('editPlaca').value = bus.placa || '';
    document.getElementById('editCliente').value = bus.cliente || '';

    // Mostrar foto si existe
    const previewBox = document.getElementById('previewEditFoto');
    const iconCamara = document.getElementById('iconEditCamara');
    
    previewBox.innerHTML = '';
    if (bus.foto) {
        previewBox.innerHTML = `<img src="${bus.foto}" alt="Bus">`;
        if (iconCamara) iconCamara.style.display = 'none';
    } else {
        previewBox.appendChild(iconCamara || document.createElement('span'));
        if (iconCamara) iconCamara.style.display = 'block';
    }

    document.getElementById('sheetTitulo').textContent = 'Editar Bus';
    document.getElementById('overlaySheet').classList.add('visible');
    setTimeout(() => document.getElementById('hojaSheet').classList.add('visible'), 10);
}

function cerrarSheetEdicion() {
    document.getElementById('hojaSheet').classList.remove('visible');
    document.getElementById('overlaySheet').classList.remove('visible');
    fotoEditarFile = null;
    busEnContexto = null;
}

// Manejo del cambio de foto
document.getElementById('editFoto').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    fotoEditarFile = file;
    const previewBox = document.getElementById('previewEditFoto');
    const iconCamara = document.getElementById('iconEditCamara');
    
    previewBox.innerHTML = '';
    const reader = new FileReader();
    reader.onload = (evt) => {
        previewBox.innerHTML = `<img src="${evt.target.result}" alt="Preview">`;
    };
    reader.readAsDataURL(file);
    if (iconCamara) iconCamara.style.display = 'none';
});

// Guardar cambios del bus
document.getElementById('btnConfirmarEdicion').addEventListener('click', async () => {
    if (!busEnContexto) return;

    const nombreNuevo = document.getElementById('editBus').value.trim();
    const placaNueva = document.getElementById('editPlaca').value.trim().toUpperCase();
    const clienteNuevo = document.getElementById('editCliente').value.trim();

    if (!nombreNuevo || !placaNueva) {
        mostrarToast('Completa los campos obligatorios', 'err');
        return;
    }

    const btn = document.getElementById('btnConfirmarEdicion');
    btn.disabled = true;
    btn.textContent = 'Guardando…';

    try {
        let fotoUrl = busEnContexto.foto;

        // Si hay foto nueva, subirla
        if (fotoEditarFile) {
            const fileExt = fotoEditarFile.name.split('.').pop();
            const fileName = `${busEnContexto.id}_${placaNueva}.${fileExt}`;

            await supabaseClient.storage.from('buses').upload(fileName, fotoEditarFile, { upsert: true });
            const { data: urlData } = supabaseClient.storage.from('buses').getPublicUrl(fileName);
            fotoUrl = urlData?.publicUrl || busEnContexto.foto;
        }

        // Actualizar en Supabase
        const { error } = await supabaseClient
            .from('buses')
            .update({
                bus: nombreNuevo,
                placa: placaNueva,
                cliente: clienteNuevo,
                foto: fotoUrl
            })
            .eq('id', busEnContexto.id);

        if (error) throw error;

        // Actualizar localmente
        const busLocal = listaBuses.find(b => b.id === busEnContexto.id);
        if (busLocal) {
            busLocal.bus = nombreNuevo;
            busLocal.placa = placaNueva;
            busLocal.cliente = clienteNuevo;
            busLocal.foto = fotoUrl;
        }

        cerrarSheetEdicion();
        renderizarBuses(listaBuses);
        mostrarToast('Bus actualizado correctamente', 'ok');

    } catch (err) {
        console.error('Error guardando:', err);
        mostrarToast('Error al guardar: ' + (err.message || 'Error desconocido'), 'err');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar cambios';
    }
});

// ═══════════════════════════════════════════════════════════
//  ELIMINAR BUS
// ═══════════════════════════════════════════════════════════
function eliminarBusDesdeMenu() {
    ocultarMenuContextual();
    if (!busEnContexto) return;

    confirmarEliminacionUI(`¿Eliminar el bus "${busEnContexto.bus}"? No se pueden recuperar los datos después.`).then(async (verificado) => {
        if (!verificado) return;

        try {
            // Eliminar en Supabase
            const { error } = await supabaseClient
                .from('buses')
                .delete()
                .eq('id', busEnContexto.id);

            if (error) throw error;

            // Actualizar localmente
            listaBuses = listaBuses.filter(b => b.id !== busEnContexto.id);
            
            renderizarBuses(listaBuses);
            mostrarToast('Bus eliminado correctamente', 'ok');

        } catch (err) {
            console.error('Error eliminando:', err);
            mostrarToast('Error al eliminar: ' + (err.message || 'Error desconocido'), 'err');
        }

        busEnContexto = null;
    });
}

// Modal personalizado de confirmación
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
                    <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 16px;">¿Eliminar bus?</h4>
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

// ═══════════════════════════════════════════════════════════
//  CERRAR SHEET
// ═══════════════════════════════════════════════════════════
document.getElementById('overlaySheet').addEventListener('click', (e) => {
    if (e.target.id === 'overlaySheet') cerrarSheetEdicion();
});

document.getElementById('sheetHandle').addEventListener('click', cerrarSheetEdicion);

// ═══════════════════════════════════════════════════════════
//  INICIALIZADORES DEL DOCUMENTO
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", () => {
    const btnAbrirFlotante = document.getElementById('btnAbrirFlotante');
    const overlayFlotante = document.getElementById('overlayFlotante');
    const hojaFlotante = document.getElementById('hojaFlotante');
    const btnCerrarFlotante = document.getElementById('btnCerrarFlotante');
    const frmNuevoBus = document.getElementById('frmNuevoBus');
    const inputFoto = document.getElementById('regFoto');
    const imgPreview = document.getElementById('imgPreview');
    const iconCamara = document.getElementById('iconCamara');

    function abrirModal() {
        overlayFlotante.style.display = 'block';
        setTimeout(() => { hojaFlotante.style.bottom = '0'; }, 10);
    }

    function cerrarModal() {
        hojaFlotante.style.bottom = '-100%';
        setTimeout(() => {
            overlayFlotante.style.display = 'none';
            frmNuevoBus.reset();
            if (imgPreview) imgPreview.style.display = 'none';
            if (iconCamara) iconCamara.style.display = 'block';
        }, 200);
    }

    if (btnAbrirFlotante) btnAbrirFlotante.addEventListener('click', abrirModal);
    if (btnCerrarFlotante) btnCerrarFlotante.addEventListener('click', cerrarModal);
    if (overlayFlotante) overlayFlotante.addEventListener('click', (e) => { if (e.target === overlayFlotante) cerrarModal(); });

    if (inputFoto) {
        inputFoto.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file && imgPreview && iconCamara) {
                imgPreview.src = URL.createObjectURL(file);
                imgPreview.style.display = 'block';
                iconCamara.style.display = 'none';
            }
        });
    }

    if (frmNuevoBus) {
        frmNuevoBus.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const bus = document.getElementById('regBus').value;
            const placa = document.getElementById('regPlaca').value.toUpperCase().replace(/\s+/g, '');
            const fotoFile = inputFoto ? inputFoto.files[0] : null;

            const idUnico = 'BUS-' + Date.now();
            const fechaActual = new Date().toISOString().split('T')[0];
            
            const objetoLocalTemporal = {
                id: idUnico,
                fecha: fechaActual,
                bus: bus,
                placa: placa,
                cliente: "---",
                estado: "ABIERTO",
                foto: fotoFile ? URL.createObjectURL(fotoFile) : '' 
            };

            listaBuses.unshift(objetoLocalTemporal);
            renderizarBuses(listaBuses);
            cerrarModal();

            try {
                let publicUrl = '';
                if (fotoFile) {
                    const fileExt = fotoFile.name.split('.').pop();
                    const fileName = `${idUnico}_${placa}.${fileExt}`;

                    await supabaseClient.storage.from('buses').upload(fileName, fotoFile);
                    const { data: urlData } = supabaseClient.storage.from('buses').getPublicUrl(fileName);
                    publicUrl = urlData?.publicUrl || '';
                }

                await supabaseClient.from('buses').insert([{
                    id: idUnico,
                    fecha: fechaActual,
                    bus: bus,
                    placa: placa,
                    cliente: "---",
                    estado: "ABIERTO",
                    foto: publicUrl
                }]);
                
                if (publicUrl) {
                    const busInsertado = listaBuses.find(b => b.id === idUnico);
                    if (busInsertado) busInsertado.foto = publicUrl;
                }

                mostrarToast('Bus creado exitosamente', 'ok');

            } catch (err) {
                console.error("Error asíncrono de guardado remoto:", err);
                mostrarToast('Error al guardar el bus remotamente', 'err');
            }
        });
    }
});

inicializarBuses();