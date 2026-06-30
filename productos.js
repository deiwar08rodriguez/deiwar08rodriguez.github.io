const SUPABASE_URL = "https://vdlxmajvzdtbewchyowm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let productos = [];
let categoriasCache = [];     // [{categoria, codigo}]
let subcategoriasCache = [];  // [{categorias, subcategorias, codigo}]
let timeoutBusqueda;

// Variables de estado del formulario de EDICIÓN
let mCodigoActual = "";
let mStockOriginal = 0;
let mPrecioCompraOriginal = 0;

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

    const pv = Number(String(precioVenta).replace(",", "."));
    const pc = Number(String(precioCompra).replace(",", "."));

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

// ===================== MODAL EDITAR =====================

function abrirModalEditar(codigo) {
    const producto = productos.find(p => p.codigo === codigo);
    if (!producto) return;

    mCodigoActual = producto.codigo;
    mStockOriginal = Number(producto.stock ?? 0);
    mPrecioCompraOriginal = Number(producto.precio_compra ?? 0);

    document.getElementById("lblCodigo").innerText = producto.codigo ?? "";
    document.getElementById("lblCategoria").innerText = producto.categoria ?? "";
    document.getElementById("lblSubcategoria").innerText = producto.subcategoria ?? "";

    document.getElementById("txtDescripcion").value = producto.descripcion ?? "";
    document.getElementById("txtProveedor").value = producto.proveedor ?? "";
    document.getElementById("txtCodigoProv").value = producto.codigo_prov ?? "";
    document.getElementById("txtPrecioCompra").value = producto.precio_compra ?? 0;
    document.getElementById("txtPrecioVenta").value = producto.precio_venta ?? 0;
    document.getElementById("txtStock").value = producto.stock ?? 0;

    actualizarMargenUI();

    document.getElementById("editModal").classList.add("active");
}

function cerrarModal() {
    document.getElementById("editModal").classList.remove("active");
    mCodigoActual = "";
}

function actualizarMargenUI() {
    const pv = document.getElementById("txtPrecioVenta").value;
    const pc = document.getElementById("txtPrecioCompra").value;
    const margen = calcularMargenThermoAir(pv, pc);
    document.getElementById("txtMargen").value = (margen * 100).toFixed(1) + "%";
}

document.getElementById("txtPrecioVenta").addEventListener("input", actualizarMargenUI);
document.getElementById("txtPrecioCompra").addEventListener("input", actualizarMargenUI);

