const SUPABASE_URL = "https://vdlxmajvzdtbewchyowm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let listaBusesActivos = [];
let listaBusesHistorial = [];
let listaSalidas = [];
let listaTrabajos = [];
let mapaProductos = new Map(); 
let timeoutBusqueda;

// VARIABLES GLOBALES DE EDICIÓN Y GESTIÓN
let busEnContexto = null;
let fotoEditarFile = null;
let touchStartX = 0;
let touchStartY = 0;
let touchItem = null;
let touchPreventClick = false;

// VISOR DE IMAGEN
function abrirVisorImagen(urlFoto) {
    if (!urlFoto) return; 
    const modal = document.getElementById('visorImagenModal');
    const img = document.getElementById('imgVisorCompleto');
    if (modal && img) {
        img.src = urlFoto;
        modal.style.display = 'flex';
    }
}

// TOAST
let toastTimer = null;
function mostrarToast(msg, tipo = '') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'visible ' + tipo;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.className = '', 3000);
}

// ═══════════════════════════════════════════════════════════
// FORMATEO
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
// CARGA INICIAL DE DATOS
// ═══════════════════════════════════════════════════════════
async function inicializarBuses() {
    try {
        console.time("⚡ Carga Paralela Supabase");
        const [resBuses, resSalidas, resProductos, resTrabajos] = await Promise.all([
            supabaseClient
                .from("buses")
                .select("id, fecha, bus, placa, cliente, estado, foto"),
            supabaseClient.from("salidas").select("id, fecha, codigo, cantidad, hora, recibe, tipo, bus"),
            supabaseClient.from("productos").select("codigo, descripcion, precio_venta"),
            supabaseClient.from("trabajos").select("id, FECHA, N_BUS, TRABAJO, PLACA, tecnico")
        ]);
        console.timeEnd("⚡ Carga Paralela Supabase");

        const errorConsulta = resBuses.error || resSalidas.error || resProductos.error || resTrabajos.error;
        if (errorConsulta) throw errorConsulta;

        const todosBuses = resBuses.data || [];
        listaBusesActivos = todosBuses.filter(b => b.estado === "ABIERTO");
        listaBusesHistorial = todosBuses.filter(b => b.estado !== "ABIERTO");
        
        listaSalidas = resSalidas.data || [];
        listaTrabajos = resTrabajos.data || [];
        
        mapaProductos.clear();
        (resProductos.data || []).forEach(p => mapaProductos.set(p.codigo, p));

        renderizarBuses();
    } catch (error) {
        console.error("Error cargando datos:", error);
        mostrarToast('Error al cargar datos de red', 'err');
    }
}

// Obtener lista según pestaña activa
function obtenerListaBusesActual() {
    return window.tabBusActual === 'activos' ? listaBusesActivos : listaBusesHistorial;
}

