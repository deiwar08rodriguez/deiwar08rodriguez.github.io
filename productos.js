const SUPABASE_URL = "https://vdlxmajvzdtbewchyowm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let productos = [];
let categoriasCache = [];   
let subcategoriasCache = []; 
let timeoutBusqueda;

// Variables de estado del formulario de EDICIÓN
let mCodigoActual = "";
let mStockOriginal = 0;
let mPrecioCompraOriginal = 0;
let mDescripcionOriginal = "";
let mPrecioVentaOriginal = 0;
// ===================== UTILIDADES =====================

function formatoMoneda(valor) {
    const numero = Number(valor ?? 0);
    return numero.toLocaleString("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0
    });
}

function calcularMargenThermoAir(precioVenta, precioCompra) {
    if (precioVenta === null || precioCompra === null) return 0;
    if (precioVenta === "" || precioCompra === "") return 0;

    // Convertir a string y limpiar formato colombiano (eliminar puntos de miles)
    let pvStr = String(precioVenta).replace(/\./g, "").trim();
    let pcStr = String(precioCompra).replace(/\./g, "").trim();
    
    const pv = parseFloat(pvStr) || 0;
    const pc = parseFloat(pcStr) || 0;

    if (isNaN(pv) || isNaN(pc)) return 0;
    if (pc <= 0) return 0;

    return ((pv * 0.9) - pc) / pc;
}

function normalizarBusqueda(v) {
    if (v === null || v === undefined) return "";
    let s = String(v)
        .replace(/\u00A0/g, " ")
        .trim()
        .toUpperCase();
    s = s
        .replace(/Á/g, "A").replace(/É/g, "E").replace(/Í/g, "I")
        .replace(/Ó/g, "O").replace(/Ú/g, "U").replace(/Ü/g, "U")
        .replace(/Ñ/g, "N");
    s = s.replace(/\s+/g, " ");
    return s.trim();
}

// Funciones de máscara tipo facturas_compras.js
function maskPrecio(val) {
    let limpia = String(val).replace(/[^0-9]/g, "");
    if (!limpia || limpia === "0") return "$0";
    return "$" + parseInt(limpia, 10).toLocaleString('es-CO');
}

function maskMargen(val) {
    let esNegativo = String(val).includes('-');
    let limpia = String(val).replace(/[^0-9]/g, "");
    if (!limpia || limpia === "0") return "%0";
    return (esNegativo ? "-%" : "%") + parseInt(limpia, 10);
}

function limpiarValorMonedaAFloat(texto) {
    let limpio = texto.replace(/\./g, "").replace(/,/g, ".").replace(/[^0-9.]/g, "");
    return parseFloat(limpio) || 0;
}

// ===================== CARGA DE PRODUCTOS =====================

async function cargarProductos() {
    const { data, error } = await supabaseClient
        .from("productos")
        .select(`
            codigo,
            categoria,
            subcategoria,
            descripcion,
            stock,
            proveedor,
            precio_compra,
            precio_venta,
            codigo_prov
        `)
        .order("categoria")
        .order("subcategoria")
        .order("codigo");

    if (error) {
        console.error("ERROR CARGANDO PRODUCTOS:", error);
        alert("Error cargando productos de Supabase: " + error.message);
        return;
    }

    productos = data || [];
    renderizarProductos(productos);
}

