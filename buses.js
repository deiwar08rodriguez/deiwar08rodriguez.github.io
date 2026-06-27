const SUPABASE_URL = "https://vdlxmajvzdtbewchyowm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let listaBuses = [];
let listaSalidas = [];
let listaProductosGlobal = [];
let timeoutBusqueda;

function formatoMoneda(valor) {
    const numero = Number(valor ?? 0);
    return numero.toLocaleString("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0
    });
}

function formatoFechaVisual(fechaStr) {
    if (!fechaStr) return "";
    const partes = fechaStr.split("-");
    if (partes.length !== 3) return fechaStr;
    return `${partes[2]}/${partes[1]}/${partes[0].slice(-2)}`;
}

async function inicializarBuses() {
    console.time("Carga Supabase");

    const resBuses = await supabaseClient.from("buses").select("id, fecha, bus, placa, cliente, estado, foto");
    const resSalidas = await supabaseClient.from("salidas").select("id, fecha, codigo, cantidad, hora, recibe, tipo, bus");
    const resProductos = await supabaseClient.from("productos").select("codigo, descripcion, precio_venta");

    console.timeEnd("Carga Supabase");

    if (resBuses.error || resSalidas.error || resProductos.error) {
        console.error("Error:", resBuses.error || resSalidas.error || resProductos.error);
        return;
    }

    listaBuses = resBuses.data || [];
    listaSalidas = resSalidas.data || [];
    listaProductosGlobal = resProductos.data || [];

    renderizarBuses(listaBuses);
}