// RENDERIZAR BUSES (Actualizado)
function renderizarBuses(datosBuses = null) {
    const contenedor = document.getElementById("contenedorBuses");
    if (!contenedor) return;

    // Si no pasan datos, usar la lista según la pestaña activa
    if (datosBuses === null) {
        datosBuses = obtenerListaBusesActual();
    }

    if (datosBuses.length === 0) {
        const mensajeVacio = window.tabBusActual === 'activos' 
            ? "No hay buses activos registrados."
            : "No hay historial de buses disponible.";
        contenedor.innerHTML = `<p style="text-align:center; color:#284B87; padding:20px; font-weight:bold;">${mensajeVacio}</p>`;
        return;
    }

    const sessionArea = sessionStorage.getItem("session_area") || "";
    const esTecnico = sessionArea.toLowerCase().trim() === "tecnico";
    const esHistorial = window.tabBusActual === 'historial';

    let html = "";
    const salidasPorBus = {};
    listaSalidas.forEach(s => {
        if (!salidasPorBus[s.bus]) salidasPorBus[s.bus] = [];
        salidasPorBus[s.bus].push(s);
    });

    const trabajosPorBus = {};
    listaTrabajos.forEach(t => {
        const llaveBus = String(t.N_BUS || "").trim();
        const llavePlaca = String(t.PLACA || "").trim();
        if (llaveBus) {
            if (!trabajosPorBus[llaveBus]) trabajosPorBus[llaveBus] = [];
            trabajosPorBus[llaveBus].push(t);
        } else if (llavePlaca) {
            if (!trabajosPorBus[llavePlaca]) trabajosPorBus[llavePlaca] = [];
            trabajosPorBus[llavePlaca].push(t);
        }
    });

    datosBuses.forEach(vehiculo => {
        const salidasDelBus = (salidasPorBus[vehiculo.id] || []).concat(salidasPorBus[vehiculo.bus] || []);
        const trabajosDelBus = (trabajosPorBus[vehiculo.bus] || []).concat(trabajosPorBus[vehiculo.placa] || []);
        
        let totalAcumulado = 0;
        let tablaSalidasHtml = "";
        let tarjetasMovilHtml = "";

        // 1. RENDERIZAR PRODUCTOS/SALIDAS
        salidasDelBus.forEach(salida => {
            const prodReferencia = mapaProductos.get(salida.codigo);
            
            let codigoMostrar = "";
            let descripcionMostrar = "";
            let precioVenta = 0;

            if (prodReferencia) {
                codigoMostrar = salida.codigo ?? "";
                descripcionMostrar = prodReferencia.descripcion || "";
                precioVenta = Number(prodReferencia.precio_venta ?? 0);
            } else {
                codigoMostrar = ""; 
                descripcionMostrar = salida.codigo || "";
                precioVenta = 0;
            }
            
            const cantidadNum = Number(salida.cantidad ?? 1);
            const subtotal = cantidadNum * precioVenta; 
            totalAcumulado += subtotal;

            const fechaFormateada = formatoFechaVisual(salida.fecha);
            const horaFormateada = salida.hora ? salida.hora.slice(0, 5) : "";
            const quienRecibe = salida.recibe ?? "";

            const precioMostrarStr = (precioVenta === 0) ? "" : formatoMoneda(precioVenta);
            const celdaPrecioHtml = esTecnico ? "" : `<td class="precio">${precioMostrarStr}</td>`;

            tablaSalidasHtml += `
            <tr>
                <td>${fechaFormateada}</td>
                <td>${horaFormateada}</td>
                <td class="col-codigo">${codigoMostrar}</td>
                <td class="col-descripcion">${descripcionMostrar}</td>
                <td class="cantidad">${cantidadNum}</td>
                ${celdaPrecioHtml}
                <td class="col-recibe">${quienRecibe}</td>
            </tr>`;

            const precioMovilHtml = (esTecnico || precioVenta === 0) ? "" : ` &nbsp;|&nbsp; Precio: ${formatoMoneda(precioVenta)}`;
            const badgeCodigoHtml = codigoMostrar ? `<div class="salida-codigo-badge">${codigoMostrar}</div>` : '';

            tarjetasMovilHtml += `
            <div class="salida-card">
                <div class="salida-desc">${descripcionMostrar}</div>
                ${badgeCodigoHtml}
                <div class="salida-sub">Cant: ${cantidadNum}${precioMovilHtml}</div>
                <div class="salida-footer">
                    <span>📅 ${fechaFormateada} ${horaFormateada ? '- ' + horaFormateada : ''}</span>
                    <span>${quienRecibe ? '👤 ' + quienRecibe : ''}</span>
                </div>
            </div>`;
        });

        // 2. RENDERIZAR MANO DE OBRA / TRABAJOS
        trabajosDelBus.forEach(trabajo => {
            const fechaTrabajo = formatoFechaVisual(trabajo.FECHA);
            const descTrabajo = trabajo.TRABAJO || "";

            tablaSalidasHtml += `
            <tr style="background: #f8fafc;">
                <td>${fechaTrabajo}</td>
                <td></td>
                <td class="col-codigo">SERV</td>
                <td class="col-descripcion">${descTrabajo}</td>
                <td class="cantidad"></td>
                ${esTecnico ? "" : `<td class="precio"></td>`}
                <td class="col-recibe"></td>
            </tr>`;

            tarjetasMovilHtml += `
            <div class="salida-card" style="border-left: 3px solid #3b82f6;">
                <div class="salida-desc">${descTrabajo}</div>
                <div class="salida-codigo-badge">MANO DE OBRA</div>
                <div class="salida-footer">
                    <span>📅 ${fechaTrabajo}</span>
                    <span></span>
                </div>
            </div>`;
        });

        if (salidasDelBus.length === 0 && trabajosDelBus.length === 0) {
            const totalColumnas = esTecnico ? 6 : 7;
            tablaSalidasHtml = `<tr><td colspan="${totalColumnas}" style="text-align:center; color:#284B87; font-weight:bold; padding:15px;">Sin registros ni trabajos para este bus</td></tr>`;
            tarjetasMovilHtml = `<div style="text-align:center; color:#284B87; font-weight:bold; padding:10px; font-size:13px;">Sin registros ni trabajos para este bus</div>`;
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
        const placaEscapada = (vehiculo.placa ?? "").replace(/'/g, "\\'");

        const textoTotalCabecera = esTecnico ? "" : ` &nbsp;|&nbsp; Total: ${formatoMoneda(totalAcumulado)}`;
        const thPrecioHtml = esTecnico ? "" : `<th style="text-align:right;">P VENTA</th>`;

        let textoConteoSecundario = `Salidas: ${salidasDelBus.length}`;
        if (trabajosDelBus.length > 0) {
            textoConteoSecundario = `Servicios: ${trabajosDelBus.length}`;
        }

        // BADGE DE ESTADO (en historial)
        let badgeEstadoHtml = "";
        if (esHistorial) {
            let claseEstado = "badge-otro";
            if (vehiculo.estado === "FACTURADO" || vehiculo.estado === "FACTURADO_INTERNO") {
                claseEstado = "badge-facturado";
            } else if (vehiculo.estado === "ARCHIVADO") {
                claseEstado = "badge-archivado";
            }
            badgeEstadoHtml = `<span class="bus-estado-badge ${claseEstado}">${vehiculo.estado}</span>`;
        }

        const btnAdministrarHtml = `
            <button class="btn-facturar btn-administrar" onclick="event.stopPropagation(); abrirMenuAdministrar('${vehiculo.id}', event)">Administrar</button>
        `;

        const btnFacturarHtml = esTecnico ? `
        <div class="panel-acciones" style="display:flex; justify-content:flex-start; margin-top:10px;">
            ${btnAdministrarHtml}
        </div>` : `
        <div class="panel-acciones" style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; flex-wrap:wrap; gap:10px;">
            ${btnAdministrarHtml}
            ${!esHistorial ? `<button class="btn-facturar" style="${btnEstilo}" ${btnDeshabilitado} id="btn-fac-${vehiculo.id}" onclick="event.stopPropagation(); prepararYRedireccionarFacturacion('${vehiculo.id}', '${nombreEscapado}', '${placaEscapada}')">${btnTexto}</button>` : ''}
        </div>`;

        const claseItemHistorial = esHistorial ? 'estado-inactivo' : '';

        html += `
        <div class="bus-item ${claseItemHistorial}" id="bus-${vehiculo.id}" data-bus-id="${vehiculo.id}">
            <div class="bus-header" data-bus-id="${vehiculo.id}">
                <div class="bus-foto-wrapper" onclick="event.stopPropagation(); abrirVisorImagen('${vehiculo.foto}')">${imgHtml}</div>
                <div class="bus-info-main">
                    <div class="bus-titulo">${vehiculo.bus ?? "Bus sin nombre"}${badgeEstadoHtml}</div>
                    <div class="bus-detalles-linea1">Placa: ${vehiculo.placa ?? ""} &nbsp;|&nbsp; Cliente: ${vehiculo.cliente ?? ""}</div>
                    <div class="bus-detalles-linea2">${textoConteoSecundario}${textoTotalCabecera}</div>
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

// MANEJO DE SWIPE Y LONG PRESS PARA MÓVILES
function inicializarGestosItem(item) {
    let pressTimer = null;

    item.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchItem = item;
        touchPreventClick = false;

        pressTimer = setTimeout(() => {
            touchPreventClick = true;
            const idBus = item.dataset.busId;
            const touch = e.touches[0];
            abrirMenuAdministrar(idBus, { clientX: touch.clientX, clientY: touch.clientY });
        }, 500);
    }, { passive: true });

    item.addEventListener('touchmove', (e) => {
        const moveX = e.touches[0].clientX;
        const moveY = e.touches[0].clientY;
        const diffX = moveX - touchStartX;
        const diffY = moveY - touchStartY;

        if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
            if (pressTimer) clearTimeout(pressTimer);
        }

        if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 30) {
            if (diffX < -50) {
                item.style.transform = 'translateX(-60px)';
                item.style.transition = 'transform 0.2s ease';
            } else if (diffX > 50) {
                item.style.transform = 'translateX(0px)';
                item.style.transition = 'transform 0.2s ease';
            }
        }
    }, { passive: true });

    item.addEventListener('touchend', () => {
        if (pressTimer) clearTimeout(pressTimer);
    }, { passive: true });
}

// BIND: MANEJO DIRECTO DE CLIC EN ACORDEÓN
function bindClickHandlers() {
    document.querySelectorAll('.bus-header').forEach(header => {
        header.addEventListener('click', handleBusClick);
        inicializarGestosItem(header);
    });
}

function handleBusClick(e) {
    if (touchPreventClick) {
        touchPreventClick = false;
        return;
    }
    const idBus = e.currentTarget.dataset.busId;
    if (!idBus) return;
    toggleAcordeonBuses(`bus-${idBus}`);
}

// TOGGLE ACORDEÓN
function toggleAcordeonBuses(idElemento) {
    const itemActual = document.getElementById(idElemento);
    if (!itemActual) return;
    const estaAbierto = itemActual.classList.contains("abierto");
    
    document.querySelectorAll(".bus-item.abierto").forEach(item => item.classList.remove("abierto"));
    if (!estaAbierto) itemActual.classList.add("abierto");
}

// BÚSQUEDA EN TIEMPO REAL
const txtBuscar = document.getElementById("txtBuscar");
if (txtBuscar) {
    txtBuscar.addEventListener("input", function () {
        clearTimeout(timeoutBusqueda);
        const texto = this.value.trim().toUpperCase();

        timeoutBusqueda = setTimeout(() => {
            if (texto === "") {
                renderizarBuses();
                return;
            }
            
            const listaActual = obtenerListaBusesActual();
            const filtrados = listaActual.filter(b => 
                String(b.bus ?? "").toUpperCase().includes(texto) ||
                String(b.placa ?? "").toUpperCase().includes(texto) ||
                String(b.cliente ?? "").toUpperCase().includes(texto)
            );
            renderizarBuses(filtrados);
        }, 100);
    });
}

// PREPARAR FACTURACIÓN
function prepararYRedireccionarFacturacion(idBus, nombreBus, placaBus) {
    try {
        const listaActual = obtenerListaBusesActual();
        const vehiculo = listaActual.find(b => b.id === idBus);
        if (!vehiculo) return;

        const salidasDelBus = listaSalidas.filter(s => String(s.bus) === String(idBus) || String(s.bus) === String(vehiculo.bus));
        const trabajosDelBus = listaTrabajos.filter(t => String(t.N_BUS) === String(vehiculo.bus) || String(t.PLACA) === String(vehiculo.placa));

        const itemsSalidas = salidasDelBus.map(salida => {
            const prodReferencia = mapaProductos.get(salida.codigo);
            
            const codigoFinal = prodReferencia ? salida.codigo : '';
            const descripcionFinal = prodReferencia ? prodReferencia.descripcion : (salida.codigo || '');
            const precioFinal = prodReferencia ? parseFloat(prodReferencia.precio_venta) : 0;
            const esServicio = !prodReferencia || (salida.codigo && salida.codigo.startsWith('SR'));

            return {
                codigo: codigoFinal,
                descripcion: descripcionFinal,
                cantidad: parseFloat(salida.cantidad) || 1,
                precio_unitario: precioFinal,
                descuento: 0,
                tipo: esServicio ? 'SERVICIO' : 'PRODUCTO'
            };
        });

        const itemsTrabajos = trabajosDelBus.map(trabajo => {
            return {
                codigo: 'SERV',
                descripcion: trabajo.TRABAJO || '',
                cantidad: 1,
                precio_unitario: 0,
                descuento: 0,
                tipo: 'SERVICIO'
            };
        });

        const itemsMapeados = [...itemsSalidas, ...itemsTrabajos];

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

// MENÚ DE ADMINISTRACIÓN DESDE EL BOTÓN
function abrirMenuAdministrar(idBus, event) {
    const listaActual = obtenerListaBusesActual();
    busEnContexto = listaActual.find(b => String(b.id) === String(idBus));
    if (!busEnContexto) return;

    const menu = document.getElementById('menuContextual');
    if (!menu) return;

    let x = event.clientX ?? 0;
    let y = event.clientY ?? 0;

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

// Cerrar menú al interactuar fuera o hacer scroll
document.addEventListener('click', (e) => {
    const menu = document.getElementById('menuContextual');
    if (menu && menu.classList.contains('visible') && !menu.contains(e.target)) {
        ocultarMenuContextual();
    }
});

window.addEventListener('scroll', () => {
    ocultarMenuContextual();
}, { passive: true });

// ═══════════════════════════════════════════════════════════
// EDITAR / REGISTRAR BUS (SHEET)
// ═══════════════════════════════════════════════════════════
function editarBusDesdeMenu() {
    ocultarMenuContextual();
    if (!busEnContexto) return;
    abrirSheetEdicion(busEnContexto);
}

function abrirSheetEdicion(bus = null) {
    fotoEditarFile = null;

    const previewBox = document.getElementById('previewEditFoto');
    const iconCamara = document.getElementById('iconEditCamara');
    const sheetTitulo = document.getElementById('sheetTitulo');
    const btnConfirmar = document.getElementById('btnConfirmarEdicion');

    if (bus) {
        // --- MODO EDICIÓN ---
        busEnContexto = bus;
        if (sheetTitulo) sheetTitulo.textContent = 'Editar Bus';
        if (btnConfirmar) btnConfirmar.textContent = 'Guardar cambios';

        document.getElementById('editBus').value = bus.bus || '';
        document.getElementById('editPlaca').value = bus.placa || '';
        document.getElementById('editCliente').value = bus.cliente || '';

        if (previewBox) {
            previewBox.innerHTML = '';
            if (bus.foto) {
                previewBox.innerHTML = `<img src="${bus.foto}" alt="Bus" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">`;
                if (iconCamara) iconCamara.style.display = 'none';
            } else {
                if (iconCamara) {
                    previewBox.appendChild(iconCamara);
                    iconCamara.style.display = 'block';
                }
            }
        }
    } else {
        // --- MODO NUEVO BUS ---
        busEnContexto = null;
        if (sheetTitulo) sheetTitulo.textContent = 'Nuevo Bus';
        if (btnConfirmar) btnConfirmar.textContent = 'Registrar Bus';

        document.getElementById('editBus').value = '';
        document.getElementById('editPlaca').value = '';
        document.getElementById('editCliente').value = '';

        if (previewBox) {
            previewBox.innerHTML = '';
            if (iconCamara) {
                previewBox.appendChild(iconCamara);
                iconCamara.style.display = 'block';
            }
        }
    }

    const overlay = document.getElementById('overlaySheet');
    const hoja = document.getElementById('hojaSheet');
    if (overlay) overlay.classList.add('visible');
    if (hoja) setTimeout(() => hoja.classList.add('visible'), 10);
}

function cerrarSheetEdicion() {
    const overlay = document.getElementById('overlaySheet');
    const hoja = document.getElementById('hojaSheet');
    if (hoja) hoja.classList.remove('visible');
    if (overlay) overlay.classList.remove('visible');
    fotoEditarFile = null;
    busEnContexto = null;
}

// ═══════════════════════════════════════════════════════════
// MANEJO DE BOTONES TOMAR FOTO Y ELEGIR GALERÍA
// ═══════════════════════════════════════════════════════════
const btnTomarFoto = document.getElementById('btnTomarFoto');
const btnElegirFoto = document.getElementById('btnElegirFoto');
const editFotoInput = document.getElementById('editFoto');
const editFotoGaleriaInput = document.getElementById('editFotoGaleria');

if (btnTomarFoto) {
    btnTomarFoto.addEventListener('click', (e) => {
        e.preventDefault();
        editFotoInput.setAttribute('capture', 'environment');
        editFotoInput.click();
    });
}

if (btnElegirFoto) {
    btnElegirFoto.addEventListener('click', (e) => {
        e.preventDefault();
        editFotoGaleriaInput.removeAttribute('capture');
        editFotoGaleriaInput.click();
    });
}

// Procesar foto tomada con cámara
if (editFotoInput) {
    editFotoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        procesarFotoSeleccionada(file);
    });
}