document.getElementById("btnGuardar").addEventListener("click", async function () {
    if (!mCodigoActual) return;

    const btnGuardar = this;
    btnGuardar.disabled = true;
    btnGuardar.innerText = "Guardando...";

    const descripcion = document.getElementById("txtDescripcion").value.trim();
    const proveedor = document.getElementById("txtProveedor").value.trim();
    const codigoProv = document.getElementById("txtCodigoProv").value.trim();
    const precioCompra = Number(document.getElementById("txtPrecioCompra").value ?? 0);
    const precioVenta = Number(document.getElementById("txtPrecioVenta").value ?? 0);
    const stockNuevo = Number(document.getElementById("txtStock").value ?? 0);

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

// 1. Intentar actualizar el producto en Supabase (Verificando cambios reales)
        const { data: registroModificado, error: errProd } = await supabaseClient
            .from("productos")
            .update(updateData)
            .eq("codigo", mCodigoActual)
            .select(); // Esto obliga a Supabase a devolver el renglón editado

        if (errProd) throw new Error(`Error en tabla 'productos': ${errProd.message}`);
// =========================================================
        // 🛰️ CONEXIÓN AUTOMÁTICA CON LA API DE SIIGO (CON DETECTOR DE ERRORES)
        // =========================================================
        const productoEditado = registroModificado[0];

        if (productoEditado.siigo_id) {
            btnGuardar.innerText = "Sincronizando con Siigo...";
            try {
                const respuestaSiigo = await fetch('https://vdlxmajvzdtbewchyowm.supabase.co/functions/v1/smart-endpoint', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        siigo_id: productoEditado.siigo_id,
                        code: productoEditado.codigo,
                        name: descripcion, 
                        price: precioVenta 
                    })
                });

                // Si la función de Supabase responde un error de servidor (400, 500, etc.)
                if (!respuestaSiigo.ok) {
                    const textoError = await respuestaSiigo.text(); // Leemos el error crudo
                    throw new Error(`Servidor Supabase respondió: ${respuestaSiigo.status} - ${textoError}`);
                }

                const resultadoSiigo = await respuestaSiigo.json();

                if (!resultadoSiigo.success) {
                    throw new Error(resultadoSiigo.error || "Error interno sin mensaje.");
                }

                alert("✅ ¡Éxito! Guardado en Supabase y actualizado en Siigo.");

            } catch (errorSiigo) {
                // ESTA ALERTA AHORA SÍ TE VA A DECIR EL MOTIVO REAL
                console.error("Detalle del error de Siigo:", errorSiigo);
                alert("⚠️ Guardado en Supabase, pero falló Siigo.\n\nMOTIVO REAL DEL FALLO:\n" + errorSiigo.message);
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
                    categoria: document.getElementById("lblCategoria").innerText,
                    subcategoria: document.getElementById("lblSubcategoria").innerText,
                    descripcion: descripcion,
                    precio_compra: precioCompra,
                    proveedor: proveedor,
                    codigo_proveedor: codigoProv
                }]);
            if (errHistorial) throw new Error(`Error en tabla 'productos_compras': ${errHistorial.message}`);
        }

        cerrarModal();
        await cargarProductos();
        alert("Producto guardado exitosamente.");

    } catch (error) {
        console.error("Error al procesar el guardado:", error);
        alert(error.message || "Error desconocido al guardar los cambios.");
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

// =====================================================================
// ===================== MÓDULO: AGREGAR PRODUCTO ======================
// =====================================================================

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
        .select("CATEGORIA, CODIGO");

    const { data: subs, error: errSub } = await supabaseClient
        .from("subcategorias")
        .select("CATEGORIAS, SUBCATEGORIAS, CODIGO");

    if (errCat) console.error("Error cargando categorías:", errCat);
    if (errSub) console.error("Error cargando subcategorías:", errSub);

    categoriasCache = cats || [];
    subcategoriasCache = subs || [];

    // Cargar datalist de categorías original
    const listaCategorias = document.getElementById("listaCategorias");
    if (listaCategorias) {
        listaCategorias.innerHTML = "";
        const categoriasUnicas = [...new Set(categoriasCache.map(c => c.CATEGORIA))];
        categoriasUnicas.forEach(c => {
            const opt = document.createElement("option");
            opt.value = c;
            listaCategorias.appendChild(opt);
        });
    }

    // Forzar que el input de subcategoría empiece bloqueado y vacío
    const inputSub = document.getElementById("addSubcategoria");
    if (inputSub) {
        inputSub.disabled = true;
        inputSub.value = "";
    }
    const listaSubcategorias = document.getElementById("listaSubcategorias");
    if (listaSubcategorias) listaSubcategorias.innerHTML = "";
}

function actualizarSubcategoriasDatalist(categoria) {
    const listaSub = document.getElementById("listaSubcategorias");
    const inputSub = document.getElementById("addSubcategoria");
    if (listaSub) listaSub.innerHTML = "";

    const categoriaNorm = normalizarBusqueda(categoria);
    
    // Validar si la categoría escrita pertenece al caché válido
    const categoriaValida = categoriasCache.some(c => normalizarBusqueda(c.CATEGORIA) === categoriaNorm);

    if (!categoria || !categoriaValida) {
        if (inputSub) {
            inputSub.disabled = true;
            inputSub.value = ""; 
        }
        actualizarBloqueEspecial();
        return;
    }

    // Filtrar subcategorías correspondientes
    const subsFiltradas = subcategoriasCache
        .filter(s => normalizarBusqueda(s.CATEGORIAS) === categoriaNorm)
        .map(s => s.SUBCATEGORIAS);

    const subcategoriasUnicas = [...new Set(subsFiltradas)];

    if (listaSub) {
        subcategoriasUnicas.forEach(s => {
            const opt = document.createElement("option");
            opt.value = s;
            listaSub.appendChild(opt);
        });
    }

    // Si tiene subcategorías, habilitamos el input original
    if (inputSub) {
        inputSub.disabled = false;
    }
}