function renderizarBuses(datosBuses) {
    const contenedor = document.getElementById("contenedorBuses");
    let html = "";

    if (datosBuses.length === 0) {
        contenedor.innerHTML = `<p style="text-align:center; color:#284B87; padding:20px; font-weight:bold;">No se encontraron registros.</p>`;
        return;
    }

    datosBuses.forEach(vehiculo => {
        const salidasDelBus = listaSalidas.filter(s => s.bus === vehiculo.id || s.bus === vehiculo.bus);
        
        let totalAcumulado = 0;
        let tablaSalidasHtml = "";
        let tarjetasMovilHtml = "";

        salidasDelBus.forEach(salida => {
            const prodReferencia = listaProductosGlobal.find(p => p.codigo === salida.codigo);
            const descripcion = prodReferencia ? prodReferencia.descripcion : "Servicio / Mano de obra";
            const precioVenta = prodReferencia ? Number(prodReferencia.precio_venta ?? 0) : 0;
            
            const cantidadNum = Number(salida.cantidad ?? 1);
            const subtotal = cantidadNum * precioVenta; 
            totalAcumulado += subtotal;

            const fechaFormateada = formatoFechaVisual(salida.fecha);
            const horaFormateada = salida.hora ? salida.hora.slice(0, 5) : "---";
            const quienRecibe = salida.recibe ?? "---";

            // 1. Filas completas con Hora y Recibe para PC
            tablaSalidasHtml += `
            <tr>
                <td>${fechaFormateada}</td>
                <td>${horaFormateada}</td>
                <td class="col-codigo">${salida.codigo ?? ""}</td>
                <td class="col-descripcion">${descripcion}</td>
                <td class="cantidad">${cantidadNum}</td>
                <td class="precio">${formatoMoneda(precioVenta)}</td>
                <td class="col-recibe">${quienRecibe}</td>
            </tr>
            `;

            // 2. Tarjetas compactas unificadas para Celular
            tarjetasMovilHtml += `
            <div class="salida-card">
                <div class="salida-desc">${descripcion}</div>
                <div class="salida-codigo-badge">${salida.codigo ?? ""}</div>
                <div class="salida-sub">Cant: ${cantidadNum} &nbsp;|&nbsp; Precio: ${formatoMoneda(precioVenta)}</div>
                <div class="salida-footer">
                    <span>📅 ${fechaFormateada} - ${horaFormateada}</span>
                    <span>👤 ${quienRecibe}</span>
                </div>
            </div>
            `;
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
                                <th>FECHA</th>
                                <th>HORA</th>
                                <th>CODIGO</th>
                                <th>DESCRIPCION</th>
                                <th style="text-align:center;">CANT</th>
                                <th style="text-align:right;">P VENTA</th>
                                <th>RECIBE</th>
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
        </div>
        `;
    });

    contenedor.innerHTML = html;
}

function toggleAcordeonBuses(idElemento) {
    const itemActual = document.getElementById(idElemento);
    if (!itemActual) return;

    if (!itemActual.classList.contains("abierto")) {
        document.querySelectorAll(".bus-item.abierto").forEach(item => {
            item.classList.remove("abierto");
        });
    }
    itemActual.classList.toggle("abierto");
}

function solicitarFacturacion(id, nombreBus) {
    alert(`Solicitud enviada para facturar el bus: ${nombreBus}`);
}

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
            String(b.placa ?? "").toUpperCase().includes(texto) ||
            String(b.cliente ?? "").toUpperCase().includes(texto)
        );

        renderizarBuses(filtrados);
    }, 150);
});


/* ==========================================================================
   📱 LÓGICA DE INTERFAZ FLOTANTE (BOTTOM SHEET) + OPTIMIZACIÓN DE GUARDADO
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
        setTimeout(() => {
            hojaFlotante.style.bottom = '0';
        }, 10);
    }

    function cerrarModal() {
        hojaFlotante.style.bottom = '-100%';
        setTimeout(() => {
            overlayFlotante.style.display = 'none';
            frmNuevoBus.reset();
            if (imgPreview) imgPreview.style.display = 'none';
            if (iconCamara) iconCamara.style.display = 'block';
        }, 300);
    }

    if (btnAbrirFlotante) btnAbrirFlotante.addEventListener('click', abrirModal);
    if (btnCerrarFlotante) btnCerrarFlotante.addEventListener('click', cerrarModal);
    if (overlayFlotante) {
        overlayFlotante.addEventListener('click', (e) => {
            if (e.target === overlayFlotante) cerrarModal();
        });
    }

    // Previsualización de la foto capturada en el círculo
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

    // Guardado ultra-rápido optimizado
    if (frmNuevoBus) {
        frmNuevoBus.addEventListener('submit', async (e) => {
            e.preventDefault();

            const btnSubmit = document.getElementById('btnGuardarBus');
            if (btnSubmit) {
                btnSubmit.disabled = true;
                btnSubmit.textContent = "Guardando...";
            }

            const bus = document.getElementById('regBus').value;
            const placa = document.getElementById('regPlaca').value.toUpperCase().replace(/\s+/g, '');
            const fotoFile = inputFoto ? inputFoto.files[0] : null;

            const idUnico = 'BUS-' + Date.now();
            const fechaActual = new Date().toISOString().split('T')[0];

            let publicUrl = '';

            try {
                // Subir imagen al Bucket 'buses' si existe
                if (fotoFile) {
                    const fileExt = fotoFile.name.split('.').pop();
                    const fileName = `${idUnico}_${placa}.${fileExt}`;

                    const { data: storageData, error: storageError } = await supabaseClient
                        .storage
                        .from('buses')
                        .upload(fileName, fotoFile);

                    if (storageError) throw storageError;

                    const { data: urlData } = supabaseClient
                        .storage
                        .from('buses')
                        .getPublicUrl(fileName);

                    publicUrl = urlData.publicUrl;
                }

                // Creamos el objeto del nuevo registro
                const nuevoRegistro = {
                    id: idUnico,
                    fecha: fechaActual,
                    bus: bus,
                    placa: placa,
                    cliente: "---", // Por defecto vacío/no requerido según tu instrucción
                    estado: "ABIERTO", // Predeterminado estricto
                    foto: publicUrl
                };

                // Inserción limpia en Supabase
                const { error } = await supabaseClient
                    .from('buses')
                    .insert([nuevoRegistro]);

                if (error) throw error;

                // OPTIMIZACIÓN: Evitamos recargar toda la base de datos de nuevo.
                // Insertamos el bus directamente al array en memoria y renderizamos de una vez.
                listaBuses.unshift(nuevoRegistro); 
                renderizarBuses(listaBuses);

                cerrarModal();

            } catch (err) {
                console.error("Error en flujo de guardado:", err);
                alert('Hubo un percance al procesar el registro: ' + err.message);
            } finally {
                if (btnSubmit) {
                    btnSubmit.disabled = false;
                    btnSubmit.textContent = "Guardar e Ingresar";
                }
            }
        });
    }
});

inicializarBuses();