// Procesar foto elegida de galería
if (editFotoGaleriaInput) {
    editFotoGaleriaInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        procesarFotoSeleccionada(file);
    });
}

// Función auxiliar para procesar la foto seleccionada (cámara o galería)
function procesarFotoSeleccionada(file) {
    fotoEditarFile = file;
    const previewBox = document.getElementById('previewEditFoto');
    const iconCamara = document.getElementById('iconEditCamara');
    
    if (previewBox) {
        const reader = new FileReader();
        reader.onload = (evt) => {
            previewBox.innerHTML = `<img src="${evt.target.result}" alt="Preview" style="width:100%; height:100%; object-fit:cover; border-radius:8px;">`;
        };
        reader.readAsDataURL(file);
    }
    if (iconCamara) iconCamara.style.display = 'none';
}

// Guardar cambios o crear nuevo bus (Unificado)
const btnConfirmarEdicion = document.getElementById('btnConfirmarEdicion');
if (btnConfirmarEdicion) {
    btnConfirmarEdicion.addEventListener('click', async () => {
        const nombreNuevo = document.getElementById('editBus').value.trim();
        const placaNueva = document.getElementById('editPlaca').value.trim().toUpperCase().replace(/\s+/g, '');
        const clienteNuevo = document.getElementById('editCliente').value.trim();

        if (!nombreNuevo || !placaNueva) {
            mostrarToast('Nombre y Placa son obligatorios', 'err');
            return;
        }

        const btn = document.getElementById('btnConfirmarEdicion');
        const esEdicion = !!busEnContexto;
        
        btn.disabled = true;
        btn.textContent = esEdicion ? 'Guardando…' : 'Registrando…';

        try {
            if (esEdicion) {
                // ACTUALIZAR BUS EXISTENTE
                let fotoUrl = busEnContexto.foto;

                if (fotoEditarFile) {
                    const fileExt = fotoEditarFile.name.split('.').pop();
                    const fileName = `${busEnContexto.id}_${placaNueva}.${fileExt}`;

                    await supabaseClient.storage.from('buses').upload(fileName, fotoEditarFile, { upsert: true });
                    const { data: urlData } = supabaseClient.storage.from('buses').getPublicUrl(fileName);
                    fotoUrl = urlData?.publicUrl || busEnContexto.foto;
                }

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

                // Actualizar en ambas listas
                const busEnActivos = listaBusesActivos.find(b => b.id === busEnContexto.id);
                const busEnHistorial = listaBusesHistorial.find(b => b.id === busEnContexto.id);
                
                if (busEnActivos) {
                    busEnActivos.bus = nombreNuevo;
                    busEnActivos.placa = placaNueva;
                    busEnActivos.cliente = clienteNuevo;
                    busEnActivos.foto = fotoUrl;
                }
                
                if (busEnHistorial) {
                    busEnHistorial.bus = nombreNuevo;
                    busEnHistorial.placa = placaNueva;
                    busEnHistorial.cliente = clienteNuevo;
                    busEnHistorial.foto = fotoUrl;
                }

                mostrarToast('Bus actualizado correctamente', 'ok');

            } else {
                // CREAR NUEVO BUS
                const idUnico = 'BUS-' + Date.now();
                const fechaActual = new Date().toISOString().split('T')[0];
                let publicUrl = '';

                if (fotoEditarFile) {
                    const fileExt = fotoEditarFile.name.split('.').pop();
                    const fileName = `${idUnico}_${placaNueva}.${fileExt}`;

                    await supabaseClient.storage.from('buses').upload(fileName, fotoEditarFile, { upsert: true });
                    const { data: urlData } = supabaseClient.storage.from('buses').getPublicUrl(fileName);
                    publicUrl = urlData?.publicUrl || '';
                }

                const nuevoBusObj = {
                    id: idUnico,
                    fecha: fechaActual,
                    bus: nombreNuevo,
                    placa: placaNueva,
                    cliente: clienteNuevo || '---',
                    estado: 'ABIERTO',
                    foto: publicUrl
                };

                const { error } = await supabaseClient
                    .from('buses')
                    .insert([nuevoBusObj]);

                if (error) throw error;

                listaBusesActivos.unshift(nuevoBusObj);
                mostrarToast('Bus creado exitosamente', 'ok');
            }

            cerrarSheetEdicion();
            renderizarBuses();

        } catch (err) {
            console.error('Error guardando bus:', err);
            mostrarToast('Error al guardar: ' + (err.message || 'Error desconocido'), 'err');
        } finally {
            btn.disabled = false;
            btn.textContent = esEdicion ? 'Guardar cambios' : 'Registrar Bus';
        }
    });
}

