const SUPABASE_URL = "https://vdlxmajvzdtbewchyowm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let listaBuses = [];
let listaSalidas = [];
let listaProductosGlobal = []; // Para cruzar y extraer el 'precio_venta' y la 'descripcion'
let timeoutBusqueda;

function formatoMoneda(valor) {
    const numero = Number(valor ?? 0);
    return numero.toLocaleString("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0
    });
}

function formatoFecha(fechaStr) {
    if (!fechaStr) return "";
    const partes = fechaStr.split("-");
    if (partes.length !== 3) return fechaStr;
    // Formato visual DD/MM/YY
    return `${partes[2]}/${partes[1]}/${partes[0].slice(-2)}`;
}

// Inicializador del sistema
async function inicializarBuses() {
    console.time("Carga Completa Supabase");

    // 1. Traer datos de buses
    const resBuses = await supabaseClient.from("buses").select("id, fecha, bus, placa, cliente, estado, foto");
    // 2. Traer datos de salidas
    const resSalidas = await supabaseClient.from("salidas").select("id, fecha, codigo, cantidad, hora, recibe, tipo, bus");
    // 3. Traer datos de productos para sacar precios de venta exactos
    const resProductos = await supabaseClient.from("productos").select("codigo, descripcion, precio_venta");

    console.timeEnd("Carga Completa Supabase");

    if (resBuses.error || resSalidas.error || resProductos.error) {
        console.error("Error cargando datos:", resBuses.error || resSalidas.error || resProductos.error);
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
        contenedor.innerHTML = `<p style="text-align:center; color:#6b7280; padding:20px;">No se encontraron buses con los criterios de búsqueda.</p>`;
        return;
    }

    datosBuses.forEach(vehiculo => {
        // Filtrar las salidas correspondientes a este bus por su campo de enlace (id o bus textual)
        // Usamos mOriginalID o el nombre del bus de acuerdo a cómo guardaba tu lógica Access
        const salidasDelBus = listaSalidas.filter(s => s.bus === vehiculo.id || s.bus === vehiculo.bus);
        
        let totalAcumulado = 0;
        let tablaSalidasHtml = "";

        // Construir filas de detalles calculando los precios reales
        salidasDelBus.forEach(salida => {
            // Buscar el producto correspondiente en el inventario global
            const prodReferencia = listaProductosGlobal.find(p => p.codigo === salida.codigo);
            
            const descripcion = prodReferencia ? prodReferencia.descripcion : "Servicio / Mano de Obra";
            const precioVenta = prodReferencia ? Number(prodReferencia.precio_venta ?? 0) : 0;
            
            // Si es un servicio o mano de obra sin precio de inventario, puedes definir base o dejar que sume lo del producto
            // Tu lógica original guardaba códigos MO o SR directamente
            const subtotal = (salida.cantidad || 1) * precioVenta; 
            totalAcumulado += subtotal;

            tablaSalidasHtml += `
            <tr>
                <td>${formatoFecha(salida.fecha)}</td>
                <td>${salida.codigo ?? ""}</td>
                <td>${descripcion}</td>
                <td class="cantidad">${salida.cantidad ?? 0}</td>
                <td class="precio">${formatoMoneda(precioVenta)}</td>
            </tr>
            `;
        });

        if (salidasDelBus.length === 0) {
            tablaSalidasHtml = `<tr><td colspan="5" style="text-align:center; color:#9ca3af;">Sin salidas registradas para este bus.</td></tr>`;
        }

        // Manejo de la foto
        const imgHtml = vehiculo.foto 
            ? `<img src="${vehiculo.foto}" alt="Bus" class="bus-foto">` 
            : `<div class="bus-foto-placeholder">Sin Foto</div>`;

        html += `
        <div class="bus-item" id="bus-${vehiculo.id}">
            <!-- Encabezado de la celda (Click para desplegar) -->
            <div class="bus-header" onclick="conmutarAcordeon('bus-${vehiculo.id}')">
                <div class="bus-foto-wrapper">
                    ${imgHtml}
                </div>
                <div class="bus-info-main">
                    <div class="bus-titulo">${vehiculo.bus ?? "Bus Sin Nombre"}</div>
                    <div class="bus-detalles-linea1">
                        <strong>Placa:</strong> ${vehiculo.placa ?? "---"} | 
                        <strong>Técnicos / Recibe:</strong> ${vehiculo.recibe ?? vehiculo.cliente ?? "No asignado"}
                    </div>
                    <div class="bus-detalles-linea2">
                        Salidas: ${salidasDelBus.length} &nbsp;&nbsp;|&nbsp;&nbsp; Valor a Cobrar: ${formatoMoneda(totalAcumulado)}
                    </div>
                </div>
                <div class="bus-flecha">▼</div>
            </div>

            <!-- Panel de Información Desplegable -->
            <div class="bus-detail-panel bus-detalle-panel">
                <div class="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>FECHA</th>
                                <th>CÓDIGO</th>
                                <th>DESCRIPCIÓN</th>
                                <th class="cantidad">CANT</th>
                                <th class="precio">P. VENTA</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${tablaSalidasHtml}
                        </tbody>
                    </table>
                </div>
                <div class="panel-acciones">
                    <button class="btn-facturar" onclick="solicitarFacturacion('${vehiculo.id}', '${vehiculo.bus}')">Facturar</button>
                </div>
            </div>
        </div>
        `;
    });

    contenedor.innerHTML = html;
}

// Función interactiva del despliegue (Acordeón)
function conmutarAcordeon(idElemento) {
    const item = document.getElementById(idElemento);
    if (!item) return;
    
    // Alterna la clase 'abierto'
    item.classList.toggle("abierto");
}

// Lógica de alerta provisional para el botón Facturar
function solicitarFacturacion(id, nombreBus) {
    alert(`Solicitud enviada: Preparando aviso para secretaría para facturar el ${nombreBus} (ID: ${id}).`);
}

// Buscador optimizado en tiempo real (Coincide con tu lógica de productos)
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
            String(b.cliente ?? "").toUpperCase().includes(texto) ||
            String(b.id ?? "").toUpperCase().includes(texto)
        );

        renderizarBuses(filtrados);
    }, 150);
});

// Arrancar la aplicación al cargar la página
inicializarBuses();
