const SUPABASE_URL = "https://vdlxmajvzdtbewchyowm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let listaBuses = [];
let listaSalidas = [];
let mapaProductos = new Map(); // Optimización: Búsquedas instantáneas O(1)
let timeoutBusqueda;

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

// 🚀 OPTIMIZACIÓN 1: Carga paralela ultra rápida
async function inicializarBuses() {
    try {
        console.time("⚡ Carga Paralela Supabase");
        
        // Lanza las 3 consultas en simultáneo
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
        
        // Estructura de diccionario rápido
        mapaProductos.clear();
        (resProductos.data || []).forEach(p => mapaProductos.set(p.codigo, p));

        renderizarBuses(listaBuses);
    } catch (error) {
        console.error("Error cargando datos:", error);
    }
}

function renderizarBuses(datosBuses) {
    const contenedor = document.getElementById("contenedorBuses");
    if (datosBuses.length === 0) {
        contenedor.innerHTML = `<p style="text-align:center; color:#284B87; padding:20px; font-weight:bold;">No se encontraron registros.</p>`;
        return;
    }

    let html = "";
    
    // Agrupar salidas por bus en memoria para evitar hacer filtros pesados repetitivos
    const salidasPorBus = {};
    listaSalidas.forEach(s => {
        if (!salidasPorBus[s.bus]) salidasPorBus[s.bus] = [];
        salidasPorBus[s.bus].push(s);
    });

    datosBuses.forEach(vehiculo => {
        // Busca por ID o por nombre de bus de forma eficiente
        const salidasDelBus = (salidasPorBus[vehiculo.id] || []).concat(salidasPorBus[vehiculo.bus] || []);
        
        let totalAcumulado = 0;
        let tablaSalidasHtml = "";
        let tarjetasMovilHtml = "";

        salidasDelBus.forEach(salida => {
            // 🚀 OPTIMIZACIÓN 3: Búsqueda instantánea del producto usando el Map
            const prodReferencia = mapaProductos.get(salida.codigo);
            const descripcion = prodReferencia ? prodReferencia.descripcion : "Servicio / Mano de obra";
            const precioVenta = prodReferencia ? Number(prodReferencia.precio_venta ?? 0) : 0;
            
            const cantidadNum = Number(salida.cantidad ?? 1);
            const subtotal = cantidadNum * precioVenta; 
            totalAcumulado += subtotal;

            const fechaFormateada = formatoFechaVisual(salida.fecha);
            const horaFormateada = salida.hora ? salida.hora.slice(0, 5) : "---";
            const quienRecibe = salida.recibe ?? "---";

            tablaSalidasHtml += `
            <tr>
                <td>${fechaFormateada}</td>
                <td>${horaFormateada}</td>
                <td class="col-codigo">${salida.codigo ?? ""}</td>
                <td class="col-descripcion">${descripcion}</td>
                <td class="cantidad">${cantidadNum}</td>
                <td class="precio">${formatoMoneda(precioVenta)}</td>
                <td class="col-recibe">${quienRecibe}</td>
            </tr>`;

            tarjetasMovilHtml += `
            <div class="salida-card">
                <div class="salida-desc">${descripcion}</div>
                <div class="salida-codigo-badge">${salida.codigo ?? ""}</div>
                <div class="salida-sub">Cant: ${cantidadNum} &nbsp;|&nbsp; Precio: ${formatoMoneda(precioVenta)}</div>
                <div class="salida-footer">
                    <span>📅 ${fechaFormateada} - ${horaFormateada}</span>
                    <span>👤 ${quienRecibe}</span>
                </div>
            </div>`;
        });

        if (salidasDelBus.length === 0) {
            tablaSalidasHtml = `<tr><td colspan="7" style="text-align:center; color:#284B87; font-weight:bold; padding:15px;">Sin salidas registradas para este bus</td></tr>`;
            tarjetasMovilHtml = `<div style="text-align:center; color:#284B87; font-weight:bold; padding:10px; font-size:13px;">Sin salidas registradas para este bus</div>`;
        }

        const imgHtml = vehiculo.foto 
            ? `<img src="${vehiculo.foto}" alt="Bus" class="bus-foto">` 
            : `<div class="bus-foto-placeholder">Bus</div>`;

        html += `
        <div class="bus-item" id="bus-${vehiculo.id}">
            <div class="bus-header" onclick="toggleAcordeonBuses('bus-${vehiculo.id}')">
                <div class="bus-foto-wrapper">${imgHtml}</div>
                <div class="bus-info-main">
                    <div class="bus-titulo">${vehiculo.bus ?? "Bus sin nombre"}</div>
                    <div class="bus-detalles-linea1">Placa: ${vehiculo.placa ?? "---"} &nbsp;|&nbsp; Cliente: ${vehiculo.cliente ?? "---"}</div>
                    <div class="bus-detalles-linea2">Salidas: ${salidasDelBus.length} &nbsp;|&nbsp; Total: ${formatoMoneda(totalAcumulado)}</div>
                </div>
                <div class="bus-flecha">▼</div>
            </div>
            <div class="bus-detalle-panel">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>FECHA</th><th>HORA</th><th>CODIGO</th><th>DESCRIPCION</th><th style="text-align:center;">CANT</th><th style="text-align:right;">P VENTA</th><th>RECIBE</th>
                            </tr>
                        </thead>
                        <tbody>${tablaSalidasHtml}</tbody>
                    </table>
                </div>
                <div class="mobile-cards-salidas">${tarjetasMovilHtml}</div>
                <div class="panel-acciones">
                    <button class="btn-facturar" onclick="solicitarFacturacion('${vehiculo.id}', '${vehiculo.bus}')">Facturar</button>
                </div>
            </div>
        </div>`;
    });

    contenedor.innerHTML = html;
}

