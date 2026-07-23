// THERMOAIR SAS - SISTEMA DE FACTURACIÓN DE VENTAS

// ── CONFIGURACIÓN SUPABASE ──
const SUPABASE_URL  = 'https://vdlxmajvzdtbewchyowm.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM';

let sb;
try {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
} catch (err) {
    console.error("CRÍTICO: Error al inicializar el cliente de Supabase:", err);
    alert("No se pudo conectar con Supabase. Revisa la librería importada.");
}

// ── Estado global ──
let todasFacturas = [];

window.configAvanzadaSiigo = {
    sincronizarSiigo: true,
    formaPago: 'efectivo',
    observaciones: 'Facturada desde ThermoAirSystem'
};

let itemsAgregados = []; 
let clienteSeleccionado = null;
let productoSeleccionado = null;
let servicioSeleccionado = null; 
let modoActual = 'PRODUCTO'; 

let editandoItem = false;
let idTempEdicion = null;

//  INIT
document.addEventListener('DOMContentLoaded', async () => {
    try {
        establecerFechaHoy();
        await cargarFacturas();
        renderizarTodo();
        bindUI();
    } catch (err) {
        console.error("CRÍTICO: Error durante la inicialización de la App (DOMContentLoaded):", err);
    }
});

function establecerFechaHoy() {
    const hoy = new Date();
    const txtDia = document.getElementById('txtFechaDia');
    const txtMes = document.getElementById('txtFechaMes');
    const txtAnio = document.getElementById('txtFechaAnio');

    if (!txtDia || !txtMes || !txtAnio) {
        console.error("ERROR UI: Uno o más campos de fecha no existen en el HTML.");
        return;
    }
    txtDia.value = hoy.getDate();
    txtMes.value = hoy.getMonth() + 1;
    txtAnio.value = hoy.getFullYear();
}

//  CARGA DE HISTORIAL DESDE SUPABASE
async function cargarFacturas() {
    try {
        const { data, error } = await sb
            .from('facturas_venta')
            .select('*')
            .order('fecha', { ascending: false })
            .order('id', { ascending: false });

        if (error) { 
            console.error('Supabase Error (cargarFacturas):', error); 
            mostrarToast('Error al cargar historial de facturas', 'err');
            return; 
        }
        todasFacturas = data || [];
    } catch (err) {
        console.error('Excepción atrapada (cargarFacturas):', err);
    }
}

//  RENDERIZADO DE TABLA PRINCIPAL Y MÓVIL
function renderizarTodo(filtro = '') {
    try {
        const txt = filtro.trim().toLowerCase();
        let lista = todasFacturas;

        if (txt) {
            lista = lista.filter(f => 
                (f.cliente || '').toLowerCase().includes(txt) ||
                (f.nit || '').toLowerCase().includes(txt) ||
                (f.id_factura || '').toLowerCase().includes(txt) ||
                String(f.id).includes(txt)
            );
        }

        const grupos = agruparPorFecha(lista);
        renderPC(grupos);
        renderMobile(grupos);
    } catch (err) {
        console.error('Error en renderizarTodo:', err);
    }
}

function agruparPorFecha(lista) {
    const map = new Map();
    lista.forEach(f => {
        const key = f.fecha || 'Sin Fecha';
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(f);
    });
    return map;
}

function renderPC(grupos) {
    const tbody = document.getElementById('tablaBodyFacturas');
    if (!tbody) { console.error("ERROR UI: Elemento 'tablaBodyFacturas' no encontrado."); return; }
    tbody.innerHTML = '';

    if (grupos.size === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:60px;color:#94a3b8;">No se encontraron facturas de venta registradas</td></tr>`;
        return;
    }

    grupos.forEach((filas, fechaKey) => {
        const trGrupo = document.createElement('tr');
        trGrupo.innerHTML = `
            <td colspan="9" style="background:#f8fafc;padding:10px 14px;">
                <span style="font-size:12px;font-weight:bold;color:#284B87;text-transform:uppercase;letter-spacing:.5px;">
                    ${etiquetaFecha(fechaKey)} — ${filas.length} factura${filas.length !== 1 ? 's' : ''}
                </span>
            </td>`;
        tbody.appendChild(trGrupo);

        filas.forEach(f => {
            const tr = document.createElement('tr');
            
            const pdfUrl = f.url_pdf || f.URL_PDF || f.pdf_url || '';
            const botonPdf = pdfUrl 
                ? `<a href="${pdfUrl}" target="_blank" style="display:inline-block; background:#284B87; color:white; padding:5px 10px; border-radius:6px; text-decoration:none; font-size:12px; font-weight:bold;">📄 Ver PDF</a>`
                : `<span style="color:#94a3b8; font-size:12px; font-style:italic;">No disp.</span>`;

            tr.innerHTML = `
                <td>${f.fecha || '—'}</td>
                <td style="font-weight:bold;"># ${f.id_factura || f.id}</td>
                <td>${f.cliente || '—'}</td>
                <td>${f.nit || '—'}</td>
                <td>—</td>
                <td style="text-align: right;">${formatMoneda(f.subtotal)}</td>
                <td style="text-align: right; color: #dc2626;">-${formatMoneda(f.descuento)}</td>
                <td style="text-align: right; font-weight: bold; color: #284B87;">${formatMoneda(f.total)}</td>
                <td style="text-align: center; padding: 6px 14px;">${botonPdf}</td>
            `;
            tbody.appendChild(tr);
        });
    });
}