function renderizarProductos(datos) {
    const tabla = document.getElementById("tablaProductos");
    const contenedorMovil = document.getElementById("contenedorTarjetasMovil");

    let htmlTabla = "";
    let htmlMovil = "";

    datos.forEach(producto => {
        const stockActual = Number(producto.stock ?? 0);
        const claseStock = stockActual <= 0 ? "sin-stock" : "";
        const margen = calcularMargenThermoAir(producto.precio_venta, producto.precio_compra);
        const margenVisual = (margen * 100).toFixed(1) + "%";

        htmlTabla += `
        <tr onclick="abrirModalEditar('${producto.codigo}')">
            <td class="col-codigo">${producto.codigo ?? ""}</td>
            <td class="col-subtexto">${producto.categoria ?? ""}</td>
            <td class="col-subtexto">${producto.subcategoria ?? ""}</td>
            <td class="col-descripcion">${producto.descripcion ?? ""}</td>
            <td class="stock ${claseStock}">${stockActual}</td>
            <td>${producto.proveedor ?? ""}</td>
            <td class="precio">${formatoMoneda(producto.precio_compra)}</td>
            <td class="precio">${formatoMoneda(producto.precio_venta)}</td>
            <td class="precio">${margenVisual}</td>
            <td>${producto.codigo_prov ?? ""}</td>
        </tr>
        `;

        htmlMovil += `
        <div class="prod-card" id="card-${producto.codigo}">
            <div class="card-descripcion">${producto.descripcion ?? "Sin descripción"}</div>
            <div class="card-codigo-badge">${producto.codigo ?? ""}</div>
            <div class="card-subtexto">${producto.categoria ?? ""} / ${producto.subcategoria ?? ""}</div>
            <div class="card-precio-venta">${formatoMoneda(producto.precio_venta)}</div>

            <div class="card-detalles-ocultos">
                <strong>Precio Compra:</strong> ${formatoMoneda(producto.precio_compra)}<br>
                <strong>Margen:</strong> ${margenVisual}<br>
                <strong>Proveedor:</strong> ${producto.proveedor ?? "---"}<br>
                <strong>Código Prov:</strong> ${producto.codigo_prov ?? "---"}
            </div>

            <div class="card-footer-movil">
                <div class="btn-container-movil">
                    <button class="btn-ver-mas" onclick="toggleDetalleCard('card-${producto.codigo}')">
                        <span class="btn-text">Más datos</span> <span class="btn-icon">▼</span>
                    </button>
                    <button class="btn-editar-movil" onclick="abrirModalEditar('${producto.codigo}')">✏️ Editar</button>
                </div>
                <div class="card-stock-text ${claseStock}">Stock: ${stockActual}</div>
            </div>
        </div>
        `;
    });

    if (tabla) tabla.innerHTML = htmlTabla;
    if (contenedorMovil) contenedorMovil.innerHTML = htmlMovil;
}


function abrirModalEditar(codigo) {
    const producto = productos.find(p => p.codigo === codigo);
    if (!producto) return;

    mCodigoActual = producto.codigo;
    mStockOriginal = Number(producto.stock ?? 0);
    mPrecioCompraOriginal = Number(producto.precio_compra ?? 0);
    mDescripcionOriginal = producto.descripcion ?? "";
    mPrecioVentaOriginal = Number(producto.precio_venta ?? 0);

    document.getElementById("lblCodigo").innerText = producto.codigo ?? "";
    document.getElementById("lblCategoria").innerText = producto.categoria ?? "";
    document.getElementById("lblSubcategoria").innerText = producto.subcategoria ?? "";

    document.getElementById("txtDescripcion").value = producto.descripcion ?? "";
    document.getElementById("txtProveedor").value = producto.proveedor ?? "";
    document.getElementById("txtCodigoProv").value = producto.codigo_prov ?? "";
    
    // Mostrar valores sin formato (los listeners los formatearán automáticamente)
    document.getElementById("txtPrecioCompra").value = String(mPrecioCompraOriginal);
    document.getElementById("txtPrecioVenta").value = String(mPrecioVentaOriginal);
    document.getElementById("txtStock").value = String(mStockOriginal);
    
    // Dispara los listeners para que formateen automáticamente
    document.getElementById("txtPrecioCompra").dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById("txtPrecioVenta").dispatchEvent(new Event('input', { bubbles: true }));
    
    actualizarMargenUI(); 

    document.getElementById("editModal").classList.add("visible"); 
}

function cerrarModal() {
    document.getElementById("editModal").classList.remove("visible");
    mCodigoActual = "";
}

function actualizarMargenUI() {
    const pv = document.getElementById("txtPrecioVenta").value;
    const pc = document.getElementById("txtPrecioCompra").value;
    const margen = calcularMargenThermoAir(pv, pc);
    document.getElementById("txtMargen").value = (margen * 100).toFixed(1) + "%";
}

// ============ LISTENERS EXACTOS COMO FACTURAS_COMPRAS.JS ============

// Precio Compra - Formato X.XXX.XXX (colombiano)
const txtPrecioCompraInput = document.getElementById("txtPrecioCompra");
if (txtPrecioCompraInput) {
    txtPrecioCompraInput.addEventListener('input', (e) => {
        // Extraer solo números
        let limpia = e.target.value.replace(/[^0-9]/g, "");
        
        if (limpia === "") {
            e.target.value = "0";
        } else {
            let valorNumerico = parseInt(limpia, 10) || 0;
            // Máscara: formato colombiano con puntos de miles
            e.target.value = valorNumerico.toLocaleString('es-CO');
        }
        
        actualizarMargenUI();
    });
}

// Precio Venta - Formato X.XXX.XXX (colombiano)
const txtPrecioVentaInput = document.getElementById("txtPrecioVenta");
if (txtPrecioVentaInput) {
    txtPrecioVentaInput.addEventListener('input', (e) => {
        // Extraer solo números
        let limpia = e.target.value.replace(/[^0-9]/g, "");
        
        if (limpia === "") {
            e.target.value = "0";
        } else {
            let valorNumerico = parseInt(limpia, 10) || 0;
            // Máscara: formato colombiano con puntos de miles
            e.target.value = valorNumerico.toLocaleString('es-CO');
        }
        
        actualizarMargenUI();
    });
}