function toggleAcordeonBuses(idElemento) {
    const itemActual = document.getElementById(idElemento);
    if (!itemActual) return;
    const estaAbierto = itemActual.classList.contains("abierto");
    
    document.querySelectorAll(".bus-item.abierto").forEach(item => item.classList.remove("abierto"));
    if (!estaAbierto) itemActual.classList.add("abierto");
}

function solicitarFacturacion(id, nombreBus) {
    alert(`Solicitud enviada para facturar el bus: ${nombreBus}`);
}

// Buscador reactivo rápido con debounce optimizado a 100ms
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

/* ==========================================================================
   📱 INTERFAZ FLOTANTE INTERACTIVA CON RENDERIZADO INMEDIATO (OPTIMIZADO)
   ========================================================================== */
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
            
            // Cerrar el modal inmediatamente para dar respuesta UX instantánea al usuario
            const bus = document.getElementById('regBus').value;
            const placa = document.getElementById('regPlaca').value.toUpperCase().replace(/\s+/g, '');
            const fotoFile = inputFoto ? inputFoto.files[0] : null;

            const idUnico = 'BUS-' + Date.now();
            const fechaActual = new Date().toISOString().split('T')[0];
            
            // 🚀 OPTIMIZACIÓN 2: Pre-renderizado en UI antes de que termine de subir a la red
            const objetoLocalTemporal = {
                id: idUnico,
                fecha: fechaActual,
                bus: bus,
                placa: placa,
                cliente: "---",
                estado: "ABIERTO",
                foto: fotoFile ? URL.createObjectURL(fotoFile) : '' // URL local temporal instantánea
            };

            listaBuses.unshift(objetoLocalTemporal);
            renderizarBuses(listaBuses);
            cerrarModal();

            // Ejecución asíncrona de fondo con la base de datos sin congelar la pantalla
            try {
                let publicUrl = '';
                if (fotoFile) {
                    const fileExt = fotoFile.name.split('.').pop();
                    const fileName = `${idUnico}_${placa}.${fileExt}`;

                    const { data: storageData } = await supabaseClient.storage.from('buses').upload(fileName, fotoFile);
                    const { data: urlData } = supabaseClient.storage.from('buses').getPublicUrl(fileName);
                    publicUrl = urlData?.publicUrl || '';
                }

                // Guardar datos reales en Supabase
                await supabaseClient.from('buses').insert([{
                    id: idUnico,
                    fecha: fechaActual,
                    bus: bus,
                    placa: placa,
                    cliente: "---",
                    estado: "ABIERTO",
                    foto: publicUrl
                }]);
                
                // Actualizar la URL de la foto final en memoria sin alterar la UX
                if (publicUrl) {
                    const busInsertado = listaBuses.find(b => b.id === idUnico);
                    if (busInsertado) busInsertado.foto = publicUrl;
                }

            } catch (err) {
                console.error("Error asíncrono de guardado remoto:", err);
            }
        });
    }
});

// Arrancar proceso optimizado
inicializarBuses();