function renderMobile(grupos) {
    const cont = document.getElementById('vistaMobileFacturas');
    if (!cont) return;
    cont.innerHTML = '';

    if (grupos.size === 0) {
        cont.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#94a3b8;">No se encontraron facturas registradas</div>`;
        return;
    }

    grupos.forEach((filas, fechaKey) => {
        const grupo = document.createElement('div');
        grupo.style.marginBottom = '15px';

        const header = document.createElement('div');
        header.style.cssText = 'font-size:12px;font-weight:bold;color:#284B87;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;';
        header.textContent = `${etiquetaFecha(fechaKey)}`;
        grupo.appendChild(header);

        filas.forEach(f => {
            const card = document.createElement('div');
            card.style.cssText = 'background:white; border:1px solid #e2e8f0; padding:12px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.02); display:flex; flex-direction:column; gap:4px; margin-bottom: 8px; position: relative;';
            
            const pdfUrl = f.url_pdf || f.URL_PDF || f.pdf_url || '';
            const botonPdfMobile = pdfUrl 
                ? `<a href="${pdfUrl}" target="_blank" style="align-self: flex-end; margin-top: 6px; background:#284B87; color:white; padding:6px 12px; border-radius:6px; text-decoration:none; font-size:11px; font-weight:bold; text-align:center;">📄 Abrir Documento</a>`
                : ``;

            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-weight:bold; color:#203764;">
                    <span style="flex:1;">Factura # ${f.id_factura || f.id}</span>
                    <span style="color:#10b981;">${formatMoneda(f.total)}</span>
                </div>
                <div style="font-size:13px; color:#475569;">${f.cliente || '—'}</div>
                <div style="font-size:12px; color:#64748b; display:flex; justify-content:space-between; align-items: center;">
                    <span>NIT: ${f.nit || '—'}</span>
                    <span>Desc: -${formatMoneda(f.descuento)}</span>
                </div>
                ${botonPdfMobile}
            `;
            grupo.appendChild(card);
        });
        cont.appendChild(grupo);
    });
}

function habilitarCantidad(habilitar) {
    const txtCantidad = document.getElementById('txtCantidadItem');
    if (!txtCantidad) return;
    
    if (habilitar) {
        txtCantidad.disabled = false;
        txtCantidad.style.opacity = "1";
    } else {
        txtCantidad.value = 1; // La mano de obra siempre tiene cantidad 1
        txtCantidad.disabled = true;
        txtCantidad.style.opacity = "0.6";
    }
}

function abrirFormulario() {
    try {
        document.getElementById('overlaySheet').classList.add('visible');
        document.getElementById('hojaSheet').classList.add('visible');
        establecerFechaHoy();
        habilitarCantidad(true);
    } catch(err) { console.error("Error abriendo formulario:", err); }
}

function cerrarFormulario() {
    try {
        document.getElementById('overlaySheet').classList.remove('visible');
        document.getElementById('hojaSheet').classList.remove('visible');
        limpiarFormularioComplete();
    } catch(err) { console.error("Error cerrando formulario:", err); }
}

// El buscador ahora es inmediato: Solo lee la tabla local de Supabase
// ==========================================
// UTILIDAD DEBOUNCE (Para evitar spam a la BD)
// ==========================================
function debounce(fn, delay = 300) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ==========================================
// 1. BUSCADOR DE CLIENTES (CORREGIDO)
// ==========================================
async function buscarClientesPredictivo(busqueda) {
    const divDropdown = document.getElementById('dropdownClientes');
    if (!divDropdown) return;

    const query = (busqueda || '').trim();

    // Mínimo 2 caracteres
    if (query.length < 2) { 
        divDropdown.style.display = 'none'; 
        return; 
    }

    try {
        let queryBuilder = sb.from('terceros_siigo').select('*');

        // Búsqueda flexible por Nombre O por NIT/Cédula
        queryBuilder = queryBuilder.or(`nombre.ilike.%${query}%,num_id.ilike.%${query}%`);

        const { data, error } = await queryBuilder.limit(10);

        if (error || !data || data.length === 0) { 
            divDropdown.innerHTML = '<div class="dropdown-item" style="color:#94a3b8; cursor:default; padding:10px;">No hay resultados locales</div>';
            divDropdown.style.display = 'block';
            return; 
        }

        divDropdown.innerHTML = '';
        divDropdown.style.display = 'block';

        data.forEach(cliente => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = `${cliente.nombre} (${cliente.num_id})`;
            item.style.cursor = 'pointer';

            item.addEventListener('click', () => {
                document.getElementById('comboCliente').value = cliente.nombre;
                document.getElementById('txtEmpresa').value = cliente.nombre;
                document.getElementById('txtNitCc').value = cliente.num_id;
                
                document.getElementById('txtDireccion').value = cliente.direccion || '';
                document.getElementById('txtCiudad').value = cliente.ciudad || '';
                document.getElementById('txtTelefono').value = cliente.telefono || '';
                
                clienteSeleccionado = {
                    id1: cliente.Id1,
                    id: cliente.num_id,
                    identification: cliente.num_id,
                    tipo_id: cliente.tipo_id,
                    tipo_iva: cliente.tipo_iva,
                    person_type: cliente.person_type,
                    siigo_id: cliente.siigo_id || cliente.id || cliente.Id || cliente.Id1,
                    name: cliente.nombre,
                    direccion: cliente.direccion,
                    ciudad: cliente.ciudad,
                    telefono: cliente.telefono,
                    estado: cliente.estado
                };
                divDropdown.style.display = 'none';
            });
            divDropdown.appendChild(item);
        });
    } catch (err) {
        console.error('Error en buscador de clientes:', err);
    }
}

// ==========================================
// 2. BUSCADOR DE PRODUCTOS (OPTIMIZADO)
// ==========================================
async function buscarProductosPredictivo(busqueda) {
    const divDropdown = document.getElementById('dropdownProductosForm');
    if (!divDropdown) return;

    const query = (busqueda || '').trim();

    if (query.length < 2) { 
        divDropdown.style.display = 'none'; 
        return; 
    }

    try {
        const { data, error } = await sb
            .from('productos')
            .select('*')
            .or(`codigo.ilike.%${query}%,descripcion.ilike.%${query}%`)
            .limit(8);

        if (error) {
            console.error('Supabase Error (buscarProductos):', error);
            return;
        }

        if (!data || data.length === 0) { 
            divDropdown.style.display = 'none'; 
            return; 
        }

        divDropdown.innerHTML = '';
        divDropdown.style.display = 'block';

        data.forEach(p => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = `[${p.codigo}] ${p.descripcion}`;
            item.style.cursor = 'pointer';

            item.addEventListener('click', () => {
                document.getElementById('comboProducto').value = p.descripcion;
                const inputPrecio = document.getElementById('txtPrecioUnitItem');
                if (inputPrecio) inputPrecio.value = Math.round(p.precio_venta || 0);
                
                productoSeleccionado = p;
                divDropdown.style.display = 'none';
                
                const inputCantidad = document.getElementById('txtCantidadItem');
                if (inputCantidad) inputCantidad.focus();
            });
            divDropdown.appendChild(item);
        });
    } catch (err) {
        console.error('Excepción crítica en buscarProductosPredictivo:', err);
    }
}

// ==========================================
// 3. BUSCADOR DE SERVICIOS (OPTIMIZADO)
// ==========================================
async function buscarServiciosPredictivo(busqueda) {
    const divDropdown = document.getElementById('dropdownServicios');
    if (!divDropdown) return;

    const termino = (busqueda || '').trim();

    // Mínimo 3 caracteres para servicios para evitar búsquedas vacías
    if (termino.length < 3) { 
        divDropdown.style.display = 'none'; 
        return; 
    }

    try {
        const { data, error } = await sb
            .from('servicios')
            .select('codigo, descripcion, precio')
            .or(`codigo.ilike.%${termino}%,descripcion.ilike.%${termino}%`) 
            .limit(10);

        if (error) {
            console.error('Error en Supabase (servicios):', error);
            return;
        }

        // Excluir código consolidado si aplica
        const datosFiltrados = (data || []).filter(s => String(s.codigo).toUpperCase() !== 'SR01');

        if (datosFiltrados.length === 0) { 
            divDropdown.style.display = 'none'; 
            return; 
        }

        divDropdown.innerHTML = '';
        divDropdown.style.display = 'block';

        datosFiltrados.forEach(s => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.style.cursor = 'pointer';
            
            const cod = s.codigo || 'S/C';
            const desc = s.descripcion || 'Sin descripción';
            
            item.textContent = `[${cod}] ${desc}`;
            
            item.addEventListener('click', () => {
                const inputComboServicio = document.getElementById('comboServicio');
                if (inputComboServicio) inputComboServicio.value = desc;

                const inputPrecio = document.getElementById('txtPrecioUnitItem');
                if (inputPrecio) {
                    inputPrecio.value = Math.round(parseFloat(s.precio) || 0);
                }

                servicioSeleccionado = s;
                divDropdown.style.display = 'none';
                
                const inputCantidad = document.getElementById('txtCantidadItem');
                if (inputCantidad) inputCantidad.focus();
            });
            divDropdown.appendChild(item);
        });
    } catch (err) {
        console.error('Excepción en buscarServiciosPredictivo:', err);
    }
}
//  GESTIÓN DE TABLA DE DETALLE (PRODUCTOS / MANO DE OBRA)
function vincularItemDetalle() {
    try {
        const cantidad = parseFloat(document.getElementById('txtCantidadItem').value) || 0;
        const precioUnitStr = String(document.getElementById('txtPrecioUnitItem').value).replace(/[^0-9.-]+/g,"");
        const precioUnit = parseFloat(precioUnitStr) || 0;
        
        let descripcion = '';
        let codigoItem = '';
        let tipoItemReal = modoActual;

        if (modoActual === 'PRODUCTO') {
            descripcion = document.getElementById('comboProducto').value.trim();
            codigoItem = productoSeleccionado ? productoSeleccionado.codigo : 'PROD-GEN';
        } else {
            descripcion = document.getElementById('comboServicio').value.trim();
            
            if (servicioSeleccionado) {
                codigoItem = servicioSeleccionado.codigo;
                tipoItemReal = 'SERVICIO';
            } else {
                codigoItem = 'MO-GEN';
                tipoItemReal = 'MANO_OBRA';
            }
        }

        const requierePrecio = (tipoItemReal === 'PRODUCTO' || tipoItemReal === 'SERVICIO');
        
        if (codigoItem === 'SR01') {
            mostrarToast('El ítem SR01 MANO DE OBRA global se genera automáticamente. Use el modo Mano de Obra libre.', 'err');
            return;
        }

        if (!descripcion || cantidad <= 0 || (requierePrecio && precioUnit <= 0)) {
            mostrarToast('Complete la Descripción, Cantidad y Valor del Ítem', 'err');
            return;
        }

        const idAsignado = editandoItem ? idTempEdicion : Date.now();

        const nuevoItem = {
            id_temp: idAsignado,
            type: tipoItemReal,
            tipo: tipoItemReal,
            codigo: codigoItem,
            descripcion: descripcion,
            shadow_descripcion: descripcion,
            cantidad: cantidad,
            precio_unitario: precioUnit,
            descuento_item: 0, 
            total: cantidad * precioUnit
        };

        if (editandoItem) {
            itemsAgregados = itemsAgregados.map(item => item.id_temp === idTempEdicion ? nuevoItem : item);
            editandoItem = false;
            idTempEdicion = null;
            document.getElementById('btnAgregarItemLista').textContent = '＋ Vincular Ítem al Detalle';
        } else {
            itemsAgregados.push(nuevoItem);
        }

        renderMiniTabla();
        calcularTotalesLiquidacion();

        document.getElementById('comboProducto').value = '';
        document.getElementById('comboServicio').value = '';
        document.getElementById('txtCantidadItem').value = '1';
        document.getElementById('txtPrecioUnitItem').value = '';
        productoSeleccionado = null;
        servicioSeleccionado = null;
    } catch (err) {
        console.error("Error en vincularItemDetalle:", err);
    }
}

// ── FUNCIÓN DE CONEXIÓN INMEDIATA: FACTURAR BUS ──
function iniciarFacturacionDesdeBus(datosBus) {
    try {
        console.log("Iniciando precarga de datos desde el bus:", datosBus);
        
        // 1. Limpiar el formulario y el estado anterior
        limpiarFormularioComplete(); 
        itemsAgregados = [];
        
        // 2. Precargar Datos del Cliente y Vehículo en los inputs
        if (datosBus.cliente) {
            document.getElementById('txtEmpresa').value = datosBus.cliente.nombre || '';
            document.getElementById('txtNitCc').value = datosBus.cliente.id || '';
            document.getElementById('txtDireccion').value = datosBus.cliente.direccion || '';
            document.getElementById('txtCiudad').value = datosBus.cliente.Ciudad || '';
            document.getElementById('txtTelefono').value = datosBus.cliente.telefono || '';
            
            // Guardar en tu variable global de cliente para mantener consistencia
            clienteSeleccionado = {
                id1: datosBus.cliente.Id1,
                id: datosBus.cliente.id,
                name: datosBus.cliente.nombre,
                identification: datosBus.cliente.id,
                direccion: datosBus.cliente.direccion,
                ciudad: datosBus.cliente.Ciudad,
                telefono: datosBus.cliente.telefono
            };
        }
        
        // Campos adicionales del vehículo/bus (si los tienes en tu HTML)
        if (document.getElementById('txtPlaca')) {
            document.getElementById('txtPlaca').value = datosBus.placa || '';
        }
        if (document.getElementById('txtBusNo')) {
            document.getElementById('txtBusNo').value = datosBus.busNo || '';
        }

        // 3. Mapear e inyectar los ítems del Bus al detalle de la venta
        if (datosBus.items && datosBus.items.length > 0) {
            datosBus.items.forEach((item, index) => {
                const cantidad = parseFloat(item.cantidad) || 1;
                const precioUnit = parseFloat(item.precio_unitario || item.precio) || 0;
                
                itemsAgregados.push({
                    id_temp: Date.now() + index, // IDs únicos temporales
                    type: item.tipo || 'PRODUCTO', // 'PRODUCTO', 'SERVICIO' o 'MANO_OBRA'
                    tipo: item.tipo || 'PRODUCTO',
                    codigo: item.codigo || 'GENERICO',
                    descripcion: item.descripcion || 'Ítem importado',
                    shadow_descripcion: item.descripcion || 'Ítem importado',
                    cantidad: cantidad,
                    precio_unitario: precioUnit,
                    descuento_item: parseFloat(item.descuento) || 0,
                    total: cantidad * precioUnit
                });
            });
        }

        // 4. Si el bus viene con un valor de Mano de Obra Global específico
        if (datosBus.manoObraGlobal && document.getElementById('txtPrecioManoObraGlobal')) {
            document.getElementById('txtPrecioManoObraGlobal').value = Math.round(datosBus.manoObraGlobal);
        }

        // 5. Actualizar la UI de la factura y calcular totales
        renderMiniTabla();
        calcularTotalesLiquidacion();
        
        // 6. ¡Abrir el formulario de golpe!
        abrirFormulario();
        
    } catch (err) {
        console.error("Error al transferir los datos del bus al formulario de facturación:", err);
        alert("Hubo un problema al precargar los datos del bus.");
    }
}

function cargarItemParaEdicion(idTemp) {
    try {
        const item = itemsAgregados.find(i => i.id_temp === idTemp);
        if (!item) return;

        editandoItem = true;
        idTempEdicion = idTemp;
        document.getElementById('btnAgregarItemLista').textContent = 'Actualizar Línea de Detalle';

        document.getElementById('txtCantidadItem').value = item.cantidad;
        document.getElementById('txtPrecioUnitItem').value = item.precio_unitario;

        const btnProd = document.getElementById('btnModoProducto');
        const btnMano = document.getElementById('btnModoManoObra');
        const campoP = document.getElementById('campoProducto');
        const campoS = document.getElementById('campoService'); 
        const campoG = document.getElementById('campoGlobalManoObra');

        if (item.tipo === 'PRODUCTO') {
            modoActual = 'PRODUCTO';
            if (btnProd) btnProd.classList.add('activo');
            if (btnMano) btnMano.classList.remove('activo');
            if (campoP) campoP.style.display = 'flex';
            if (campoS) campoS.style.display = 'none';
            if (campoG) campoG.style.display = 'none';
            habilitarCantidad(true);

            document.getElementById('comboProducto').value = item.descripcion;
            productoSeleccionado = { codigo: item.codigo, descripcion: item.descripcion };
        } else {
            modoActual = item.tipo;
            if (btnMano) btnMano.classList.add('activo');
            if (btnProd) btnProd.classList.remove('activo');
            if (campoP) campoP.style.display = 'none';
            if (campoS) campoS.style.display = 'flex';
            if (campoG) campoG.style.display = 'block';
            habilitarCantidad(false);

            document.getElementById('comboServicio').value = item.descripcion;
            
            if (item.tipo === 'SERVICIO') {
                servicioSeleccionado = { codigo: item.codigo, descripcion: item.descripcion, precio: item.precio_unitario };
            } else {
                servicioSeleccionado = null;
            }
        }
    } catch (err) {
        console.error("Error en cargarItemParaEdicion:", err);
    }
}

function eliminarItemLista(idTemp, event) {
    if(event) event.stopPropagation(); 
    itemsAgregados = itemsAgregados.filter(item => item.id_temp !== idTemp);
    
    if (idTempEdicion === idTemp) {
        editandoItem = false;
        idTempEdicion = null;
        document.getElementById('btnAgregarItemLista').textContent = '＋ Vincular Ítem al Detalle';
    }

    renderMiniTabla();
    calcularTotalesLiquidacion();
}

function renderMiniTabla() {
    const tbody = document.getElementById('miniTablaItemsFactura');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (itemsAgregados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:20px;">Ningún ítem vinculado a la pre-factura.</td></tr>`;
        return;
    }

    itemsAgregados.forEach(item => {
        const tr = document.createElement('tr');
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', () => cargarItemParaEdicion(item.id_temp));

        let prefijoVisual = '';
        let cantidadVisual = item.cantidad;
        let codigoVisual = item.codigo;
        let descuentoVisual = formatMoneda(item.descuento_item);
        let totalVisual = formatMoneda(item.total);

        if (item.tipo === 'SERVICIO') {
            prefijoVisual = '';
            cantidadVisual = '';
        } else if (item.tipo === 'MANO_OBRA') {
            prefijoVisual = '';
            cantidadVisual = '';
            codigoVisual = '';
            descuentoVisual = '';
            totalVisual = '';
        }

        tr.innerHTML = `
            <td style="text-align:center; font-weight:bold; width:90px;">${cantidadVisual}</td>
            <td style="font-family:monospace; color:#475569; width:120px;">${codigoVisual}</td>
            <td>${prefijoVisual}${item.descripcion}</td>
            <td style="text-align:right; color:#dc2626; width:110px;">${descuentoVisual}</td>
            <td style="text-align:right; font-weight:bold; color:#284B87; width:130px;">${totalVisual}</td>
            <td style="text-align:center; width:50px;">
                <button type="button" class="btn-eliminar-linea" style="background:none; border:none; color:#ef4444; font-weight:bold; cursor:pointer; font-size:16px;">✕</button>
            </td>
        `;

        tr.querySelector('.btn-eliminar-linea').addEventListener('click', (e) => eliminarItemLista(item.id_temp, e));
        tbody.appendChild(tr);
    });
}

// FUNCIÓN CRÍTICA: CALCULAR TOTALES CON LÓGICA CORRECTA
function calcularTotalesLiquidacion() {
    try {
        // 1. Separar ítems por tipo de forma robusta
        const esManoObraConCodigo = (item) => {
            const cod = String(item.codigo || '').toUpperCase();
            return cod.startsWith('SR') || item.tipo === 'MANO_OBRA';
        };

        const esManoObraGlobalSinCodigo = (item) => {
            const cod = String(item.codigo || '').trim();
            return cod === '' || cod === 'undefined' || cod === 'null';
        };

        // Productos: Ítems que no son mano de obra registrada ni líneas de servicio globales sin código
        const itemsNormales = itemsAgregados.filter(item => !esManoObraConCodigo(item) && !esManoObraGlobalSinCodigo(item));
        
        // Mano de Obra con código (ej: SR02)
        const itemsManoObraRegistrada = itemsAgregados.filter(item => esManoObraConCodigo(item));

        // 2. Calcular subtotales iniciales
        const subtotalProductos = itemsNormales.reduce((sum, item) => sum + (parseFloat(item.total || item.precio_unitario) || 0), 0);
        const subtotalManoObraInterna = itemsManoObraRegistrada.reduce((sum, item) => sum + (parseFloat(item.total || item.precio_unitario) || 0), 0);
        
        // Obtener el valor de Mano de Obra Global
        const manoObraGlobalStr = String(document.getElementById('txtPrecioManoObraGlobal')?.value || "0").replace(/[^0-9.-]+/g,"");
        const manoObraGlobal = parseFloat(manoObraGlobalStr) || 0;
        
        const totalManoObraAcumulada = subtotalManoObraInterna + manoObraGlobal;

        // 3. Calcular descuento (Solo aplica a productos)
        const descInput = (document.getElementById('txtDescuentoGlobal')?.value || "").trim();
        let descuentoAplicado = 0;

        if (descInput.endsWith('%')) {
            const pct = parseFloat(descInput.replace('%', '')) || 0;
            descuentoAplicado = subtotalProductos * (pct / 100);
        } else {
            descuentoAplicado = parseFloat(descInput.replace(/[^0-9.-]+/g,"")) || 0;
        }

        const subtotalProductosConDescuento = Math.max(0, subtotalProductos - descuentoAplicado);

        // 4. CÁLCULO DEL TOTAL FINAL, IVA Y BASE VISUAL
        let ivaCalculado = 0;
        let totalNeto = 0;
        let subtotalBrutoUI = 0;

        if (window.configAvanzadaSiigo && window.configAvanzadaSiigo.sincronizarSiigo) {
            // MODO SIIGO:
            // Los productos YA incluyen IVA (Desglose: base = total / 1.19)
            const baseProductos = subtotalProductosConDescuento / 1.19;
            const ivaProductos = subtotalProductosConDescuento - baseProductos;
            
            // La mano de obra NO incluye IVA (Se le suma el 19% adicional)
            const ivaServicios = totalManoObraAcumulada * 0.19;
            
            ivaCalculado = ivaProductos + ivaServicios;
            totalNeto = subtotalProductosConDescuento + totalManoObraAcumulada + ivaServicios;
            
            // Para que la UI sea coherente: Subtotal Bruto = Base de productos + Mano de obra sin el IVA
            subtotalBrutoUI = baseProductos + totalManoObraAcumulada;
        } else {
            // MODO INTERNO: Sin IVA adicional ni desgloses
            ivaCalculado = 0;
            totalNeto = subtotalProductosConDescuento + totalManoObraAcumulada;
            subtotalBrutoUI = subtotalProductos + totalManoObraAcumulada;
        }

        // 5. Actualizar UI (Redondeando visualmente para evitar decimales molestos)
        document.getElementById('lblSubtotalBruto').textContent = formatMoneda(Math.round(subtotalBrutoUI));
        document.getElementById('lblDescuentoAplicado').textContent = `-${formatMoneda(Math.round(descuentoAplicado))}`;
        
        let elIva = document.getElementById('lblIvaCalculado');
        if (elIva) {
            elIva.textContent = formatMoneda(Math.round(ivaCalculado));
        } else if (ivaCalculado > 0) {
            const contenedorTotal = document.getElementById('lblTotalNeto')?.parentElement;
            if (contenedorTotal) {
                const filaIva = document.createElement('div');
                filaIva.style = "display:flex; justify-content:space-between; margin-bottom:5px;";
                filaIva.innerHTML = `<span>IVA (19%):</span> <strong id="lblIvaCalculado">${formatMoneda(Math.round(ivaCalculado))}</strong>`;
                contenedorTotal.insertBefore(filaIva, document.getElementById('lblTotalNeto'));
            }
        }

        document.getElementById('lblTotalNeto').textContent = formatMoneda(Math.round(totalNeto));

        // 6. ALMACENAR EN MEMORIA PARA SIIGO
        window.totalesFactura = {
            subtotalBruto: subtotalBrutoUI, // Almacena la base imponible real
            descuentoAplicado: descuentoAplicado,
            subtotalProductosConDescuento: subtotalProductosConDescuento,
            totalManoObraAcumulada: totalManoObraAcumulada,
            ivaCalculado: ivaCalculado,
            totalNeto: totalNeto
        };

    } catch(err) {
        console.error("Error calculando totales:", err);
    }
}

//  GENERACIÓN DE PDF INTERNO (SIN SIIGO)
async function generarPDFInterno(datosFactura) {
    try {
        const response = await sb.functions.invoke('generar-pdf-factura', {
            body: {
                idFactura: datosFactura.idFactura,
                fecha: datosFactura.fecha,
                cliente: datosFactura.cliente,
                nit: datosFactura.nit,
                direccion: datosFactura.direccion,
                ciudad: datosFactura.ciudad,
                telefono: datosFactura.telefono,
                empresa: datosFactura.empresa,
                busNo: datosFactura.busNo,
                placa: datosFactura.placa,
                items: datosFactura.items,
                subtotalBruto: datosFactura.subtotalBruto,
                descuento: datosFactura.descuento,
                totalNeto: datosFactura.totalNeto,
                observaciones: datosFactura.observaciones,
            }
        });

        if (response.error) {
            console.error("Error en Edge Function generar-pdf-factura:", response.error);
            return "Error";
        }

        if (response.data && response.data.success) {
            console.log("PDF generado exitosamente:", response.data.pdfUrl);
            return response.data.pdfUrl;
        } else {
            console.error("Respuesta inesperada:", response.data);
            return "Error";
        }
    } catch (err) {
        console.error("Excepción en generarPDFInterno:", err);
        return "Error";
    }
}

async function guardarFacturaBaseDatos(tipoFacturacion) {
    try {
        const empresa = document.getElementById('txtEmpresa').value.trim();
        const nitCc = document.getElementById('txtNitCc').value.trim();
        
        if (!empresa || !nitCc) {
            mostrarToast('La Razón Social y el NIT son campos obligatorios', 'err');
            return;
        }
        
        const manoObraGlobal = parseFloat(String(document.getElementById('txtPrecioManoObraGlobal').value).replace(/[^0-9.-]+/g,"")) || 0;
        
        if (itemsAgregados.length === 0 && manoObraGlobal === 0) {
            mostrarToast('Debe vincular al menos un ítem al detalle para guardar', 'err');
            return;
        }

        // USAR LOS TOTALES YA CALCULADOS
        const totales = window.totalesFactura || {
            subtotalBruto: 0,
            descuentoAplicado: 0,
            totalNeto: 0
        };

        const dia = String(document.getElementById('txtFechaDia').value).padStart(2, '0');
        const mes = String(document.getElementById('txtFechaMes').value).padStart(2, '0');
        const anio = document.getElementById('txtFechaAnio').value;
        const fechaCompletaText = `${anio}-${mes}-${dia}`;

        const busNoText = document.getElementById('txtBusNo') ? document.getElementById('txtBusNo').value.trim() : '';
        const placaText = document.getElementById('txtPlaca') ? document.getElementById('txtPlaca').value.trim() : '';
        
        const obsText = window.configAvanzadaSiigo ? window.configAvanzadaSiigo.observaciones : 'Facturada desde ThermoAirSystem';

        // PAYLOAD PARA SUPABASE (en minúsculas)
        const payloadFactura = {
            fecha: fechaCompletaText,
            cliente: empresa,
            nit: nitCc,
            subtotal: String(Math.round(totales.subtotalBruto)),
            descuento: String(Math.round(totales.descuentoAplicado)),
            total: String(Math.round(totales.totalNeto)),
            total_bruto: String(Math.round(totales.subtotalBruto))
        };

        mostrarToast('Generando documento interno...');
        const urlPdfGenerado = await generarPDFInterno({
            fecha: fechaCompletaText,
            cliente: empresa,
            nit: nitCc,
            direccion: document.getElementById('txtDireccion')?.value || '',
            ciudad: document.getElementById('txtCiudad')?.value || '',
            telefono: document.getElementById('txtTelefono')?.value || '',
            empresa: empresa,
            busNo: busNoText, 
            placa: placaText,
            items: itemsAgregados,
            subtotalBruto: totales.subtotalBruto,
            descuento: totales.descuentoAplicado,
            totalNeto: totales.totalNeto,
            observaciones: obsText
        });

        // 1. Guardar en Supabase
        const { data, error } = await sb
            .from('facturas_venta')
            .insert([payloadFactura])
            .select();

        if (error) {
            console.error('Supabase Guardar Factura Error:', error);
            mostrarToast(`Error al guardar en Supabase: ${error.message}`, 'err');
            return;
        }

        // 2. Sincronización con Siigo
        if (tipoFacturacion === 'SIIGO') {
            if (!window.configAvanzadaSiigo.sincronizarSiigo) {
                mostrarToast('Factura guardada (Sincronización Siigo saltada por el usuario)');
            } else if (clienteSeleccionado && clienteSeleccionado.id1) {
                mostrarToast('Factura guardada. Sincronizando con Siigo...');
                
                const payloadParaSiigo = {
                    FECHA: fechaCompletaText,
                    CLIENTE: empresa,
                    NIT: nitCc,
                    SUBTOTAL: Math.round(totales.subtotalBruto),
                    DESCUENTO: Math.round(totales.descuentoAplicado),
                    TOTAL: Math.round(totales.totalNeto),
                    TOTAL_BRUTO: Math.round(totales.subtotalBruto),
                    IVA: Math.round(totales.ivaCalculado),
                    ITEMS: JSON.stringify(itemsAgregados),
                    BUS_NO: busNoText,
                    PLACA: placaText,
                    OBSERVACIONES: obsText,
                    URL_PDF: urlPdfGenerado !== "Error" ? urlPdfGenerado : "",
                    observaciones: window.configAvanzadaSiigo ? window.configAvanzadaSiigo.observaciones : ""
                };
                await enviarFacturaASiigo(payloadParaSiigo, clienteSeleccionado.id1);
            } else {
                console.warn('No se envió a Siigo: el cliente no posee identificador de Siigo (id1)');
                mostrarToast('Guardada en Supabase, pero sin cuenta Siigo vinculada.', 'err');
            }
        } else {
            mostrarToast('✓ Factura guardada internamente con PDF generado');
        }

        cerrarFormulario();
        await cargarFacturas();
        renderizarTodo();
    } catch (err) {
        console.error("Excepción fatal en guardarFacturaBaseDatos:", err);
        mostrarToast('Error crítico al guardar factura', 'err');
    }
}

// VERSIÓN CORREGIDA: Teléfono limpio, iva_incluido dinámico, payload validado
// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN Y ENVÍO RECALCULADO PARA EVITAR DESCUADRES CON SIIGO (ERROR 400)
// ══════════════════════════════════════════════════════════════════════════════
async function enviarFacturaASiigo(facturaData, siigoClienteId) {
    try {
        const itemsOriginales = JSON.parse(facturaData.ITEMS) || [];
        
        // Definición unificada de Mano de Obra para mantener consistencia
        const esManoObra = (item) => {
            const cod = String(item.codigo || '').toUpperCase();
            const desc = String(item.descripcion || item.detalle || '').toUpperCase();
            return cod.startsWith('SR') || 
                   desc.includes('MANTENIMIENTO') || 
                   desc.includes('AJUSTE') || 
                   desc.includes('MANO DE OBRA') ||
                   item.tipo === 'MANO_OBRA';
        };

        // 1. FILTRAR ÍTEMS DE PRODUCTOS/REPUESTOS VÁLIDOS
        const itemsFiltrados = itemsOriginales.filter(item => !esManoObra(item));
        
        const itemsFormateados = itemsFiltrados.map(item => {
            const esProducto = !esManoObra(item);
            return {
                codigo: String(item.codigo),
                descripcion: String(item.descripcion || item.detalle || 'PRODUCTO'),
                cantidad: parseFloat(item.cantidad) || 1,
                precio_unitario: parseFloat(item.precio_unitario || item.total) || 0,
                descuento_item: parseFloat(item.descuento_item) || 0,
                aplica_iva: true,
                iva_incluido: esProducto  // true para productos
            }
        });

        // 2. EXTRAER Y CALCULAR MANO DE OBRA TOTAL
        const lineasManoObraLibre = itemsOriginales.filter(item => esManoObra(item));
        
        const totalManoObraLineas = lineasManoObraLibre.reduce((sum, item) => 
            sum + (parseFloat(item.total || item.precio_unitario) || 0), 0
        );

        const manoObraGlobalStr = String(document.getElementById('txtPrecioManoObraGlobal')?.value || "0").replace(/[^0-9.-]+/g,"");
        const manoObraGlobalValor = parseFloat(manoObraGlobalStr) || 0;

        const valorManoObraConsolidado = totalManoObraLineas + manoObraGlobalValor;

        if (valorManoObraConsolidado > 0) {
            itemsFormateados.push({
                codigo: 'SR01',
                descripcion: 'MANO DE OBRA CONSOLIDADA',
                cantidad: 1,
                precio_unitario: valorManoObraConsolidado,
                descuento_item: 0,
                aplica_iva: true, 
                iva_incluido: false  // Los servicios van sin IVA incluido para que el API sume el impuesto base
            });
        }

        // 3. PREPARAR OBSERVACIONES DETALLADAS
        let bloquesObservaciones = [];

        if (lineasManoObraLibre.length > 0) {
            bloquesObservaciones.push("MANO DE OBRA DETALLADA:");
            lineasManoObraLibre.forEach(mo => {
                const descrip = String(mo.descripcion || mo.detalle || 'Servicio').toUpperCase();
                bloquesObservaciones.push(`-${descrip}`);
            });
        }

        const busNum = document.getElementById('txtInternoBus')?.value?.trim() || facturaData.BUS_NO;
        const placaVehiculo = document.getElementById('txtPlacaVehiculo')?.value?.trim() || facturaData.PLACA;
        
        if (busNum || placaVehiculo) {
            let lineaVehiculo = "";
            if (busNum) lineaVehiculo += `BUS ${busNum}`;
            if (placaVehiculo) lineaVehiculo += `${lineaVehiculo ? ' ' : ''}PLACA: ${placaVehiculo.toUpperCase()}`;
            bloquesObservaciones.push(lineaVehiculo);
        }

        let observacionesUsuario = window.configAvanzadaSiigo?.observaciones || '';
        let observacionesFinales = "";
        
        if (observacionesUsuario.trim() !== "") {
            if (bloquesObservaciones.length > 0) {
                observacionesFinales = bloquesObservaciones.join("\n") + `\n\nNota: ${observacionesUsuario.trim()}`;
            } else {
                observacionesFinales = observacionesUsuario.trim();
            }
        } else {
            observacionesFinales = bloquesObservaciones.join("\n");
        }

        // 4. RECALCULO MATEMÁTICO STRICTO PARA PREVENIR EL ERROR 400
        let subtotalRecalculado = 0;
        itemsFormateados.forEach(it => {
            subtotalRecalculado += (it.cantidad * it.precio_unitario) - it.descuento_item;
        });

        const descuentoGlobal = Math.round(parseFloat(window.totalesFactura?.descuentoAplicado) || 0);
        const subtotalFinal = Math.round(subtotalRecalculado);
        
        // 5. LIMPIEZA ROBUSTA DE TELÉFONO
        let telefonoLimpio = "3003793474"; // Default
        const telefonoRaw = document.getElementById('txtTelefono')?.value || '';
        
        if (telefonoRaw) {
            let tempTel = String(telefonoRaw)
                .replace(/\s+/g, '')        
                .replace(/-/g, '')           
                .replace(/\(/g, '').replace(/\)/g, '') 
                .replace(/\+/g, '')          
                .replace(/^0/, '')           
                .replace(/^57/, '')          
            
            if (tempTel.length >= 7 && tempTel.length <= 10 && /^\d+$/.test(tempTel)) {
                telefonoLimpio = tempTel;
                console.log(`[TELÉFONO] Limpiado: ${telefonoRaw} → ${telefonoLimpio}`);
            } else {
                console.warn(`[TELÉFONO] Formato inválido, usando default: ${telefonoLimpio}`);
            }
        }

        // 5.5 DETERMINAR RELACIÓN CORRECTA DE IDENTIFICACIÓN PARA SIIGO
        let tipoIdCorregido = String(facturaData.tipo_id || 'NIT').toUpperCase();
        const tipoPersona = tipoIdCorregido === 'NIT' ? 'Company' : 'Person';
        
        if (tipoPersona === 'Person' && tipoIdCorregido === 'NIT') {
            console.log("[SIIGO SINCRO] Corrigiendo tipo_id de NIT a CC porque el cliente es Persona Natural.");
            tipoIdCorregido = "CC"; 
        }

        // NUEVO: Mapear tipo_id al código numérico oficial requerido por el API de Siigo
        // NIT -> 31, Cédula de Ciudadanía (CC) -> 13. Si viene otra cosa, asignamos CC por seguridad.
        const mapaCodigosSiigo = {
            'NIT': '31',
            'CC': '13',
            'CÉDULA DE CIUDADANÍA': '13',
            'CEDULA DE CIUDADANIA': '13'
        };
        const idTypeSiigoNum = mapaCodigosSiigo[tipoIdCorregido] || '13';

        // 6. ARMAR PAYLOAD CON VALORES DE DETALLE SINCRO
        const payloadSiigo = {
            cliente_siigo_id: String(siigoClienteId || ''), 
            nit_cliente: String(facturaData.NIT || facturaData.nit_cliente),           
            person_type: tipoPersona,              // 'Company' o 'Person'
            tipo_id: tipoIdCorregido,              // Para control interno si lo usas en el backend
            id_type: idTypeSiigoNum,               // ✓ NUEVO: Enviado explícitamente ("31" o "13")
            tipo_iva: String(facturaData.tipo_iva || 'ResponsableInscripto'),
            fecha: String(facturaData.FECHA || facturaData.fecha),
            items: itemsFormateados,
            subtotal: subtotalFinal, 
            descuento: descuentoGlobal,
            total: Math.round(window.totalesFactura?.totalNeto) || subtotalFinal, 
            forma_pago: window.configAvanzadaSiigo?.formaPago || 'efectivo',
            observaciones: observacionesFinales,
            direccion: document.getElementById('txtDireccion')?.value || 'CL49 No 12 25',
            ciudad: document.getElementById('txtCiudad')?.value || 'Soledad',
            telefono: telefonoLimpio,  
            empresa: String(facturaData.CLIENTE || facturaData.empresa),
            busNo: String(busNum || ''),
            placa: String(placaVehiculo || ''),
            idFactura: String(Date.now())
        };

        console.log("%c[PAYLOAD OPTIMIZADO] Enviado a Siigo:", "color: #10b981; font-weight: bold;");
        console.log(JSON.stringify(payloadSiigo, null, 2));

        // 7. INVOCACIÓN DE LA EDGE FUNCTION
        const { data, error } = await sb.functions.invoke('facturar-siigo', {
            body: payloadSiigo
        });

        if (error) {
            console.error("%c--- ERROR EN EDGE FUNCTION ---", "color: #ef4444; font-weight: bold; font-size: 14px;");
            console.error("Mensaje genérico:", error.message);
            
            if (error.context && typeof error.context.json === 'function') {
                try {
                    const errorDetallado = await error.context.json();
                    console.error("%cRespuesta detallada de Siigo:", "color: #f97316; font-weight: bold;", errorDetallado);
                    
                    if (typeof mostrarToast === 'function') {
                        const msgErr = errorDetallado.message || errorDetallado.errors?.[0]?.message || "Error de validación en parámetros";
                        mostrarToast(`Error Siigo: ${msgErr}`, 'err');
                    }
                } catch (jsonErr) {
                    console.error("No se pudo parsear el JSON de error:", jsonErr);
                }
            }
            return;
        }

        if (data && data.success) {
            console.log("%c✓ Factura sincronizada con Siigo!", "color: #22c55e; font-weight: bold; font-size: 16px;");
            if (typeof mostrarToast === 'function') {
                mostrarToast('✓ Factura Sincronizada con Siigo Correctamente');
            }
        } else {
            console.error("[ERROR] Respuesta inesperada:", data);
            if (typeof mostrarToast === 'function') {
                mostrarToast('Error: Respuesta inesperada de Siigo', 'err');
            }
        }

    } catch (err) {
        console.error("%c[EXCEPCIÓN FATAL]", "color: #dc2626; font-weight: bold;", err.message);
        if (typeof mostrarToast === 'function') {
            mostrarToast(`Error crítico: ${err.message}`, 'err');
        }
    }
}

//  MANEJO DE EVENTOS DE INTERFAZ (BIND)
function bindUI() {
    try {
        const txtBuscar = document.getElementById('txtBuscar');
        if(txtBuscar) {
            txtBuscar.addEventListener('input', e => renderizarTodo(e.target.value));
        }

        document.getElementById('btnNuevaFactura').addEventListener('click', abrirFormulario);
        document.getElementById('overlaySheet').addEventListener('click', cerrarFormulario);
        document.getElementById('btnLimpiarFactura').addEventListener('click', limpiarFormularioComplete);

        document.getElementById('comboCliente').addEventListener('input', e => buscarClientesPredictivo(e.target.value));
        document.getElementById('comboProducto').addEventListener('input', e => buscarProductosPredictivo(e.target.value));
        
        const comboServicio = document.getElementById('comboServicio');
        if (!comboServicio) {
            console.error("ERROR CRÍTICO: El elemento HTML input id='comboServicio' no existe en el DOM.");
        } else {
            comboServicio.addEventListener('input', e => buscarServiciosPredictivo(e.target.value));
        }

        document.addEventListener('click', e => {
            if (e.target.id !== 'comboCliente' && document.getElementById('dropdownClientes')) document.getElementById('dropdownClientes').style.display = 'none';
            if (e.target.id !== 'comboProducto' && document.getElementById('dropdownProductosForm')) document.getElementById('dropdownProductosForm').style.display = 'none';
            if (e.target.id !== 'comboServicio' && document.getElementById('dropdownServicios')) document.getElementById('dropdownServicios').style.display = 'none';
        });

        const btnProd = document.getElementById('btnModoProducto');
        const btnMano = document.getElementById('btnModoManoObra');
        const campoP = document.getElementById('campoProducto');
        const campoS = document.getElementById('campoService'); 
        const campoG = document.getElementById('campoGlobalManoObra');

        if(btnProd && btnMano) {
            btnProd.addEventListener('click', () => {
                modoActual = 'PRODUCTO';
                btnProd.classList.add('activo');
                btnMano.classList.remove('activo');
                if(campoP) campoP.style.display = 'flex';
                if(campoS) campoS.style.display = 'none';
                if(campoG) campoG.style.display = 'none';
                habilitarCantidad(true);
            });

            btnMano.addEventListener('click', () => {
                modoActual = 'MANO_OBRA';
                btnMano.classList.add('activo');
                btnProd.classList.remove('activo');
                if(campoP) campoP.style.display = 'none';
                if(campoS) campoS.style.display = 'flex';
                if(campoG) campoG.style.display = 'block';
                habilitarCantidad(false);
            });
        }

        document.getElementById('btnAgregarItemLista').addEventListener('click', vincularItemDetalle);
        document.getElementById('txtDescuentoGlobal').addEventListener('input', calcularTotalesLiquidacion);
        document.getElementById('txtPrecioManoObraGlobal').addEventListener('input', calcularTotalesLiquidacion);

        document.getElementById('btnConfirmarGenerarFactura').addEventListener('click', (e) => {
            e.preventDefault();
            
            const empresa = document.getElementById('txtEmpresa').value.trim();
            const nitCc = document.getElementById('txtNitCc').value.trim();
            if (!empresa || !nitCc) {
                mostrarToast('La Razón Social y el NIT son campos obligatorios', 'err');
                return;
            }
            const manoObraGlobal = parseFloat(String(document.getElementById('txtPrecioManoObraGlobal').value).replace(/[^0-9.-]+/g,"")) || 0;
            if (itemsAgregados.length === 0 && manoObraGlobal === 0) {
                mostrarToast('Debe vincular al menos un ítem al detalle para guardar', 'err');
                return;
            }

            abrirMenuAvanzadoSiigo();
        });

    } catch(err) {
        console.error("Error en bindUI binding de eventos:", err);
    }
}

function limpiarFormularioComplete() {
    const inputs = document.querySelectorAll('#hojaSheet input');
    inputs.forEach(i => {
        if(!['txtFechaDia', 'txtFechaMes', 'txtFechaAnio', 'txtCantidadItem'].includes(i.id)) {
            i.value = '';
        }
    });
    itemsAgregados = [];
    clienteSeleccionado = null;
    productoSeleccionado = null;
    servicioSeleccionado = null;
    editandoItem = false;
    idTempEdicion = null;
    const btnAdd = document.getElementById('btnAgregarItemLista');
    if(btnAdd) btnAdd.textContent = '＋ Vincular Ítem al Detalle';
    renderMiniTabla();
    calcularTotalesLiquidacion();
}

// ══════════════════════════════════════════════════════════════════════════════
//  UTILIDADES GLOBALES
// ══════════════════════════════════════════════════════════════════════════════
function parsearFecha(fechaStr) {
    if (!fechaStr) return null;
    return new Date(fechaStr + 'T00:00:00');
}

function etiquetaFecha(fechaStr) {
    const d = parsearFecha(fechaStr);
    if (!d || isNaN(d)) return fechaStr;

    const hoy = new Date(); hoy.setHours(0,0,0,0);
    const ayer = new Date(hoy); ayer.setDate(hoy.getDate()-1);
    d.setHours(0,0,0,0);

    if (d.getTime() === hoy.getTime())  return 'Hoy';
    if (d.getTime() === ayer.getTime()) return 'Ayer';

    return d.toLocaleDateString('es-CO', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
}

function formatMoneda(valor) {
    const n = parseFloat(valor);
    if (isNaN(n)) return '$0';
    return new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(n);
}

// 🚀 ACCIÓN: DETECTAR PRECARGA DESDE EL BUS
document.addEventListener("DOMContentLoaded", () => {
    const datosPrecargados = localStorage.getItem('datosBusPrecarga');
    if (datosPrecargados) {
        try {
            const datosBus = JSON.parse(datosPrecargados);
            
            // 1. Ejecutar la función de precarga con el objeto recuperado
            iniciarFacturacionDesdeBus(datosBus);
            
            // 2. Limpiar la memoria para que no se vuelva a abrir al recargar la página manualmente
            localStorage.removeItem('datosBusPrecarga');
        } catch (e) {
            console.error("Error al procesar la precarga del bus:", e);
        }
    }
});

let toastTimer = null;
function mostrarToast(msg, tipo = '') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'visible ' + tipo;
    el.style.background = tipo === 'err' ? '#dc2626' : '#1e293b';
    
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.className = '', 3500);
}

//  MÓDULO DE CONFIGURACIÓN AVANZADA SIIGO VENTA
function abrirMenuAvanzadoSiigo() {
    const modalExistente = document.getElementById('modalSiigoAvanzado');
    if (modalExistente) modalExistente.remove();

    const overlay = document.createElement('div');
    overlay.id = 'modalSiigoAvanzado';
    overlay.style = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.6); 
        z-index: 2000; display: flex; align-items: center; justify-content: center;
        padding: 20px; font-family: inherit;
    `;

    overlay.innerHTML = `
        <div style="background: white; width: 100%; max-width: 500px; border-radius: 14px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden; display: flex; flex-direction: column;">
            <div style="background: #284B87; padding: 16px 20px; color: white; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Configuración de Venta (Siigo)</h3>
                <span style="font-size: 11px; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 20px;">FV-1 (ID: 2333)</span>
            </div>
            <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px; max-height: 70vh; overflow-y: auto;">
                <div style="display: flex; align-items: center; justify-content: space-between; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div>
                        <label style="font-size: 13px; font-weight: bold; color: #203764; display: block;">Sincronizar Venta con Siigo</label>
                        <span style="font-size: 11px; color: #64748b;">Enviar factura mediante la API (Aplica IVA del 19% a productos)</span>
                    </div>
                    <input type="checkbox" id="swSiigo" ${window.configAvanzadaSiigo.sincronizarSiigo ? 'checked' : ''} style="width: 40px; height: 20px; cursor: pointer;">
                </div>
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 4px 0;">
                <div class="campo">
                    <label style="font-size: 11px; font-weight: bold; color: #203764; display: block; margin-bottom: 6px; text-transform: uppercase;">Forma de Pago (Cartera Clientes)</label>
                    <select id="selPago" style="width: 100%; padding: 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; background: white;">
                        <option value="efectivo" ${(window.configAvanzadaSiigo && window.configAvanzadaSiigo.formaPago === 'efectivo') ? 'selected' : ''}>Efectivo</option>
                        <option value="credito" ${(!window.configAvanzadaSiigo || window.configAvanzadaSiigo.formaPago === 'credito') ? 'selected' : ''}>Crédito Clientes</option>
                        <option value="bancolombia" ${(window.configAvanzadaSiigo && window.configAvanzadaSiigo.formaPago === 'bancolombia') ? 'selected' : ''}>Bancolombia</option>
                    </select>
                </div>
                <div class="campo">
                    <label style="font-size: 11px; font-weight: bold; color: #203764; display: block; margin-bottom: 6px; text-transform: uppercase;">Observaciones de la Factura</label>
                    <textarea id="txtObservacionesAvanzadas" rows="3" style="width: 100%; padding: 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; font-family: inherit; resize: none;" placeholder="Estas notas viajarán impresas en el documento de Siigo...">${window.configAvanzadaSiigo.observaciones || ''}</textarea>
                </div>
            </div>
            <div style="background: #f8fafc; padding: 14px 20px; border-top: 1px solid #e2e8f0; display: flex; gap: 12px; justify-content: flex-end;">
                <button type="button" onclick="cerrarMenuAvanzadoSiigo()" style="padding: 10px 16px; background: #e2e8f0; color: #475569; border: none; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">Cancelar</button>
                <button type="button" onclick="procesarFacturacionFinal()" style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">Confirmar y Facturar</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const swSiigo = document.getElementById('swSiigo');
    if (swSiigo) {
        swSiigo.addEventListener('change', () => {
            window.configAvanzadaSiigo.sincronizarSiigo = swSiigo.checked;
            if (typeof calcularTotalesLiquidacion === 'function') calcularTotalesLiquidacion();
        });
    }
}

function cerrarMenuAvanzadoSiigo() {
    const modalExistente = document.getElementById('modalSiigoAvanzado');
    if (modalExistente) modalExistente.remove();
}

async function procesarFacturacionFinal() {
    const swSiigo = document.getElementById('swSiigo');
    const selPago = document.getElementById('selPago');
    const txtObs = document.getElementById('txtObservacionesAvanzadas');

    window.configAvanzadaSiigo = {
        sincronizarSiigo: swSiigo ? swSiigo.checked : false,
        formaPago: selPago ? selPago.value : 'efectivo',
        observaciones: txtObs ? txtObs.value.trim() : ''
    };

    cerrarMenuAvanzadoSiigo();
    
    if (typeof calcularTotalesLiquidacion === 'function') calcularTotalesLiquidacion();

    if (window.configAvanzadaSiigo.sincronizarSiigo) {
        if (typeof mostrarToast === 'function') mostrarToast('Procesando Facturación Electrónica en Siigo...', 'info');
        await guardarFacturaBaseDatos('SIIGO');
    } else {
        if (typeof mostrarToast === 'function') mostrarToast('Procesando Facturación Interna...', 'info');
        await guardarFacturaBaseDatos('INTERNA');
    }
}