// Stock - Permite decimales
const txtStockInput = document.getElementById("txtStock");
if (txtStockInput) {
    txtStockInput.addEventListener('input', (e) => {
        // Permitir solo números y UN punto decimal
        let limpia = e.target.value.replace(/[^0-9.]/g, "");
        let partes = limpia.split(".");
        
        if (partes.length > 2) {
            limpia = partes[0] + "." + partes[1];
        }
        
        if (limpia === "" || limpia === ".") {
            e.target.value = "0";
        } else {
            e.target.value = limpia;
        }
    });
}

document.getElementById("btnGuardar").addEventListener("click", async function () {
    if (!mCodigoActual) return;

    const btnGuardar = this;
    btnGuardar.disabled = true;
    btnGuardar.innerText = "Guardando...";

    const descripcion = document.getElementById("txtDescripcion").value.trim();
    const proveedor = document.getElementById("txtProveedor").value.trim();
    const codigoProv = document.getElementById("txtCodigoProv").value.trim();
    
    // Parsear valores que ahora son texto formateado (1.350.000)
    const precioCompraStr = document.getElementById("txtPrecioCompra").value.replace(/\./g, "");
    const precioVentaStr = document.getElementById("txtPrecioVenta").value.replace(/\./g, "");
    const stockStr = document.getElementById("txtStock").value.replace(/\./g, "");
    
    const precioCompra = parseFloat(precioCompraStr) || 0;
    const precioVenta = parseFloat(precioVentaStr) || 0;
    const stockNuevo = parseFloat(stockStr) || 0;

    const fechaActual = new Date().toISOString().split('T')[0];
    const horaActual = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    try {
        const updateData = {
            descripcion: descripcion,
            proveedor: proveedor,
            precio_venta: precioVenta,
            codigo_prov: codigoProv,
            stock: stockNuevo
        };

        if (precioCompra !== mPrecioCompraOriginal) {
            updateData.precio_compra = precioCompra;
            updateData.fecha_precio = fechaActual;
        }

        const { data: registroModificado, error: errProd } = await supabaseClient
            .from("productos")
            .update(updateData)
            .eq("codigo", mCodigoActual)
            .select();

        if (errProd) throw new Error(`Error en tabla 'productos': ${errProd.message}`);

        const productoEditado = registroModificado[0];

        // CONDICIONAL: Solo sincronizar con Siigo si cambió el nombre o el precio de venta
        if (productoEditado.codigo && (descripcion !== mDescripcionOriginal || precioVenta !== mPrecioVentaOriginal)) {
            btnGuardar.innerText = "Sincronizando con Siigo...";
            btnGuardar.disabled = true; 

            try {
                const respuestaSiigo = await fetch('https://vdlxmajvzdtbewchyowm.supabase.co/functions/v1/smart-endpoint', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        siigo_id: productoEditado.siigo_id || "", 
                        code: productoEditado.codigo,     
                        name: descripcion,                     
                        price: precioVenta                    
                    })
                });

                if (!respuestaSiigo.ok) {
                    const textoError = await respuestaSiigo.text();
                    throw new Error(`Servidor Supabase: ${respuestaSiigo.status} - ${textoError}`);
                }

                const resultadoSiigo = await respuestaSiigo.json();

                if (!resultadoSiigo.success) {
                    throw new Error(resultadoSiigo.error || "Error interno sin mensaje.");
                }

            } catch (errorSiigo) {
                console.error("Error de Siigo:", errorSiigo);
            } finally {
                btnGuardar.innerText = "Guardar Cambios";
                btnGuardar.disabled = false;
            }
        }

        // 2. Gestionar movimientos de bodega
        const diferenciaStock = stockNuevo - mStockOriginal;
        if (diferenciaStock !== 0) {
            const cantidadMovimiento = Math.abs(diferenciaStock);

            if (diferenciaStock < 0) {
                const { error: errSalida } = await supabaseClient
                    .from("salidas_bodega")
                    .insert([{
                        fecha: fechaActual,
                        codigo: mCodigoActual,
                        cantidad: cantidadMovimiento,
                        hora: horaActual,
                        recibe: "",
                        tipo: "A",
                        bus: ""
                    }]);
                if (errSalida) throw new Error(`Error en tabla 'salidas_bodega': ${errSalida.message}`);
            } else {
                const { error: errIngreso } = await supabaseClient
                    .from("ingresos_bodega")
                    .insert([{
                        fecha: fechaActual,
                        codigo: mCodigoActual,
                        cantidad: cantidadMovimiento,
                        hora: horaActual,
                        responsable: "",
                        tipo: "A"
                    }]);
                if (errIngreso) throw new Error(`Error en tabla 'ingresos_bodega': ${errIngreso.message}`);
            }
        }

        // 3. Gestionar Historial de Precios de Compra
        if (precioCompra !== mPrecioCompraOriginal) {
            const { error: errHistorial } = await supabaseClient
                .from("productos_compras")
                .insert([{
                    fecha: fechaActual,
                    codigo: mCodigoActual,
                    descripcion: descripcion,
                    precio_compra: precioCompra,
                    proveedor: proveedor,
                    codigo_proveedor: codigoProv,
                    estado: "MANUAL"
                }]);
            if (errHistorial) throw new Error(`Error en tabla 'productos_compras': ${errHistorial.message}`);
        }

        cerrarModal();
        await cargarProductos();

    } catch (error) {
        console.error("Error al procesar el guardado:", error);
        alert("Error: " + error.message);
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerText = "Guardar Cambios";
    }
});