// ═══════════════════════════════════════════════════════════
// ARCHIVAR / DESARCHIVAR BUS DESDE EL MENÚ CONTEXTUAL
// ═══════════════════════════════════════════════════════════
async function archivarBusDesdeMenu() {
    ocultarMenuContextual();
    if (!busEnContexto) return;

    const busNombre = busEnContexto.bus || 'este bus';
    const esHistorial = window.tabBusActual === 'historial';
    const mensaje = esHistorial 
        ? `¿Estás seguro de que deseas DESARCHIVAR "${busNombre}"? Volverá a la lista de buses activos.`
        : `¿Estás seguro de que deseas ARCHIVAR "${busNombre}"? Dejará de aparecer en la lista activa.`;

    let seguro = false;
    if (typeof confirmarArchivarUI === "function") {
        seguro = await confirmarArchivarUI(mensaje);
    } else {
        seguro = confirm(mensaje);
    }

    if (!seguro) return;

    try {
        const nuevoEstado = esHistorial ? "ABIERTO" : "ARCHIVADO";
        
        const { error } = await supabaseClient
            .from("buses")
            .update({ estado: nuevoEstado })
            .eq("id", busEnContexto.id);

        if (error) throw error;

        // Mover bus entre listas
        if (esHistorial) {
            // Mover de historial a activos
            listaBusesHistorial = listaBusesHistorial.filter(b => b.id !== busEnContexto.id);
            busEnContexto.estado = "ABIERTO";
            listaBusesActivos.unshift(busEnContexto);
            mostrarToast("Bus desarchivado correctamente", "ok");
        } else {
            // Mover de activos a historial
            listaBusesActivos = listaBusesActivos.filter(b => b.id !== busEnContexto.id);
            busEnContexto.estado = "ARCHIVADO";
            listaBusesHistorial.unshift(busEnContexto);
            mostrarToast("Bus archivado correctamente", "ok");
        }

        renderizarBuses();
    } catch (err) {
        console.error("Error al archivar/desarchivar bus:", err);
        mostrarToast("Error al archivar/desarchivar el bus: " + (err.message || ""), "err");
    }
}