function obtenerCodigoCategoria(categoria) {
    const categoriaNorm = normalizarBusqueda(categoria);
    const fila = categoriasCache.find(c => normalizarBusqueda(c.CATEGORIA) === categoriaNorm);
    return fila ? String(fila.CODIGO).trim() : "";
}

function obtenerCodigoSubcategoria(categoria, subcategoria) {
    const categoriaNorm = normalizarBusqueda(categoria);
    const subNorm = normalizarBusqueda(subcategoria);
    const fila = subcategoriasCache.find(s =>
        normalizarBusqueda(s.CATEGORIAS) === categoriaNorm &&
        normalizarBusqueda(s.SUBCATEGORIAS) === subNorm
    );
    return fila ? String(fila.CODIGO).trim() : "";
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

// Escucha el input de categorías en tiempo real
document.getElementById("addCategoria").addEventListener("input", function () {
    actualizarSubcategoriasDatalist(this.value);
    actualizarBloqueEspecial();
});
document.getElementById("addSubcategoria").addEventListener("input", actualizarBloqueEspecial);
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
        document.getElementById("addCategoria").value = "";
        const inputSub = document.getElementById("addSubcategoria");
        if (inputSub) {
            inputSub.value = "";
            inputSub.disabled = true;
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
    document.getElementById("addModal").classList.add("active");
    document.getElementById("addCategoria").focus();
}

function cerrarModalAgregar() {
    document.getElementById("addModal").classList.remove("active");
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

    if (!categoria) { alert("Seleccione o escriba la categoría."); document.getElementById("addCategoria").focus(); return; }
    if (!subcategoria) { alert("Seleccione o escriba la subcategoría."); document.getElementById("addSubcategoria").focus(); return; }
    if (!descripcion) { alert("Ingrese la descripción."); document.getElementById("addDescripcion").focus(); return; }

    const categoriaNorm = normalizarBusqueda(categoria);
    if (esCategoriaEspecial(categoriaNorm)) {
        const codTamano = obtenerCodigoTamanoSeleccionado();
        if (!codTamano) { alert("Seleccione el tamaño (pulgada)."); return; }
        if (requiereMedidaMetrica(normalizarBusqueda(subcategoria))) {
            const medida = document.getElementById("addMedidaMetrica").value.trim();
            if (!medida) { alert("Ingrese la medida métrica."); document.getElementById("addMedidaMetrica").focus(); return; }
        }
    }

    const btnGuardar = this;
    btnGuardar.disabled = true;
    btnGuardar.innerText = "Creando...";

    try {
        const codigo = await generarCodigoFinal(categoria, subcategoria);

        const precioCompra = limpiarPrecioTexto(document.getElementById("addPrecioCompra").value);
        const precioVenta = limpiarPrecioTexto(document.getElementById("addPrecioVenta").value);
        const stockInicial = Number(document.getElementById("addStockInicial").value || 0);
        const proveedor = document.getElementById("addProveedor").value.trim();
        const codigoProv = document.getElementById("addCodigoProv").value.trim();
        const fechaActual = new Date().toISOString().split('T')[0];

        const { error } = await supabaseClient
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
                fecha_precio: precioCompra > 0 ? fechaActual : null
            }]);

        if (error) throw new Error(`Error insertando producto nuevo: ${error.message}`);

        await cargarProductos();

        mostrarResultado(codigo, descripcion);

        const mantenerVarios = document.getElementById("chkAgregarVarios").checked;
        if (mantenerVarios) {
            limpiarFormularioAgregar(true);
        }

    } catch (err) {
        console.error("Error creando producto:", err);
        alert("Error al crear el producto: " + err.message);
    } finally {
        btnGuardar.disabled = false;
        btnGuardar.innerText = "Crear Producto";
    }
});

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

// Inicialización de la App
cargarProductos();