document.getElementById("btnCerrarModal").addEventListener("click", cerrarModal);
document.getElementById("btnCancelar").addEventListener("click", cerrarModal);

function toggleDetalleCard(idCard) {
    const tarjetaActual = document.getElementById(idCard);
    if (!tarjetaActual) return;

    if (!tarjetaActual.classList.contains("abierta")) {
        document.querySelectorAll(".prod-card.abierta").forEach(card => {
            card.classList.remove("abierta");
            const boton = card.querySelector(".btn-ver-mas");
            if (boton) {
                boton.querySelector(".btn-text").innerText = "Más datos";
                boton.querySelector(".btn-icon").innerText = "▼";
            }
        });
    }

    tarjetaActual.classList.toggle("abierta");
    const botonActual = tarjetaActual.querySelector(".btn-ver-mas");

    if (botonActual) {
        if (tarjetaActual.classList.contains("abierta")) {
            botonActual.querySelector(".btn-text").innerText = "Menos datos";
            botonActual.querySelector(".btn-icon").innerText = "▲";
        } else {
            botonActual.querySelector(".btn-text").innerText = "Más datos";
            botonActual.querySelector(".btn-icon").innerText = "▼";
        }
    }
}

document.getElementById("txtBuscar").addEventListener("input", function () {
    clearTimeout(timeoutBusqueda);
    const texto = this.value.trim().toUpperCase();

    timeoutBusqueda = setTimeout(() => {
        if (texto === "") {
            renderizarProductos(productos);
            return;
        }

        const filtrados = productos.filter(p =>
            String(p.codigo ?? "").toUpperCase().includes(texto) ||
            String(p.categoria ?? "").toUpperCase().includes(texto) ||
            String(p.subcategoria ?? "").toUpperCase().includes(texto) ||
            String(p.descripcion ?? "").toUpperCase().includes(texto) ||
            String(p.proveedor ?? "").toUpperCase().includes(texto) ||
            String(p.codigo_prov ?? "").toUpperCase().includes(texto)
        );

        renderizarProductos(filtrados);
    }, 150);
});
// ===================== MÓDULO: AGREGAR PRODUCTO ======================
const TAMANOS_PULGADA = [
    { label: "5/16", codigo: "01" },
    { label: "13/32", codigo: "02" },
    { label: "1/2", codigo: "03" },
    { label: "5/8", codigo: "04" },
    { label: "7/8", codigo: "05" }
];

function requiereMedidaMetrica(subcategoriaNorm) {
    return subcategoriaNorm.includes("MANULI") || subcategoriaNorm.includes("TIPO PESADO");
}

function esCategoriaEspecial(categoriaNorm) {
    return categoriaNorm === "ACOPLE" || categoriaNorm === "FITTING";
}

let mAddCategoriaSeleccionada = "";
let mAddSubcategoriaSeleccionada = "";

async function cargarCatalogos() {
    const { data: cats, error: errCat } = await supabaseClient
        .from("categorias")
        .select("categoria, codigo");

    const { data: subs, error: errSub } = await supabaseClient
        .from("subcategorias")
        .select("categorias, subcategoria, codigo");

    if (errCat) console.error("Error cargando categorías:", errCat);
    if (errSub) console.error("Error cargando subcategorías:", errSub);

    categoriasCache = cats || [];
    subcategoriasCache = subs || [];

    // Categorías
    const inputCat = document.getElementById("addCategoria");
    if (inputCat) {
        const categoriasUnicas = [...new Set(categoriasCache.map(c => c.categoria))];
        inputCat.addEventListener("input", (e) => buscarCategoriasPredictivo(e.target.value, categoriasUnicas));
    }

    // Subcategorías - inicialmente deshabilitada
    const inputSub = document.getElementById("addSubcategoria");
    if (inputSub) {
        inputSub.disabled = true;
        inputSub.value = "";
    }
}