// Modal personalizado de confirmación (Archivar/Desarchivar)
function confirmarArchivarUI(mensaje) {
    return new Promise((resolve) => {
        let modal = document.getElementById('modalConfirmarArchivar');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modalConfirmarArchivar';
            modal.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                background: rgba(15, 23, 42, 0.5); backdrop-filter: blur(4px);
                display: flex; align-items: center; justify-content: center;
                z-index: 9999; opacity: 0; pointer-events: none; transition: opacity .2s ease;
            `;
            modal.innerHTML = `
                <div style="background: white; border-radius: 12px; padding: 20px 24px; max-width: 360px; width: 90%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1);">
                    <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 16px;">Confirmar acción</h4>
                    <p id="msgConfirmarArchivar" style="margin: 0 0 20px 0; color: #64748b; font-size: 14px; line-height: 1.4;"></p>
                    <div style="display: flex; justify-content: flex-end; gap: 10px;">
                        <button id="btnCancelArch" style="padding: 8px 14px; border-radius: 6px; border: 1px solid #cbd5e1; background: white; color: #475569; font-weight: 600; cursor: pointer;">Cancelar</button>
                        <button id="btnOkArch" style="padding: 8px 14px; border-radius: 6px; border: none; background: #f59e0b; color: white; font-weight: 600; cursor: pointer;">Confirmar</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);
        }

        document.getElementById('msgConfirmarArchivar').innerText = mensaje;
        modal.style.opacity = '1';
        modal.style.pointerEvents = 'auto';

        const btnOk = document.getElementById('btnOkArch');
        const btnCancel = document.getElementById('btnCancelArch');

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
// LISTENERS Y CERRAR OVERLAY
// ═══════════════════════════════════════════════════════════
const overlaySheet = document.getElementById('overlaySheet');
if (overlaySheet) {
    overlaySheet.addEventListener('click', (e) => {
        if (e.target.id === 'overlaySheet') cerrarSheetEdicion();
    });
}

const sheetHandle = document.getElementById('sheetHandle');
if (sheetHandle) sheetHandle.addEventListener('click', cerrarSheetEdicion);

document.addEventListener("DOMContentLoaded", () => {
    const btnAbrirFlotante = document.getElementById('btnAbrirFlotante');
    if (btnAbrirFlotante) {
        btnAbrirFlotante.addEventListener('click', () => abrirSheetEdicion(null));
    }
});

// Inicializar la app
inicializarBuses();