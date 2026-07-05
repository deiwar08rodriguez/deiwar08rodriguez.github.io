// ══════════════════════════════════════════════════════════
//  CONFIGURACIÓN SUPABASE
// ══════════════════════════════════════════════════════════
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
let itemsAgregados = []; 
let clienteSeleccionado = null;
let productoSeleccionado = null;
let servicioSeleccionado = null; 
let modoActual = 'PRODUCTO'; 

let editandoItem = false;
let idTempEdicion = null;

// ══════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════
//  CARGA DE HISTORIAL DESDE SUPABASE
// ══════════════════════════════════════════════════════════
async function cargarFacturas() {
    try {
        const { data, error } = await sb
            .from('facturas_venta')
            .select('*')
            .order('FECHA', { ascending: false })
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

// ══════════════════════════════════════════════════════════
//  RENDERIZADO DE TABLA PRINCIPAL Y MÓVIL
// ══════════════════════════════════════════════════════════
function renderizarTodo(filtro = '') {
    try {
        const txt = filtro.trim().toLowerCase();
        let lista = todasFacturas;

        if (txt) {
            lista = lista.filter(f => 
                (f.CLIENTE || '').toLowerCase().includes(txt) ||
                (f.NIT || '').toLowerCase().includes(txt) ||
                (f.ID_FACTURA || '').toLowerCase().includes(txt) ||
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
        const key = f.FECHA || 'Sin Fecha';
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
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:60px;color:#94a3b8;">No se encontraron facturas de venta registradas</td></tr>`;
        return;
    }

    grupos.forEach((filas, fechaKey) => {
        const trGrupo = document.createElement('tr');
        trGrupo.innerHTML = `
            <td colspan="8" style="background:#f8fafc;padding:10px 14px;">
                <span style="font-size:12px;font-weight:bold;color:#284B87;text-transform:uppercase;letter-spacing:.5px;">
                    ${etiquetaFecha(fechaKey)} — ${filas.length} factura${filas.length !== 1 ? 's' : ''}
                </span>
            </td>`;
        tbody.appendChild(trGrupo);

        filas.forEach(f => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${f.FECHA || '—'}</td>
                <td style="font-weight:bold;"># ${f.ID_FACTURA || f.id}</td>
                <td>${f.CLIENTE || '—'}</td>
                <td>${f.NIT || '—'}</td>
                <td>—</td>
                <td style="text-align: right;">${formatMoneda(f.TOTAL_BRUTO)}</td>
                <td style="text-align: right; color: #dc2626;">-${formatMoneda(f.DESCUENTO)}</td>
                <td style="text-align: right; font-weight: bold; color: #284B87;">${formatMoneda(f.TOTAL)}</td>
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
            card.style.cssText = 'background:white; border:1px solid #e2e8f0; padding:12px; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,0.02); display:flex; flex-direction:column; gap:4px;';
            
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; font-weight:bold; color:#203764;">
                    <span style="flex:1;">Factura # ${f.ID_FACTURA || f.id}</span>
                    <span style="color:#10b981;">${formatMoneda(f.TOTAL)}</span>
                </div>
                <div style="font-size:13px; color:#475569;">${f.CLIENTE || '—'}</div>
                <div style="font-size:12px; color:#64748b; display:flex; justify-content:space-between;">
                    <span>NIT: ${f.NIT || '—'}</span>
                    <span>Desc: -${formatMoneda(f.DESCUENTO)}</span>
                </div>
            `;
            grupo.appendChild(card);
        });
        cont.appendChild(grupo);
    });
}

function abrirFormulario() {
    try {
        document.getElementById('overlaySheet').classList.add('visible');
        document.getElementById('hojaSheet').classList.add('visible');
        establecerFechaHoy();
    } catch(err) { console.error("Error abriendo formulario:", err); }
}

function cerrarFormulario() {
    try {
        document.getElementById('overlaySheet').classList.remove('visible');
        document.getElementById('hojaSheet').classList.remove('visible');
        limpiarFormularioComplete();
    } catch(err) { console.error("Error cerrando formulario:", err); }
}

// ══════════════════════════════════════════════════════════
//  BUSCADORES PREDICTIVOS (LIVE SEARCH)
// ══════════════════════════════════════════════════════════
async function buscarClientesPredictivo(busqueda) {
    const divDropdown = document.getElementById('dropdownClientes');
    if (!divDropdown) { console.error("Elemento 'dropdownClientes' no existe."); return; }
    
    if (busqueda.length < 2) { divDropdown.style.display = 'none'; return; }

    try {
        const { data, error } = await sb
            .from('clientes')
            .select('*')
            .or(`nombre.ilike.%${busqueda}%,nit.ilike.%${busqueda}%`)
            .limit(5);

        if (error) {
            console.error('Supabase Error (buscarClientes):', error);
            return;
        }

        if (!data || data.length === 0) { divDropdown.style.display = 'none'; return; }

        divDropdown.innerHTML = '';
        divDropdown.style.display = 'block';

        data.forEach(c => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = `${c.nombre} (${c.nit})`;
            item.addEventListener('click', () => {
                document.getElementById('comboCliente').value = c.nombre;
                document.getElementById('txtEmpresa').value = c.nombre;
                document.getElementById('txtNitCc').value = c.nit;
                document.getElementById('txtDireccion').value = c.direccion || '';
                document.getElementById('txtCiudad').value = c.ciudad || '';
                document.getElementById('txtTelefono').value = c.telefono || '';
                clienteSeleccionado = c;
                divDropdown.style.display = 'none';
            });
            divDropdown.appendChild(item);
        });
    } catch (err) {
        console.error('Excepción crítica en buscarClientesPredictivo:', err);
    }
}

async function buscarProductosPredictivo(busqueda) {
    const divDropdown = document.getElementById('dropdownProductosForm');
    if (!divDropdown) { console.error("Elemento 'dropdownProductosForm' no existe."); return; }

    if (busqueda.length < 2) { divDropdown.style.display = 'none'; return; }

    try {
        const { data, error } = await sb
            .from('productos')
            .select('*')
            .or(`codigo.ilike.%${busqueda}%,descripcion.ilike.%${busqueda}%`)
            .limit(5);

        if (error) {
            console.error('Supabase Error (buscarProductos):', error);
            return;
        }

        if (!data || data.length === 0) { divDropdown.style.display = 'none'; return; }

        divDropdown.innerHTML = '';
        divDropdown.style.display = 'block';

        data.forEach(p => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = `[${p.codigo}] ${p.descripcion}`;
            item.addEventListener('click', () => {
                document.getElementById('comboProducto').value = p.descripcion;
                document.getElementById('txtPrecioUnitItem').value = Math.round(p.precio_venta || 0);
                productoSeleccionado = p;
                divDropdown.style.display = 'none';
                document.getElementById('txtCantidadItem').focus();
            });
            divDropdown.appendChild(item);
        });
    } catch (err) {
        console.error('Excepción crítica en buscarProductosPredictivo:', err);
    }
}

// CORREGIDO: Se cambiaron los asteriscos (*) por porcentajes (%) en el operador .or() con .ilike
async function buscarServiciosPredictivo(busqueda) {
    console.log(`Ejecutando buscarServiciosPredictivo para: "${busqueda}"`);
    const divDropdown = document.getElementById('dropdownServicios');
    
    if (!divDropdown) { 
        console.error("ERROR CRÍTICO UI: El contenedor id 'dropdownServicios' NO existe en el HTML."); 
        alert("Falta el elemento HTML con id 'dropdownServicios'");
        return; 
    }

    if (busqueda.length < 2) { 
        divDropdown.style.display = 'none'; 
        return; 
    }

    try {
        const { data, error } = await sb
            .from('servicios')
            .select('codigo,descripcion,precio')
            .or(`codigo.ilike.%${busqueda}%,descripcion.ilike.%${busqueda}%`) 
            .limit(5);

        if (error) {
            console.error('¡SUPABASE RETORNÓ UN ERROR EN SERVICIOS!:', error);
            mostrarToast(`Error Base de Datos: ${error.message}`, 'err');
            return;
        }

        console.log("Datos recibidos de servicios:", data);

        if (!data || data.length === 0) { 
            console.warn(`No se encontraron registros en la tabla 'servicios' que coincidan con "${busqueda}".`);
            divDropdown.style.display = 'none'; 
            return; 
        }

        divDropdown.innerHTML = '';
        divDropdown.style.display = 'block';

        data.forEach(s => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = `[${s.codigo}] ${s.descripcion}`;
            item.addEventListener('click', () => {
                document.getElementById('comboService') ? console.log("id comboService detectado") : null;
                
                const inputComboServicio = document.getElementById('comboServicio');
                if(!inputComboServicio) {
                    console.error("No se encontró el input 'comboServicio' para asignarle el texto.");
                } else {
                    inputComboServicio.value = s.descripcion;
                }

                const inputPrecio = document.getElementById('txtPrecioUnitItem');
                if(inputPrecio) {
                    inputPrecio.value = Math.round(parseFloat(s.precio) || 0);
                }

                servicioSeleccionado = s;
                divDropdown.style.display = 'none';
                
                const inputCantidad = document.getElementById('txtCantidadItem');
                if(inputCantidad) inputCantidad.focus();
            });
            divDropdown.appendChild(item);
        });
    } catch (err) {
        console.error('Excepción fatal atrapada en buscarServiciosPredictivo (revisa la consola):', err);
    }
}

// ══════════════════════════════════════════════════════════
//  GESTIÓN DE TABLA DE DETALLE (PRODUCTOS / MANO DE OBRA)
// ══════════════════════════════════════════════════════════
function vincularItemDetalle() {
    try {
        const cantidad = parseInt(document.getElementById('txtCantidadItem').value) || 0;
        const precioUnitStr = String(document.getElementById('txtPrecioUnitItem').value).replace(/[^0-9.-]+/g,"");
        const precioUnit = parseFloat(precioUnitStr) || 0;
        
        let descripcion = '';
        let codigoItem = '';

        if (modoActual === 'PRODUCTO') {
            descripcion = document.getElementById('comboProducto').value.trim();
            codigoItem = productoSeleccionado ? productoSeleccionado.codigo : 'PROD-GEN';
        } else {
            descripcion = document.getElementById('comboServicio').value.trim();
            codigoItem = servicioSeleccionado ? servicioSeleccionado.codigo : 'SERV-GEN';
        }

        if (!descripcion || cantidad <= 0 || precioUnit <= 0) {
            mostrarToast('Complete la Descripción, Cantidad y Valor del Ítem', 'err');
            return;
        }

        const idAsignado = editandoItem ? idTempEdicion : Date.now();

        const nuevoItem = {
            id_temp: idAsignado,
            type: modoActual, // Aquí se mapea 'tipo' correctamente según requiera la base de datos si aplica
            tipo: modoActual,
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

function cargarItemParaEdicion(idTemp) {
    try {
        const item = itemsAgregados.find(i => i.id_temp === idTemp);
        if (!item) return;

        editandoItem = true;
        idTempEdicion = idTemp;
        document.getElementById('btnAgregarItemLista').textContent = '💾 Actualizar Línea de Detalle';

        document.getElementById('txtCantidadItem').value = item.cantidad;
        document.getElementById('txtPrecioUnitItem').value = item.precio_unitario;

        const btnProd = document.getElementById('btnModoProducto');
        const btnMano = document.getElementById('btnModoManoObra');
        const campoP = document.getElementById('campoProducto');
        const campoS = document.getElementById('campoService'); 
        const campoG = document.getElementById('campoGlobalManoObra');

        if (item.tipo === 'PRODUCTO') {
            modoActual = 'PRODUCTO';
            btnProd.classList.add('activo');
            btnMano.classList.remove('activo');
            campoP.style.display = 'flex';
            campoS.style.display = 'none';
            campoG.style.display = 'none';

            document.getElementById('comboProducto').value = item.descripcion;
            productoSeleccionado = { codigo: item.codigo, descripcion: item.descripcion };
        } else {
            modoActual = 'MANO_OBRA';
            btnMano.classList.add('activo');
            btnProd.classList.remove('activo');
            campoP.style.display = 'none';
            campoS.style.display = 'flex';
            campoG.style.display = 'block';

            document.getElementById('comboServicio').value = item.descripcion;
            servicioSeleccionado = { codigo: item.codigo, descripcion: item.descripcion, precio: item.precio_unitario };
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

        const prefijoVisual = item.tipo === 'PRODUCTO' ? '📦 ' : '🛠️ ';

        tr.innerHTML = `
            <td style="text-align:center; font-weight:bold; width:90px;">${item.cantidad}</td>
            <td style="font-family:monospace; color:#475569; width:120px;">${item.codigo}</td>
            <td>${prefijoVisual}${item.descripcion}</td>
            <td style="text-align:right; color:#dc2626; width:110px;">${formatMoneda(item.descuento_item)}</td>
            <td style="text-align:right; font-weight:bold; color:#284B87; width:130px;">${formatMoneda(item.total)}</td>
            <td style="text-align:center; width:50px;">
                <button type="button" class="btn-eliminar-linea" style="background:none; border:none; color:#ef4444; font-weight:bold; cursor:pointer; font-size:16px;">✕</button>
            </td>
        `;

        tr.querySelector('.btn-eliminar-linea').addEventListener('click', (e) => eliminarItemLista(item.id_temp, e));
        tbody.appendChild(tr);
    });
}

function calcularTotalesLiquidacion() {
    try {
        let subtotalBruto = itemsAgregados.reduce((sum, item) => sum + item.total, 0);
        
        const manoObraGlobalStr = String(document.getElementById('txtPrecioManoObraGlobal').value).replace(/[^0-9.-]+/g,"");
        const manoObraGlobal = parseFloat(manoObraGlobalStr) || 0;
        subtotalBruto += manoObraGlobal;

        const descInput = document.getElementById('txtDescuentoGlobal').value.trim();
        let descuentoAplicado = 0;

        if (descInput.endsWith('%')) {
            const pct = parseFloat(descInput.replace('%', '')) || 0;
            let valueDesc = subtotalBruto * (pct / 100);
            descuentoAplicado = valueDesc;
        } else {
            descuentoAplicado = parseFloat(descInput.replace(/[^0-9.-]+/g,"")) || 0;
        }

        const totalNeto = Math.max(0, subtotalBruto - descuentoAplicado);

        document.getElementById('lblSubtotalBruto').textContent = formatMoneda(subtotalBruto);
        document.getElementById('lblDescuentoAplicado').textContent = `-${formatMoneda(descuentoAplicado)}`;
        document.getElementById('lblTotalNeto').textContent = formatMoneda(totalNeto);
    } catch(err) {
        console.error("Error calculando totales:", err);
    }
}

// ══════════════════════════════════════════════════════════
//  PROCESAR GUARDADO FINAL
// ══════════════════════════════════════════════════════════
async function guardarFacturaBaseDatos() {
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

        const subtotalBruto = itemsAgregados.reduce((sum, item) => sum + item.total, 0) + manoObraGlobal;
        const descInput = document.getElementById('txtDescuentoGlobal').value.trim();
        let descuentoAplicado = 0;
        if (descInput.endsWith('%')) {
            const pct = parseFloat(descInput.replace('%', '')) || 0;
            descuentoAplicado = subtotalBruto * (pct / 100);
        } else {
            descuentoAplicado = parseFloat(descInput.replace(/[^0-9.-]+/g,"")) || 0;
        }
        const totalNeto = Math.max(0, subtotalBruto - descuentoAplicado);

        const dia = String(document.getElementById('txtFechaDia').value).padStart(2, '0');
        const mes = String(document.getElementById('txtFechaMes').value).padStart(2, '0');
        const anio = document.getElementById('txtFechaAnio').value;
        const fechaCompletaText = `${anio}-${mes}-${dia}`;

        const payloadFactura = {
            FECHA: fechaCompletaText,
            ID_FACTURA: `FAC-${Date.now().toString().slice(-5)}`, 
            CLIENTE: empresa,
            NIT: nitCc,
            ITEMS: JSON.stringify(itemsAgregados), 
            TOTAL_BRUTO: String(subtotalBruto),
            DESCUENTO: String(descuentoAplicado),
            SUBTOTAL: String(subtotalBruto),
            IVA: "0",
            TOTAL: String(totalNeto),
            FORMA_PAGO: "Contado",
            DOCUMENTO_ORIGEN: "Manual"
        };

        const { data, error } = await sb
            .from('facturas_venta')
            .insert([payloadFactura])
            .select();

        if (error) {
            console.error('Supabase Guardar Factura Error:', error);
            mostrarToast(`Error al guardar: ${error.message}`, 'err');
        } else {
            mostrarToast('Factura de venta generada y guardada con éxito');
            cerrarFormulario();
            await cargarFacturas();
            renderizarTodo();
        }
    } catch (err) {
        console.error("Excepción fatal en guardarFacturaBaseDatos:", err);
    }
}

// ══════════════════════════════════════════════════════════
//  MANEJO DE EVENTOS DE INTERFAZ (BIND)
// ══════════════════════════════════════════════════════════
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
            });

            btnMano.addEventListener('click', () => {
                modoActual = 'MANO_OBRA';
                btnMano.classList.add('activo');
                btnProd.classList.remove('activo');
                if(campoP) campoP.style.display = 'none';
                if(campoS) campoS.style.display = 'flex';
                if(campoG) campoG.style.display = 'block';
            });
        }

        document.getElementById('btnAgregarItemLista').addEventListener('click', vincularItemDetalle);
        document.getElementById('txtDescuentoGlobal').addEventListener('input', calcularTotalesLiquidacion);
        document.getElementById('txtPrecioManoObraGlobal').addEventListener('input', calcularTotalesLiquidacion);

        document.getElementById('btnConfirmarGenerarFactura').addEventListener('click', guardarFacturaBaseDatos);
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

// ══════════════════════════════════════════════════════════
//  UTILIDADES GLOBALES
// ══════════════════════════════════════════════════════════
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