function buscarCategoriasPredictivo(busqueda, categoriasUnicas) {
    const divDropdown = document.getElementById('dropdownCategoria');
    if (!divDropdown) return;

    if (busqueda.length < 1) {
        divDropdown.style.display = 'none';
        return;
    }

    const filtradas = categoriasUnicas.filter(c => normalizarBusqueda(c).includes(normalizarBusqueda(busqueda)));

    divDropdown.innerHTML = '';
    if (filtradas.length === 0) {
        divDropdown.style.display = 'none';
        return;
    }

    divDropdown.style.display = 'block';

    filtradas.forEach(categoria => {
        const item = document.createElement('div');
        item.className = 'dropdown-item';
        item.textContent = categoria;
        item.addEventListener('click', () => {
            document.getElementById('addCategoria').value = categoria;
            divDropdown.style.display = 'none';
            actualizarSubcategoriasPredictivo(categoria);
            actualizarBloqueEspecial();
        });
        divDropdown.appendChild(item);
    });
}

function actualizarSubcategoriasPredictivo(categoria) {
    const inputSub = document.getElementById("addSubcategoria");
    if (!inputSub) return;

    const categoriaNorm = normalizarBusqueda(categoria);
    const subcategoriasValidas = subcategoriasCache
        .filter(s => normalizarBusqueda(s.categorias) === categoriaNorm)
        .map(s => s.subcategoria);
    
    subcategoriasValidas.push(categoria);
    const subcategoriasUnicas = [...new Set(subcategoriasValidas)].filter(s => s && s.trim() !== "");

    inputSub.disabled = false;
    inputSub.value = "";

    inputSub.addEventListener("input", (e) => {
        const divDropdown = document.getElementById('dropdownSubcategoria');
        if (!divDropdown) return;

        const busqueda = e.target.value;
        if (busqueda.length < 1) {
            divDropdown.style.display = 'none';
            return;
        }

        const filtradas = subcategoriasUnicas.filter(s => normalizarBusqueda(s).includes(normalizarBusqueda(busqueda)));

        divDropdown.innerHTML = '';
        if (filtradas.length === 0) {
            divDropdown.style.display = 'none';
            return;
        }

        divDropdown.style.display = 'block';

        filtradas.forEach(subcategoria => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            item.textContent = subcategoria;
            item.addEventListener('click', () => {
                document.getElementById('addSubcategoria').value = subcategoria;
                divDropdown.style.display = 'none';
                actualizarBloqueEspecial();
            });
            divDropdown.appendChild(item);
        });
    }, { once: false });
}

function obtenerCodigoCategoria(categoria) {
    const categoriaNorm = normalizarBusqueda(categoria);
    const fila = categoriasCache.find(c => normalizarBusqueda(c.categoria) === categoriaNorm);
    return fila ? String(fila.codigo).trim() : "";
}

function obtenerCodigoSubcategoria(categoria, subcategoria) {
    const categoriaNorm = normalizarBusqueda(categoria);
    const subNorm = normalizarBusqueda(subcategoria);
const fila = subcategoriasCache.find(s =>
        normalizarBusqueda(s.categorias) === categoriaNorm &&
        normalizarBusqueda(s.subcategoria) === subNorm
    );
    return fila ? String(fila.codigo).trim() : "";
}

function asegurarSelectorTamano() {
    if (document.getElementById("addTamanoPulgada")) return;

    const bloque = document.getElementById("bloqueMedidaConexion");
    if (!bloque) return;
    
    const grupoTamano = document.createElement("div");
    grupoTamano.className = "form-group";
    grupoTamano.id = "grupoTamanoPulgada";
    grupoTamano.innerHTML = `
        <label for="addTamanoPulgada">Tamaño (pulgada)</label>
        <select id="addTamanoPulgada" class="form-control">
            ${TAMANOS_PULGADA.map(t => `<option value="${t.codigo}">${t.label}" (${t.codigo})</option>`).join("")}
            <option value="__otro__">Otro (ingresar código manual)</option>
        </select>
        <input type="text" id="addTamanoManual" class="form-control" placeholder="Código de 2 dígitos, ej: 06" style="display:none; margin-top:8px;">
    `;
    bloque.parentNode.insertBefore(grupoTamano, bloque);

    document.getElementById("addTamanoPulgada").addEventListener("change", function () {
        const manual = document.getElementById("addTamanoManual");
        manual.style.display = this.value === "__otro__" ? "block" : "none";
        previsualizarCodigo();
    });
}

function quitarSelectorTamano() {
    const grupo = document.getElementById("grupoTamanoPulgada");
    if (grupo) grupo.remove();
}

function obtenerCodigoTamanoSeleccionado() {
    const select = document.getElementById("addTamanoPulgada");
    if (!select) return "";
    if (select.value === "__otro__") {
        return document.getElementById("addTamanoManual").value.trim().padStart(2, "0");
    }
    return select.value;
}

function actualizarBloqueEspecial() {
    const categoria = document.getElementById("addCategoria").value;
    const subcategoria = document.getElementById("addSubcategoria").value;
    const categoriaNorm = normalizarBusqueda(categoria);
    const subNorm = normalizarBusqueda(subcategoria);

    const bloque = document.getElementById("bloqueMedidaConexion");
    const hint = document.getElementById("hintCodigoEspecial");
    const addMedidaMetrica = document.getElementById("addMedidaMetrica");
    const grupoMedida = addMedidaMetrica ? addMedidaMetrica.parentElement : null;

    if (!bloque || !hint) return;

    if (esCategoriaEspecial(categoriaNorm) && subNorm !== "") {
        bloque.style.display = "flex";
        hint.style.display = "block";
        asegurarSelectorTamano();

        if (grupoMedida) {
            grupoMedida.style.display = requiereMedidaMetrica(subNorm) ? "block" : "none";
        }
    } else {
        bloque.style.display = "none";
        hint.style.display = "none";
        quitarSelectorTamano();
    }

    previsualizarCodigo();
}

document.getElementById("addMedidaMetrica").addEventListener("input", previsualizarCodigo);
document.getElementById("addTipoConexion").addEventListener("change", previsualizarCodigo);

function construirCodigoTentativo(categoria, subcategoria, itemNum) {
    const categoriaNorm = normalizarBusqueda(categoria);
    const subNorm = normalizarBusqueda(subcategoria);

    const codCat = obtenerCodigoCategoria(categoria);
    if (!codCat) return null;

    if (esCategoriaEspecial(categoriaNorm)) {
        const codSub = obtenerCodigoSubcategoria(categoria, subcategoria);
        const codTamano = obtenerCodigoTamanoSeleccionado();
        const conexion = document.getElementById("addTipoConexion").value;

        if (!codSub || !codTamano) return null;

        if (requiereMedidaMetrica(subNorm)) {
            const medida = document.getElementById("addMedidaMetrica").value.trim();
            if (!medida) return null;
            return `${codCat}${codTamano}${codSub}-${medida}${conexion}`;
        } else {
            return `${codCat}${codTamano}${codSub}-${conexion}`;
        }
    }

    const item = String(itemNum).padStart(2, "0");
    if (categoriaNorm === subNorm) {
        return `${codCat}${item}`;
    } else {
        const codSub = obtenerCodigoSubcategoria(categoria, subcategoria);
        if (!codSub) return null;
        return `${codCat}${item}${codSub}`;
    }
}

function previsualizarCodigo() {
    const hint = document.getElementById("hintCodigoEspecial");
    const categoria = document.getElementById("addCategoria").value;
    const subcategoria = document.getElementById("addSubcategoria").value;

    if (!hint) return;
    if (!categoria || !subcategoria) {
        hint.innerText = "";
        return;
    }

    const tentativo = construirCodigoTentativo(categoria, subcategoria, 1);
    if (tentativo) {
        hint.innerText = `Vista previa de código: ${tentativo} (el número de ítem se ajustará automáticamente para evitar duplicados)`;
    } else {
        hint.innerText = "Complete los campos para previsualizar el código.";
    }
}

async function generarCodigoFinal(categoria, subcategoria) {
    const categoriaNorm = normalizarBusqueda(categoria);

    if (esCategoriaEspecial(categoriaNorm)) {
        const codigo = construirCodigoTentativo(categoria, subcategoria, null);
        if (!codigo) throw new Error("Faltan datos para generar el código (tamaño, subcategoría o conexión).");

        const existe = await codigoYaExiste(codigo);
        if (existe) throw new Error(`El código ${codigo} ya existe. Verifique tamaño/medida/conexión.`);
        return codigo;
    }

    for (let item = 1; item <= 99; item++) {
        const codigo = construirCodigoTentativo(categoria, subcategoria, item);
        if (!codigo) throw new Error("Faltan datos para generar el código (revise categoría/subcategoría).");
        const existe = await codigoYaExiste(codigo);
        if (!existe) return codigo;
    }

    throw new Error("No hay números disponibles (01-99) para esta categoría/subcategoría.");
}

async function codigoYaExiste(codigo) {
    const { data, error } = await supabaseClient
        .from("productos")
        .select("codigo")
        .eq("codigo", codigo)
        .limit(1);

    if (error) {
        console.error("Error verificando duplicado:", error);
        throw error;
    }
    return data && data.length > 0;
}

function limpiarFormularioAgregar(parcial) {
    if (!parcial) {
        const inputCat = document.getElementById("addCategoria");
        if (inputCat) {
            inputCat.value = "";
            inputCat.disabled = false;
        }
const inputSub = document.getElementById("addSubcategoria");
        if (inputSub) {
            inputSub.value = "";
            inputSub.disabled = true;
            const menuSub = inputSub.parentElement.querySelector(".custom-dropdown-menu");
            if (menuSub) menuSub.style.display = "none";
        }
        const listaSubcategorias = document.getElementById("listaSubcategorias");
        if (listaSubcategorias) listaSubcategorias.innerHTML = "";
        actualizarBloqueEspecial();
    }
    document.getElementById("addDescripcion").value = "";
    document.getElementById("addProveedor").value = "";
    document.getElementById("addCodigoProv").value = "";
    document.getElementById("addPrecioCompra").value = "";
    document.getElementById("addPrecioVenta").value = "";
    document.getElementById("addStockInicial").value = "";
}

function abrirModalAgregar() {
    cargarCatalogos();
    limpiarFormularioAgregar(false);
    document.getElementById("addModal").classList.add("visible");
    document.getElementById("addCategoria").focus();
}

function cerrarModalAgregar() {
    document.getElementById("addModal").classList.remove("visible");
}

function limpiarPrecioTexto(valor) {
    let texto = String(valor ?? "").trim();
    if (texto === "") return 0;
    texto = texto.replace(/\$/g, "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
    const num = parseFloat(texto);
    return isNaN(num) ? 0 : num;
}

document.getElementById("btnAbrirAgregar").addEventListener("click", abrirModalAgregar);
document.getElementById("btnCerrarAddModal").addEventListener("click", cerrarModalAgregar);
document.getElementById("btnCancelarAdd").addEventListener("click", cerrarModalAgregar);

document.getElementById("btnGuardarAdd").addEventListener("click", async function () {
    const categoria = document.getElementById("addCategoria").value.trim();
    const subcategoria = document.getElementById("addSubcategoria").value.trim();
    const descripcion = document.getElementById("addDescripcion").value.trim();

    if (!categoria) { 
        mostrarToast("Seleccione o escriba la categoría."); 
        document.getElementById("addCategoria").focus(); 
        return; 
    }
    if (!subcategoria) { 
        mostrarToast("Seleccione o escriba la subcategoría."); 
        document.getElementById("addSubcategoria").focus(); 
        return; 
    }
    if (!descripcion) { 
        mostrarToast("Ingrese la descripción del producto."); 
        document.getElementById("addDescripcion").focus(); 
        return; 
    }

    const categoriaNorm = normalizarBusqueda(categoria);
    if (esCategoriaEspecial(categoriaNorm)) {
        const codTamano = obtenerCodigoTamanoSeleccionado();
        if (!codTamano) { 
            mostrarToast("Seleccione el tamaño (pulgada)."); 
            return; 
        }
        if (requiereMedidaMetrica(normalizarBusqueda(subcategoria))) {
            const medida = document.getElementById("addMedidaMetrica").value.trim();
            if (!medida) { 
                mostrarToast("Ingrese la medida métrica."); 
                document.getElementById("addMedidaMetrica").focus(); 
                return; 
            }
        }
    }

    // 1. VALIDACIÓN OBLIGATORIA DE PRECIO DE VENTA (Exigido por Siigo)
    const precioVenta = limpiarPrecioTexto(document.getElementById("addPrecioVenta").value);
    if (!precioVenta || precioVenta <= 0) {
        mostrarToast("El precio de venta es obligatorio y debe ser mayor a $0.");
        document.getElementById("addPrecioVenta").focus();
        return;
    }

    const precioCompra = limpiarPrecioTexto(document.getElementById("addPrecioCompra").value);
    const stockInicial = Number(document.getElementById("addStockInicial").value || 0);
    const proveedor = document.getElementById("addProveedor").value.trim();
    const codigoProv = document.getElementById("addCodigoProv").value.trim();
    const fechaActual = new Date().toISOString().split('T')[0];

    const btnGuardar = this;
    btnGuardar.disabled = true;

    try {
        const codigo = await generarCodigoFinal(categoria, subcategoria);

        // 2. PASO 1: SINCRONIZAR PRIMERO CON SIIGO
        btnGuardar.innerText = "Sincronizando con Siigo...";
        
        const respuestaSiigo = await fetch('https://vdlxmajvzdtbewchyowm.supabase.co/functions/v1/smart-endpoint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create', // Busca un inactivo en Siigo y lo recicla / crea
                code: codigo,     
                name: descripcion,                      
                price: precioVenta                    
            })
        });

        if (!respuestaSiigo.ok) {
            const textoError = await respuestaSiigo.text();
            throw new Error(`Error en servidor Siigo (${respuestaSiigo.status}): ${textoError}`);
        }

        const resultadoSiigo = await respuestaSiigo.json();

        if (!resultadoSiigo.success) {
            throw new Error(resultadoSiigo.error || "Siigo rechazó la creación del producto.");
        }

        const siigoId = resultadoSiigo.siigo_id || null;

        // 3. PASO 2: GUARDAR EN SUPABASE SOLO SI SIIGO FUE EXITOSO
        btnGuardar.innerText = "Guardando en base de datos...";

        const { error: errInsert } = await supabaseClient
            .from("productos")
            .insert([{
                codigo: codigo,
                categoria: categoria,
                subcategoria: subcategoria,
                descripcion: descripcion,
                proveedor: proveedor,
                codigo_prov: codigoProv,
                precio_compra: precioCompra,
                precio_venta: precioVenta,
                stock: stockInicial,
                fecha_precio: precioCompra > 0 ? fechaActual : null,
                siigo_id: siigoId
            }]);

        if (errInsert) {
            throw new Error(`Creado en Siigo (ID: ${siigoId}), pero falló en base de datos: ${errInsert.message}`);
        }

        await cargarProductos();
        mostrarResultado(codigo, descripcion);

        const mantenerVarios = document.getElementById("chkAgregarVarios").checked;
        if (mantenerVarios) {
            limpiarFormularioAgregar(true);
        }

    } catch (err) {
        console.error("Error en proceso de creación:", err);
        mostrarToast(err.message || "Error al procesar la solicitud.");
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerText = "Crear Producto";
    }
});

function mostrarToast(mensaje, tipo = "error") {
    // Definir o reusar el contenedor de toasts
    let contenedor = document.getElementById("toastContainer");
    if (!contenedor) {
        contenedor = document.createElement("div");
        contenedor.id = "toastContainer";
        // Estilos del contenedor fijo
        Object.assign(contenedor.style, {
            position: "fixed",
            bottom: "20px",
            right: "20px",
            zIndex: "99999",
            display: "flex",
            flexDirection: "column",
            gap: "10px"
        });
        document.body.appendChild(contenedor);
    }

    // Crear la tarjeta de notificación
    const toast = document.createElement("div");
    toast.innerText = mensaje;

    // Colores según el tipo
    const esError = tipo === "error";
    const bg = esError ? "#DC2626" : "#16A34A"; // Rojo para error, verde para éxito

    Object.assign(toast.style, {
        backgroundColor: bg,
        color: "#FFFFFF",
        padding: "12px 18px",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
        fontSize: "14px",
        fontWeight: "500",
        minWidth: "250px",
        maxWidth: "380px",
        opacity: "0",
        transform: "translateY(10px)",
        transition: "all 0.3s ease"
    });

    contenedor.appendChild(toast);

    // Animación de entrada
    requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
    });

    // Auto-eliminar después de 3.5 segundos
    setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(10px)";
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// ===================== MODAL RESULTADO =====================

function mostrarResultado(codigo, descripcion) {
    document.getElementById("resCodigo").innerText = codigo;
    document.getElementById("resDescripcion").innerText = descripcion;

    document.querySelectorAll(".btn-copiar").forEach(btn => {
        btn.classList.remove("copiado");
        btn.innerText = "Copiar";
    });

    cerrarModalAgregar();
    document.getElementById("resultModal").classList.add("active");
}

document.querySelectorAll(".btn-copiar").forEach(btn => {
    btn.addEventListener("click", async function () {
        const targetId = this.getAttribute("data-target");
        const texto = document.getElementById(targetId).innerText;
        try {
            await navigator.clipboard.writeText(texto);
            this.innerText = "✓ Copiado";
            this.classList.add("copiado");
            setTimeout(() => {
                this.innerText = "Copiar";
                this.classList.remove("copiado");
            }, 1500);
        } catch (e) {
            alert("No se pudo copiar automáticamente. Texto: " + texto);
        }
    });
});

document.getElementById("btnCerrarResultModal").addEventListener("click", function () {
    document.getElementById("resultModal").classList.remove("active");
});
document.getElementById("btnCerrarResultado").addEventListener("click", function () {
    document.getElementById("resultModal").classList.remove("active");
});
document.getElementById("btnAgregarOtro").addEventListener("click", function () {
    document.getElementById("resultModal").classList.remove("active");
    abrirModalAgregar();
});

document.addEventListener('click', e => {
    const divCat = document.getElementById('dropdownCategoria');
    const divSub = document.getElementById('dropdownSubcategoria');
    
    if (e.target.id !== 'addCategoria' && divCat) divCat.style.display = 'none';
    if (e.target.id !== 'addSubcategoria' && divSub) divSub.style.display = 'none';
});

cargarProductos();