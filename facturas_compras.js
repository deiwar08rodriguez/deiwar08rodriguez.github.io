const _supabaseUrl = "https://vdlxmajvzdtbewchyowm.supabase.co";
const _supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM";
const supabaseClient = supabase.createClient(_supabaseUrl, _supabaseKey);

const GEMINI_API_KEY = "AQ.Ab8RN6Ji4Fv4g2m_zGByTvDSuvIrkvXI1R-Fq1-hDmVMQcLJkw"; 
const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=" + GEMINI_API_KEY;

// --- ESTADOS GLOBALES ---
let dbProductos = []; 
let lineasFactura = [];     
let filaSeleccionada = -1;  
let archivoPDFSeleccionado = null; 

// Configuración avanzada de enrutamiento para Siigo (Valores por defecto)
let configAvanzadaSiigo = {
    sincronizarSiigo: true,
    actualizarPreciosSiigo: true,
    tipoComprobante: "FC-1",
    formaPago: "credito-30",
    observaciones: ""
};

// --- DICCIONARIO DE PROMPTS ESPECIALIZADOS (ARQUITECTURA MULTI-PROMPT) ---
const PROMPTS_POR_SOFTWARE = {
WORLD_OFFICE: `
    Analiza este texto colapsado de una factura de World Office.
    Sigue estas reglas ultra-estrictas basadas en sus mañas de exportación visual:
    
    1. PROVEEDOR (EMISOR): El nombre legal del emisor no está explícito en formato texto (es un logo). Busca el correo electrónico que NO sea de ThermoAir (el de ThermoAir es thermoair2008@hotmail.com). Encontrarás "surtifriodecolombia@gmail.com". Como regla de negocio para World Office, si el emisor tiene ese correo, el proveedor mapeado obligatoriamente DEBE ser: "SURTIFRÍO DE COLOMBIA S.A.S".
    2. NÚMERO DE FACTURA (id_factura): Debido al colapso de tablas de World Office, el consecutivo real de la factura queda flotando aislado arriba de la palabra "DIRECCIÓN" o "TELÉFONO". En este texto exacto es el número "41424".
       - REGLA DE EXCLUSIÓN CRÍTICA: Ignora completamente "3230832" (está amarrado abajo de CLIENTE). Ignora "35075" y "100000" (son rangos informativos de la resolución de la DIAN). Extrae el entero aislado y corto de la factura (41424).
    3. FECHA DE EMISIÓN: Busca el valor numérico de fecha que acompaña al texto "FECHA FACTURA" o "Expedición:". Viene como "26/06/2026". Conviértelo estrictamente a formato ISO YYYY-MM-DD (ej: "2026-06-26").
    4. MONEDAS Y VALORES DE TOTALES: Localiza las etiquetas "IVA" (ej. IVA 203.571) y "TOTAL FACTURA" (ej. 1.275.000). Extráelos omitiendo puntos de miles y guárdalos como enteros puros en las propiedades globales "iva" y "total".
    5. DETALLE DE ÍTEMS: Extrae los valores numéricos de las filas de productos (ej: "193.277" y "16.387") tal y como aparecen, convirtiéndolos estrictamente a enteros puros correspondientes a la base de costo antes de IVA (193277 y 16387) en la propiedad 'costo_unitario'. No intentes realizar operaciones aritméticas sobre ellos.
    
    Responde ÚNICAMENTE con el objeto JSON estructurado según el esquema. Sin explicaciones ni marcas Markdown.
    `,

    SIIGO: `
    Analiza este texto de una factura de venta electrónica colombiana generado por SIIGO.
    Extrae la información normalizando los nombres del emisor, omitiendo resoluciones de la DIAN y capturando el consecutivo corto de la factura.
    Conviértela estrictamente a formato ISO YYYY-MM-DD (ej: "2026-06-26").
    Convierte cualquier formato de moneda con puntos de miles a enteros estrictos.
    
    Responde ÚNICAMENTE con el objeto JSON estructurado según el esquema. Sin explicaciones ni marcas Markdown.
    `,

    GENERAL: `
    Analiza el texto de una factura de compra electrónica colombiana cuyo formato de lectura visual fue colapsado en texto plano.
    Sigue estas directrices lógicas estándar para mapear los datos:
    
    1. PROVEEDOR (EMISOR): Busca correos electrónicos. Si pertenece al comprador conocido (thermoair2008@hotmail.com), descártalo. El proveedor es el dueño del OTRO correo expuesto. Extrae su nombre comercial.
    2. NÚMERO DE FACTURA (id_factura): Busca un consecutivo puro y corto (generalmente de 3 a 6 dígitos). Ignora números de resolución DIAN larguísimos e ignora números pegados inmediatamente abajo de la etiqueta "CLIENTE" o "NIT".
    3. FECHA DE EMISIÓN: Identifica la fecha del documento y formátela estrictamente en estándar ISO YYYY-MM-DD.
    4. MONEDAS Y VALORES: Convierte formatos con puntos de miles a enteros estrictos (ej. 193.277 -> 193277).
    
    Responde ÚNICAMENTE con el objeto JSON estructurado según el esquema. Sin explicaciones ni marcas Markdown.
    `
};

const esquemaFacturaJSON = {
    type: "object",
    properties: {
        proveedor: { type: "string" },
        id_factura: { type: "string" },
        fecha: { type: "string", description: "Formato estricto YYYY-MM-DD" },
        iva: { type: "integer" },
        total: { type: "integer" },
        items: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    codigo_proveedor: { type: "string" },
                    descripcion: { type: "string" },
                    cantidad: { type: "integer" },
                    costo_unitario: { type: "integer" }
                },
                required: ["codigo_proveedor", "descripcion", "cantidad", "costo_unitario"]
            }
        }
    },
    required: ["proveedor", "id_factura", "fecha", "iva", "total", "items"]
};

// --- FUNCIÓN ENRUTADORA LÓGICA DE PROMPTS ---
function obtenerPromptEspecializado(textoPDF) {
    const textoUpper = textoPDF.toUpperCase();
    
    if (textoUpper.includes("WORLD OFFICE") || textoUpper.includes("WORLDOFFICE")) {
        console.log("¡Huella digital detectada: Aplicando Prompt Especialista en World Office!");
        return PROMPTS_POR_SOFTWARE.WORLD_OFFICE;
    }
    
    if (textoUpper.includes("SIIGO")) {
        console.log("¡Huella digital detectada: Aplicando Prompt Especialista en Siigo!");
        return PROMPTS_POR_SOFTWARE.SIIGO;
    }
    
    console.log("No se detectó software conocido. Aplicando Prompt General.");
    return PROMPTS_POR_SOFTWARE.GENERAL;
}

// --- FUNCIÓN AUXILIAR DE LIMPIEZA Y SOPORTE DE FECHAS EN FRONTEND ---
function normalizarFechaISO(fechaStr) {
    if (!fechaStr) return "";
    let limpia = fechaStr.trim();
    
    // Si ya viene formateada correctamente YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(limpia)) return limpia;
    
    // Si viene en formato DD/MM/YYYY o DD-MM-YYYY
    const matchDiagonal = limpia.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})$/);
    if (matchDiagonal) {
        return `${matchDiagonal[3]}-${matchDiagonal[2]}-${matchDiagonal[1]}`;
    }
    return "";
}

// 1. INICIALIZACIÓN Y CARGA DE HISTORIAL

document.addEventListener("DOMContentLoaded", async () => {
    configurarEventosUI(); 
    await cargarProductosMaestros();
    await cargarHistorialFacturas();
});

async function cargarProductosMaestros() {
    const { data, error } = await supabaseClient
        .from('productos')
        .select('row_id, codigo, descripcion, precio_compra, precio_venta');
    
    if (!error) {
        dbProductos = data;
        console.log("Productos maestros cargados con éxito:", dbProductos.length);
    } else {
        console.error("Error cargando productos maestros:", error);
    }
}

async function cargarHistorialFacturas() {
    const tbody = document.getElementById('tablaBody');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">Cargando historial...</td></tr>';

    const { data, error } = await supabaseClient
        .from('facturas_compra')
        .select('id_factura, proveedor, fecha, iva, total, documento_origen')
        .order('fecha', { ascending: false });

    if (error) {
        console.error("Error al cargar historial desde Supabase:", error);
        showToast("Error al cargar historial.", true);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#dc2626; padding:20px;">Error al cargar datos.</td></tr>';
        return;
    }

    tbody.innerHTML = "";
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#94a3b8; padding:20px;">No hay facturas registradas.</td></tr>';
        return;
    }

    data.forEach(fac => {
        const tr = document.createElement('tr');
        
        const linkPdf = fac.documento_origen 
            ? `<a href="${supabaseClient.storage.from('facturas_compra').getPublicUrl(fac.documento_origen).data.publicUrl}" target="_blank" style="color:#0284c7; text-decoration:underline; font-weight:500;">Ver PDF</a>` 
            : `<span>-</span>`;

        const totalNum = parseFloat(fac.total) || 0;
        const ivaNum = parseFloat(fac.iva) || 0;

        tr.innerHTML = `
            <td style="font-weight:bold;">${fac.id_factura}</td>
            <td>${fac.proveedor}</td>
            <td>${fac.fecha || '-'}</td>
            <td style="text-align:center;">${linkPdf}</td>
            <td>${formatoMoneda(totalNum - ivaNum)}</td>
            <td>${formatoMoneda(ivaNum)}</td>
            <td style="font-weight:bold;">${formatoMoneda(totalNum)}</td>
        `;
        tbody.appendChild(tr);
    });
}
// 2. PARSEO LOCAL Y PROCESAMIENTO AUTOMÁTICO (IA ENRUTADA)
function configurarEventosUI() {
    const btnNuevaFactura = document.getElementById('btnNuevaFactura');
    if (btnNuevaFactura) {
        btnNuevaFactura.addEventListener('click', () => {
            lineasFactura = [];
            archivoPDFSeleccionado = null; 
            document.getElementById('inputProveedor').value = "";
            document.getElementById('inputIdFac').value = "";
            document.getElementById('inputFecha').value = "";
            document.getElementById('resumenTotal').textContent = "$0";
            document.getElementById('resumenIva').textContent = "$0";
            renderizarMiniTabla();
            abrirHojaSheet(); 
        });
    }

const overlaySheet = document.getElementById('overlaySheet');
    const sheetHandle = document.getElementById('sheetHandle');
    if (overlaySheet) overlaySheet.addEventListener('click', cerrarHojaSheet);
    if (sheetHandle) sheetHandle.addEventListener('click', cerrarHojaSheet);

    // NUEVO: Listener para abrir el menú avanzado de Siigo desde el botón de la interfaz
    const btnMenuAvanzado = document.getElementById('btnMenuAvanzado');
    if (btnMenuAvanzado) {
        btnMenuAvanzado.addEventListener('click', (e) => {
            e.stopPropagation(); // Evitar colisiones de eventos en el DOM
            abrirMenuAvanzadoSiigo();
        });
    }

    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
            if (!e.target.files.length) return;
            archivoPDFSeleccionado = e.target.files[0]; 
            
            const statusBox = document.getElementById('statusBox');
            const statusText = document.getElementById('statusText');
            statusBox.style.display = 'flex';
            statusText.textContent = "Analizando PDF localmente...";

            try {
                const textoPDF = await extraerTextoPDF(archivoPDFSeleccionado);
                
                const promptAdecuado = obtenerPromptEspecializado(textoPDF);
                statusText.textContent = "Extrayendo estructura con IA enrutada...";
                
                const response = await fetch(GEMINI_URL, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        contents: [{ parts: [{ text: `${promptAdecuado}\n\nDOCUMENTO A PROCESAR:\n${textoPDF}` }] }],
                        generationConfig: {
                            responseMimeType: "application/json",
                            responseSchema: esquemaFacturaJSON,
                            temperature: 0
                        }
                    })
                });
                
                if (!response.ok) {
                    if (response.status === 429) {
                        throw new Error("Límite de peticiones de IA excedido. Por favor, espera 1 minuto antes de reintentar.");
                    }
                    throw new Error(`Error en el servidor Gemini API (Código ${response.status})`);
                }

const resData = await response.json();
                const jsonTexto = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
                if (!jsonTexto) {
                    throw new Error("La IA no devolvió una estructura JSON válida.");
                }

                const facturaIA = JSON.parse(jsonTexto);

                // Soporte estricto de fechas contra roturas de formato visual en inputs de tipo date
                const fechaNormalizada = normalizarFechaISO(facturaIA.fecha);

                // Verificación y cálculo exacto del factor de IVA por JS
                const totalFactura = parseFloat(facturaIA.total) || 0;
                const totalIva = parseFloat(facturaIA.iva) || 0;
                const subtotalFactura = totalFactura - totalIva;
                const factorIva = subtotalFactura > 0 ? (totalFactura / subtotalFactura) : 1;

                document.getElementById('inputProveedor').value = facturaIA.proveedor;
                document.getElementById('inputIdFac').value = facturaIA.id_factura;
                document.getElementById('inputFecha').value = fechaNormalizada;
                document.getElementById('resumenIva').textContent = formatoMoneda(totalIva);
                document.getElementById('resumenTotal').textContent = formatoMoneda(totalFactura);

lineasFactura = facturaIA.items.map(item => {
                    const match = dbProductos.find(p => p.codigo === item.codigo_proveedor);
                    let regularPrecios = { sugerido: 0, final: 0, margen: 0 };
                    
                    const costoBaseIA = parseFloat(item.costo_unitario) || 0;
                    const costoRealConIva = Math.round(costoBaseIA * factorIva);
                    
                    let costoAnteriorNum = 0;
                    let precioActualNum = 0;

                    if (match) {
                        costoAnteriorNum = parseFloat(match.precio_compra) || 0;
                        precioActualNum = parseFloat(match.precio_venta) || 0;
                        regularPrecios = ejecutarAlgoritmoFinanciero(costoRealConIva, costoAnteriorNum, precioActualNum);
                    } else {
                        regularPrecios.sugerido = 0;
                        regularPrecios.final = 0; 
                        regularPrecios.margen = 0;
                    }

                    // Cálculo matemático estricto de la tasa de variación de costos para auditoría visual
                    let variacionCosto = 0;
                    if (costoAnteriorNum > 0) {
                        variacionCosto = (costoRealConIva - costoAnteriorNum) / costoAnteriorNum;
                    }

                    return {
                        id_producto: match ? match.row_id : null,
                        codigo_interno: match ? match.codigo : "PENDIENTE",
                        descripcion_original: `[PROV: ${item.codigo_proveedor}] ${item.descripcion}`,
                        descripcion: match ? match.descripcion : "",
                        cantidad: item.cantidad || 1,
                        costo: costoRealConIva,
                        costo_anterior: costoAnteriorNum,
                        precio_actual: precioActualNum,
                        variacion_costo: variacionCosto,
                        precio_sugerido: regularPrecios.sugerido,
                        precio_final: regularPrecios.final,
                        margen: regularPrecios.margen,
                        requiere_homologacion: match ? false : true
                    };
                });

renderizarMiniTabla();
                statusBox.style.display = 'none';

                // Modificación restrictiva: Se elimina el foco automático en la fila 0
                filaSeleccionada = -1;
                if (typeof limpiarCamposEditor === "function") {
                    limpiarCamposEditor();
                } else {
                    document.getElementById('inputProducto').value = "";
                    document.getElementById('inputProductoInterno').value = "";
                    if (document.getElementById('inputCosto')) document.getElementById('inputCosto').value = "$0";
                    if (document.getElementById('txtPrecioSugerido')) document.getElementById('txtPrecioSugerido').value = "$0";
                    if (document.getElementById('txtPrecioFinal')) document.getElementById('txtPrecioFinal').value = "$0";
                    if (document.getElementById('txtMargen')) document.getElementById('txtMargen').value = "%0";
                }

            } catch (err) {
                console.error(err);
                statusBox.style.display = 'none';
                showToast(err.message || "No se pudo procesar de forma automática.", true);
            }
        });
    }
}

function extraerTextoPDF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function() {
            try {
                const typedarray = new Uint8Array(this.result);
                const pdf = await pdfjsLib.getDocument(typedarray).promise;
                let textoCompleto = "";
                for (let i = 1; i <= pdf.numPages; i++) {
                    const page = await pdf.getPage(i);
                    const textContent = await page.getTextContent();
                    textoCompleto += textContent.items.map(item => item.str).join(" ") + "\n";
                }
                resolve(textoCompleto.trim());
            } catch (e) { reject(e); }
        };
        reader.readAsArrayBuffer(file);
    });
}

// =========================================================================
// 3. RENDERIZADO Y BLOQUEO DE SEGURIDAD
// =========================================================================

function renderizarMiniTabla() {
    const tbody = document.getElementById('miniTablaBody');
    if (!tbody) return;
    tbody.innerHTML = "";
    
    let tieneErrores = false;
    let acumuladoTotal = 0;

    if (lineasFactura.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:#94a3b8; padding:15px;">Ningún ítem cargado.</td></tr>';
        document.getElementById('btnConfirmar').disabled = true;
if (document.getElementById('btnMenuAvanzado')) document.getElementById('btnMenuAvanzado').disabled = true;
        return;
    }

lineasFactura.forEach((linea, index) => {
        acumuladoTotal += Math.round(linea.costo * linea.cantidad);
        const tr = document.createElement('tr');
        tr.style.cursor = "pointer";
        tr.onclick = () => seleccionarFilaDetalle(index);

        if (linea.requiere_homologacion) {
            tr.classList.add('fila-pendiente');
            tieneErrores = true;
        }

const varCostoEntero = Math.round(linea.variacion_costo * 100);
        let badgeVar = `<span class="badge-variacion badge-neutro">0%</span>`;
        if (linea.costo_anterior > 0) {
            if (varCostoEntero > 0) {
                badgeVar = `<span class="badge-variacion badge-alza">+${varCostoEntero}%</span>`;
            } else if (varCostoEntero < 0) {
                badgeVar = `<span class="badge-variacion badge-baja">${varCostoEntero}%</span>`;
            }
        } else {
            badgeVar = `<span class="badge-variacion badge-neutro">N/A</span>`;
        }

tr.innerHTML = `
            <td style="font-weight:bold;">${linea.codigo_interno}</td>
            <td title="${linea.descripcion || linea.descripcion_original}">${linea.descripcion || linea.descripcion_original}</td>
            <td style="text-align:center; font-weight:500;">${linea.cantidad}</td>
            <td style="text-align:right;">${formatoMoneda(linea.costo)}</td>
            <td style="text-align:right; font-weight:bold; color:#10b981;">${formatoMoneda(linea.precio_final)}</td>
            <td style="text-align:center; font-weight:bold; color:#284B87;">${Math.round(linea.margen * 100)}%</td>
        `;
        tbody.appendChild(tr);
    });

    const alerta = document.getElementById('alertaHomologar');
    const btnConfirmar = document.getElementById('btnConfirmar');
    
if (alerta) alerta.style.display = tieneErrores ? 'block' : 'none';
    if (btnConfirmar) btnConfirmar.disabled = tieneErrores;

    const btnAvanzado = document.getElementById('btnMenuAvanzado');
    if (btnAvanzado) btnAvanzado.disabled = false;

    if (document.getElementById('resumenTotal').textContent === "$0") {
        document.getElementById('resumenTotal').textContent = formatoMoneda(acumuladoTotal);
    }
}

function seleccionarFilaDetalle(index) {
    filaSeleccionada = index;
    const item = lineasFactura[index];
    
    document.getElementById('inputProducto').value = item.descripcion_original || item.descripcion;
    document.getElementById('inputProductoInterno').value = item.id_producto ? `[${item.codigo_interno}] ${item.descripcion}` : "";
    
    const inputCosto = document.getElementById('inputCosto');
    const txtPrecioSugerido = document.getElementById('txtPrecioSugerido');
    const txtPrecioFinal = document.getElementById('txtPrecioFinal');
    const txtMargen = document.getElementById('txtMargen');

    if (inputCosto) inputCosto.value = maskPrecio(item.costo);
    if (txtPrecioSugerido) txtPrecioSugerido.value = maskPrecio(item.precio_sugerido);
    if (txtPrecioFinal) txtPrecioFinal.value = maskPrecio(item.precio_final);
    if (txtMargen) txtMargen.value = maskMargen(Math.round(item.margen * 100));
    
    // Actualización estricta del panel de auditoría de costos operacional
    const txtAudCostoAnt = document.getElementById('txtAuditoriaCostoAnterior');
    const txtAudCostoNue = document.getElementById('txtAuditoriaCostoNuevo');
    const txtAudVar = document.getElementById('txtAuditoriaVariacion');
    const txtAudPrecioAct = document.getElementById('txtAuditoriaPrecioActual');

    if (txtAudCostoAnt) txtAudCostoAnt.value = maskPrecio(item.costo_anterior || 0);
    if (txtAudCostoNue) txtAudCostoNue.value = maskPrecio(item.costo || 0);
    if (txtAudPrecioAct) txtAudPrecioAct.value = maskPrecio(item.precio_actual || 0);
    
    if (txtAudVar) {
        const varEntero = Math.round((item.variacion_costo || 0) * 100);
        txtAudVar.value = (item.costo_anterior > 0) ? (varEntero > 0 ? `+${varEntero}%` : `${varEntero}%`) : "N/A";
        
        // Estilización de color condicional según comportamiento inflacionario
        txtAudVar.style.color = varEntero > 0 ? "#b91c1c" : (varEntero < 0 ? "#15803d" : "#475569");
    }

    document.getElementById('inputProductoInterno').focus();
}

// =========================================================================
// 4. BUSCADOR INTERACTIVO PARA HOMOLOGAR
// =========================================================================

const inputProductoInterno = document.getElementById('inputProductoInterno');
const dropdown = document.getElementById('dropdownProductos');

if (inputProductoInterno && dropdown) {
    inputProductoInterno.addEventListener('input', (e) => {
        const filtro = e.target.value.toLowerCase().trim();
        dropdown.innerHTML = "";

        if (!filtro) { dropdown.style.display = 'none'; return; }

        const filtrados = dbProductos.filter(p => 
            (p.codigo && p.codigo.toLowerCase().includes(filtro)) || 
            (p.descripcion && p.descripcion.toLowerCase().includes(filtro))
        ).slice(0, 5);

        if (filtrados.length === 0) { dropdown.style.display = 'none'; return; }

filtrados.forEach(prod => {
            const div = document.createElement('div');
            div.className = 'dropdown-item';
            div.textContent = `[${prod.codigo || 'S/C'}] ${prod.descripcion}`;
            div.onclick = () => {
                if (dropdown) dropdown.style.display = 'none';
                document.getElementById('inputProductoInterno').value = `[${prod.codigo || 'PENDIENTE'}] ${prod.descripcion}`;
                
                const costoAnteriorNum = parseFloat(prod.precio_compra) || 0;
                const precioActualNum = parseFloat(prod.precio_venta) || 0;
                if (document.getElementById('txtAuditoriaCostoAnterior')) {
                    document.getElementById('txtAuditoriaCostoAnterior').value = maskPrecio(costoAnteriorNum);
                }
                if (document.getElementById('txtAuditoriaPrecioActual')) {
                    document.getElementById('txtAuditoriaPrecioActual').value = maskPrecio(precioActualNum);
                }

                const txtAudCostoNue = document.getElementById('txtAuditoriaCostoNuevo');
                const txtAudVar = document.getElementById('txtAuditoriaVariacion');
                if (txtAudCostoNue && txtAudVar) {
                    const costoNuevoNum = limpiarValorMonedaAFloat(txtAudCostoNue.value);
                    if (costoAnteriorNum > 0) {
                        const varEntero = Math.round(((costoNuevoNum - costoAnteriorNum) / costoAnteriorNum) * 100);
                        txtAudVar.value = varEntero > 0 ? `+${varEntero}%` : `${varEntero}%`;
                        txtAudVar.style.color = varEntero > 0 ? "#b91c1c" : (varEntero < 0 ? "#15803d" : "#475569");
                    } else {
                        txtAudVar.value = "N/A";
                        txtAudVar.style.color = "#475569";
                    }
                }
                // Vincular la selección del dropdown para que ejecute la homologación interna en la fila
                aplicarHomologacionAFila(prod);
            };
            dropdown.appendChild(div);
        });
        dropdown.style.display = 'block';
    });
}

function aplicarHomologacionAFila(prod) {
    if (dropdown) dropdown.style.display = 'none';
    
    if (filaSeleccionada > -1) {
        const item = lineasFactura[filaSeleccionada];
        
        // Capturar lo que el usuario ya tiene digitado visualmente en los inputs antes de sobreescribir
        const precioFinalDigitado = limpiarValorMonedaAFloat(document.getElementById('txtPrecioFinal').value);
        const precioSugeridoDigitado = limpiarValorMonedaAFloat(document.getElementById('txtPrecioSugerido').value);
        
        let precioFinalEfectivo = precioFinalDigitado;
        let precioSugeridoEfectivo = precioSugeridoDigitado;
        let margenEfectivo = item.margen;

const costoAnteriorNum = parseFloat(prod.precio_compra) || 0;
        const precioActualNum = parseFloat(prod.precio_venta) || 0;
        
        let variacionCosto = 0;
        if (costoAnteriorNum > 0) {
            variacionCosto = (item.costo - costoAnteriorNum) / costoAnteriorNum;
        }

        if (precioFinalDigitado === 0) {
            const calculos = ejecutarAlgoritmoFinanciero(item.costo, costoAnteriorNum, precioActualNum);
            precioSugeridoEfectivo = calculos.sugerido;
            precioFinalEfectivo = calculos.final;
            margenEfectivo = calculos.margen;
        } else {
            if (item.costo > 0) {
                margenEfectivo = ((precioFinalDigitado * 0.9) / item.costo) - 1;
            }
        }
        
        lineasFactura[filaSeleccionada] = {
            ...item,
            id_producto: prod.row_id,
            codigo_interno: prod.codigo,
            descripcion: prod.descripcion,
            costo_anterior: costoAnteriorNum,
            precio_actual: precioActualNum,
            variacion_costo: variacionCosto,
            precio_sugerido: precioSugeridoEfectivo,
            precio_final: precioFinalEfectivo,
            margen: margenEfectivo,
            requiere_homologacion: false
        };
        
        limpiarCamposEditor();
        renderizarMiniTabla();
    }
}
// 5. EDICIÓN EN TIEMPO REAL CON MÁSCARAS ESTRICTAS CONTRA BORRADOS
function maskPrecio(val) {
    let limpia = String(val).replace(/[^0-9]/g, "");
    if (!limpia || limpia === "0") return "$0";
    return "$" + parseInt(limpia, 10).toLocaleString('es-CO');
}

function maskPrecioDecimal(val) {
    let str = String(val).replace(/\./g, ',');
    let partes = str.split(',');
    let entero = partes[0].replace(/[^0-9]/g, "");
    
    if (!entero || entero === "0") entero = "0";
    let formateado = "$" + parseInt(entero, 10).toLocaleString('es-CO');
    
    if (partes.length > 1) {
        let decimal = partes[1].replace(/[^0-9]/g, "").substring(0, 2);
        return formateado + "," + decimal;
    }
    return formateado;
}

function maskMargen(val) {
    // Soporte explícito de caracteres numéricos y el signo negativo para auditorías visuales precisas
    let esNegativo = String(val).includes('-');
    let limpia = String(val).replace(/[^0-9]/g, "");
    if (!limpia || limpia === "0") return "%0";
    return (esNegativo ? "-%" : "%") + parseInt(limpia, 10);
}

function limpiarValorMonedaAFloat(texto) {
    let limpio = texto.replace(/\./g, "").replace(/,/g, ".").replace(/[^0-9.]/g, "");
    return parseFloat(limpio) || 0;
}

function agregarLineaManual() {
    // Seguridad absoluta: Si no hay una fila previamente seleccionada del PDF, se bloquea la operación
    if (filaSeleccionada < 0) {
        showToast("No se pueden añadir productos nuevos a la factura. Seleccione un ítem existente para editar.", true);
        return;
    }

    const descInterna = inputProductoInterno.value.trim();
    const costo = limpiarValorMonedaAFloat(document.getElementById('inputCosto').value);
    const pFinal = limpiarValorMonedaAFloat(document.getElementById('txtPrecioFinal').value);
    const pSugerido = limpiarValorMonedaAFloat(document.getElementById('txtPrecioSugerido').value);

    const txtMargenElement = document.getElementById('txtMargen');
    const margenDigitado = txtMargenElement ? (parseFloat(txtMargenElement.value.replace(/[^0-9]/g, "")) / 100) || 0 : 0;

    if (!descInterna || costo <= 0 || pFinal <= 0) {
        showToast("Por favor complete la homologación y los valores financieros del ítem seleccionado.", true);
        return;
    }

// Extraer limpiamente el código entre corchetes, ej: "[AS04] ..." -> "AS04"
    const codigoMatch = descInterna.match(/\[(.*?)\]/);
    const codigoExtraido = codigoMatch ? codigoMatch[1] : descInterna;

    const match = dbProductos.find(p => p.codigo && p.codigo.trim() === codigoExtraido.trim());
    if (!match) {
        showToast("El producto seleccionado no pertenece al maestro de inventario.", true);
        return;
    }

    // Capturar costos directamente de los inputs de auditoría de la interfaz si ya están cargados
    const costoAnteriorNum = limpiarValorMonedaAFloat(document.getElementById('txtAuditoriaCostoAnterior')?.value || "0") || parseFloat(match.precio_compra) || 0;
    const precioActualNum = limpiarValorMonedaAFloat(document.getElementById('txtAuditoriaPrecioActual')?.value || "0") || parseFloat(match.precio_venta) || 0;
    
    // Cálculo matemático estricto de variación inflacionaria
    let variacionCosto = 0;
    if (costoAnteriorNum > 0) {
        variacionCosto = (costo - costoAnteriorNum) / costoAnteriorNum;
    }

    // Lógica financiera de respaldo si los valores vienen en cero
    let precioVentaEfectivo = pFinal;
    let margenEfectivo = margenDigitado;

    if (pFinal === 0 && costo > 0 && margenDigitado !== 0) {
        precioVentaEfectivo = ((margenDigitado + 1) * costo) / 0.9;
    } else if (costo > 0 && pFinal > 0 && margenDigitado === 0) {
        margenEfectivo = ((pFinal * 0.9) / costo) - 1;
    }

    lineasFactura[filaSeleccionada].id_producto = match.row_id;
    lineasFactura[filaSeleccionada].codigo_interno = match.codigo;
    lineasFactura[filaSeleccionada].descripcion = match.descripcion;
    lineasFactura[filaSeleccionada].costo = costo;
    lineasFactura[filaSeleccionada].costo_anterior = costoAnteriorNum;
    lineasFactura[filaSeleccionada].precio_actual = precioActualNum;
    lineasFactura[filaSeleccionada].variacion_costo = variacionCosto;
    lineasFactura[filaSeleccionada].precio_sugerido = pSugerido;
    lineasFactura[filaSeleccionada].precio_final = precioVentaEfectivo;
    lineasFactura[filaSeleccionada].margen = margenEfectivo;
    lineasFactura[filaSeleccionada].requiere_homologacion = false;
    
    limpiarCamposEditor();
    renderizarMiniTabla();
    filaSeleccionada = -1; // Resetear foco de edición de seguridad
}

// --- LISTENERS DE INPUTS ---
const txtPrecioFinalInput = document.getElementById('txtPrecioFinal');
if (txtPrecioFinalInput) {
    txtPrecioFinalInput.addEventListener('input', (e) => {
        let cursorPosition = e.target.selectionStart;
        let oldLength = e.target.value.length;
        let valorNumerico = 0;
        
        let limpia = e.target.value.replace(/[^0-9]/g, "");
        if (limpia === "") {
            e.target.value = "$0";
            e.target.setSelectionRange(2, 2);
            valorNumerico = 0;
        } else {
            valorNumerico = parseInt(limpia, 10) || 0;
            e.target.value = maskPrecio(valorNumerico);
            let newLength = e.target.value.length;
            e.target.setSelectionRange(cursorPosition + (newLength - oldLength), cursorPosition + (newLength - oldLength));
        }

if (filaSeleccionada < 0) return;
        const item = lineasFactura[filaSeleccionada];
        
        item.precio_final = valorNumerico;
        
        // Determinación matemática exacta del margen neto (soporta valores negativos reales antes de la máscara)
        if (item.costo > 0) {
            item.margen = ((valorNumerico * 0.9) / item.costo) - 1;
        } else {
            item.margen = 0;
        }

        const txtMargenElement = document.getElementById('txtMargen');
if (txtMargenElement) {
            const margenEnteroAsignado = Math.round(item.margen * 100);
            txtMargenElement.value = margenEnteroAsignado < 0 ? "%0" : maskMargen(margenEnteroAsignado);
        }
    });
}

const inputCostoInput = document.getElementById('inputCosto');
if (inputCostoInput) {
    inputCostoInput.addEventListener('input', (e) => {
        let cursorPosition = e.target.selectionStart;
        let oldLength = e.target.value.length;
        
        let limpia = e.target.value.replace(/[^0-9,.]/g, "");
        if (limpia === "" || limpia === "," || limpia === ".") {
            e.target.value = "$0";
            e.target.setSelectionRange(2, 2);
        } else {
            e.target.value = maskPrecioDecimal(e.target.value);
            let newLength = e.target.value.length;
            e.target.setSelectionRange(cursorPosition + (newLength - oldLength), cursorPosition + (newLength - oldLength));
        }

        if (filaSeleccionada < 0) return;
        const item = lineasFactura[filaSeleccionada];
        
const nuevoCostoDecimal = limpiarValorMonedaAFloat(e.target.value);
        item.costo = nuevoCostoDecimal;
        
        if (nuevoCostoDecimal > 0) {
            item.margen = ((item.precio_final * 0.9) / nuevoCostoDecimal) - 1;
        } else {
            item.margen = 0;
        }

        const txtMargenElement = document.getElementById('txtMargen');
        if (txtMargenElement) txtMargenElement.value = maskMargen(Math.round(item.margen * 100));

        // NUEVO: Recalcular la variación de costo y actualizar el panel visual en tiempo real
        if (item.costo_anterior > 0) {
            item.variacion_costo = (nuevoCostoDecimal - item.costo_anterior) / item.costo_anterior;
            const varEntero = Math.round(item.variacion_costo * 100);
            const txtAudVar = document.getElementById('txtAuditoriaVariacion');
            if (txtAudVar) {
                txtAudVar.value = varEntero > 0 ? `+${varEntero}%` : `${varEntero}%`;
                txtAudVar.style.color = varEntero > 0 ? "#b91c1c" : (varEntero < 0 ? "#15803d" : "#475569");
            }
        }
        
const txtAudCostoNue = document.getElementById('txtAuditoriaCostoNuevo');
        if (txtAudCostoNue) txtAudCostoNue.value = maskPrecio(nuevoCostoDecimal);
    });
}
const txtMargenInput = document.getElementById('txtMargen');
if (txtMargenInput) {
    txtMargenInput.addEventListener('input', (e) => {
        let cursorPosition = e.target.selectionStart;
        let oldLength = e.target.value.length;
        let margenEntero = 0;

        let limpia = e.target.value.replace(/[^0-9]/g, "");
        
        if (limpia === "") {
            e.target.value = "%0";
            e.target.setSelectionRange(2, 2);
            margenEntero = 0;
        } else {
            margenEntero = parseInt(limpia, 10) || 0;
            e.target.value = maskMargen(margenEntero);
            let newLength = e.target.value.length;
            e.target.setSelectionRange(cursorPosition + (newLength - oldLength), cursorPosition + (newLength - oldLength));
        }

        if (filaSeleccionada < 0) return;
        const margenTasa = margenEntero / 100;
        const item = lineasFactura[filaSeleccionada];
        
        item.margen = margenTasa;
        
        if (item.costo > 0) {
            item.precio_final = Math.round(((margenTasa + 1) * item.costo) / 0.9);
            const txtPrecioFinalElement = document.getElementById('txtPrecioFinal');
if (txtPrecioFinalElement) txtPrecioFinalElement.value = maskPrecio(item.precio_final);
        }
    });
}

const txtPrecioSugeridoInput = document.getElementById('txtPrecioSugerido');
if (txtPrecioSugeridoInput) {
    txtPrecioSugeridoInput.addEventListener('input', (e) => {
        let cursorPosition = e.target.selectionStart;
        let oldLength = e.target.value.length;
        let valorNumerico = 0;
        
        let limpia = e.target.value.replace(/[^0-9]/g, "");
        if (limpia === "") {
            e.target.value = "$0";
            e.target.setSelectionRange(2, 2);
            valorNumerico = 0;
        } else {
            valorNumerico = parseInt(limpia, 10) || 0;
            e.target.value = maskPrecio(valorNumerico);
            let newLength = e.target.value.length;
            e.target.setSelectionRange(cursorPosition + (newLength - oldLength), cursorPosition + (newLength - oldLength));
        }

        if (filaSeleccionada < 0) return;
        lineasFactura[filaSeleccionada].precio_sugerido = valorNumerico;
    });
}

// 6. PERSISTENCIA EN BUCKET STORAGE, TABLAS Y API SIIGO

function limpiarNombreArchivo(nombre) {
    return nombre
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9.\-_]/g, "_")
        .replace(/__+/g, "_");
}

async function guardarFacturaSupabase() {
    const proveedor = document.getElementById('inputProveedor').value.trim();
    const idFacturaOriginal = document.getElementById('inputIdFac').value.trim();
    const fecha = document.getElementById('inputFecha').value;
    const rawTotal = document.getElementById('resumenTotal').textContent.replace(/[^0-9]/g, "");
    const rawIva = document.getElementById('resumenIva').textContent.replace(/[^0-9]/g, "");

    if (!proveedor || !idFacturaOriginal || !fecha) {
        showToast("Complete la cabecera de la factura.", true);
        return;
    }

    const llaveIdUnica = `${idFacturaOriginal}_${proveedor.replace(/\s+/g, '_')}`;
    let rutaDocumentoStorage = null;

    if (archivoPDFSeleccionado) {
        const nombreArchivo = limpiarNombreArchivo(`${llaveIdUnica}.pdf`);
        const { data: uploadData, error: uploadErr } = await supabaseClient
            .storage
            .from('facturas_compra')
            .upload(nombreArchivo, archivoPDFSeleccionado, { cacheControl: '3600', upsert: true });

        if (uploadErr) {
            console.error("Error cargando el PDF al Storage: ", uploadErr);
            showToast("Error al almacenar el PDF adjunto.", true);
            return;
        }
        rutaDocumentoStorage = uploadData.path; 
    }

    const { data: facData, error: facErr } = await supabaseClient
        .from('facturas_compra') 
        .insert([{
            id_factura: llaveIdUnica, 
            proveedor: proveedor,
            fecha: fecha,
            estado: "PROCESADO",
            items: JSON.stringify(lineasFactura), 
            iva: rawIva,
            descuento: "0",
            total: rawTotal,
            documento_origen: rutaDocumentoStorage
        }]).select();

    if (facErr) { 
        console.error("Error al insertar en la base de datos: ", facErr);
        showToast("Error al guardar en la tabla facturas_compra.", true); 
        return; 
    }

    for (const item of lineasFactura) {
        if (item.id_producto) {
            const { data: pReal } = await supabaseClient.from('productos').select('stock').eq('row_id', item.id_producto).single();
            const stockActualNum = pReal && pReal.stock ? parseInt(pReal.stock) || 0 : 0;
            
            const nuevoStock = stockActualNum + (parseInt(item.cantidad) || 1);

            await supabaseClient
                .from('productos')
                .update({
                    precio_compra: String(item.costo),       
                    precio_venta: String(Math.round(item.precio_final)), 
                    stock: String(nuevoStock)                                       
                })
                .eq('row_id', item.id_producto);
        }
    }

    showToast("Guardado local listo. Sincronizando con Siigo...");

    try {
        const nitIdentificacion = idFacturaOriginal.replace(/[^0-9]/g, "") || "800123456"; 

        const payloadSiigo = {
            proveedor_nit: nitIdentificacion,
            id_factura_proveedor: idFacturaOriginal,
            fecha_emision: fecha, // YYYY-MM-DD nativo del input HTML
            total_neto: parseFloat(rawTotal) || 0,
            items_factura: lineasFactura.map(linea => ({
                codigo_interno: linea.codigo_interno,
                descripcion: linea.descripcion || linea.descripcion_original,
                cantidad: parseInt(linea.cantidad) || 1,
                costo: parseFloat(linea.costo) || 0,
                precio_final: parseFloat(linea.precio_final) || 0
            }))
        };

        const siigoCall = await fetch("https://vdlxmajvzdtbewchyowm.supabase.co/functions/v1/siigo-crear-factura-compra", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${supabaseClient.supabaseKey || ''}`
            },
            body: JSON.stringify(payloadSiigo)
        });

        const siigoResult = await siigoCall.json();

        if (siigoResult.success) {
            showToast(`¡Factura guardada y subida a Siigo con éxito! Consecutivo: ${siigoResult.name}`);
        } else {
            console.error("Siigo no pudo procesar el documento:", siigoResult.error);
            showToast("Guardado local OK, pero Siigo rechazó la factura. Revisa la consola.", true);
        }

    } catch (siigoErr) {
        console.error("Error crítico de red en Edge Function Siigo:", siigoErr);
        showToast("Error de conexión con la Edge Function de Siigo.", true);
    }

// Bloquear ambos elementos tras concluir exitosamente el flujo
    const btnConf = document.getElementById('btnConfirmar');
    if (btnConf) btnConf.disabled = true;
    const btnAvan = document.getElementById('btnMenuAvanzado');
    if (btnAvan) btnAvan.disabled = true;

    cerrarHojaSheet();
    await cargarHistorialFacturas();
}

// 7. ENGINES AUXILIARES MATEMÁTICOS Y UI

function ejecutarAlgoritmoFinanciero(costoNuevo, costoAnterior, precioActual) {
    let salto = 100000;
    if (costoNuevo < 10000) salto = 500;
    else if (costoNuevo < 100000) salto = 1000;
    else if (costoNuevo < 1000000) salto = 10000;

    let sugerido = Math.ceil((costoNuevo * 1.4) / salto) * salto;
    let final = sugerido;

    if (precioActual > 0 && costoAnterior > 0) {
        const variacion = costoNuevo / costoAnterior;
        if (variacion >= 1) {
            final = Math.max(precioActual * variacion, sugerido);
        } else {
            const precioEMA = precioActual * (1 - ((1 - variacion) * 0.5));
            final = Math.max((precioEMA * 0.7) + (sugerido * 0.3), precioActual * 0.8);
        }
    }
    final = Math.ceil(final / salto) * salto;
    return { sugerido, final, margen: costoNuevo > 0 ? ((final * 0.9) / costoNuevo) - 1 : 0 };
}

function limpiarCamposEditor() {
    if (document.getElementById('inputProducto')) document.getElementById('inputProducto').value = "";
    if (inputProductoInterno) inputProductoInterno.value = "";
    document.getElementById('inputCosto').value = "";
    document.getElementById('txtPrecioSugerido').value = "";
    document.getElementById('txtPrecioFinal').value = "";
    if (txtMargen) txtMargen.value = "";
    
    filaSeleccionada = -1;
}

function abrirHojaSheet() { const overlaySheet = document.getElementById('overlaySheet'); const hojaSheet = document.getElementById('hojaSheet'); if (overlaySheet && hojaSheet) { overlaySheet.classList.add('visible'); hojaSheet.classList.add('visible'); } }
function cerrarHojaSheet() { const overlaySheet = document.getElementById('overlaySheet'); const hojaSheet = document.getElementById('hojaSheet'); if (overlaySheet && hojaSheet) { overlaySheet.classList.remove('visible'); hojaSheet.classList.remove('visible'); } limpiarCamposEditor(); }
function formatoMoneda(valor) { return "$" + Math.round(valor).toLocaleString('es-CO'); }
function showToast(m, d=false) { const t=document.getElementById('toast'); if(!t)return; t.textContent=m; t.style.background=d?"#dc2626":"#1e293b"; t.classList.add('visible'); setTimeout(() => t.classList.remove('visible'), 3000); }

// =========================================================================
// 4B. GESTIÓN DEL MENÚ AVANZADO DE CONFIGURACIÓN (SIIGO UI)
// =========================================================================

function abrirMenuAvanzadoSiigo() {
    // Si ya existe una modal abierta, la removemos para evitar duplicados
    const modalExistente = document.getElementById('modalSiigoAvanzado');
    if (modalExistente) modalExistente.remove();

    // Crear el contenedor de la capa oscura overlay
    const overlay = document.createElement('div');
    overlay.id = 'modalSiigoAvanzado';
    overlay.style = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.6); 
        z-index: 2000; display: flex; align-items: center; justify-content: center;
        padding: 20px; font-family: inherit;
    `;

    // Estructura interna de la ventana modal avanzada
    overlay.innerHTML = `
        <div style="background: white; width: 100%; max-width: 500px; border-radius: 14px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden; display: flex; flex-direction: column;">
            
            <div style="background: #284B87; padding: 16px 20px; color: white; display: flex; justify-content: space-between; align-items: center;">
                <h3 style="margin: 0; font-size: 16px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Configuración de Enrutamiento</h3>
                <span style="font-size: 11px; background: rgba(255,255,255,0.2); padding: 2px 8px; border-radius: 20px;">Siigo API</span>
            </div>

            <div style="padding: 20px; display: flex; flex-direction: column; gap: 16px; max-height: 70vh; overflow-y: auto;">
                
                <div style="display: flex; align-items: center; justify-content: space-between; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div>
                        <label style="font-size: 13px; font-weight: bold; color: #203764; display: block;">Sincronizar con Siigo</label>
                        <span style="font-size: 11px; color: #64748b;">Enviar factura mediante la API</span>
                    </div>
                    <input type="checkbox" id="swSiigo" ${configAvanzadaSiigo.sincronizarSiigo ? 'checked' : ''} style="width: 40px; height: 20px; cursor: pointer;">
                </div>

                <div style="display: flex; align-items: center; justify-content: space-between; background: #f8fafc; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                    <div>
                        <label style="font-size: 13px; font-weight: bold; color: #203764; display: block;">Actualizar Precios en Siigo</label>
                        <span style="font-size: 11px; color: #64748b;">Modificar listas de precios de venta</span>
                    </div>
                    <input type="checkbox" id="swPrecios" ${configAvanzadaSiigo.actualizarPreciosSiigo ? 'checked' : ''} style="width: 40px; height: 20px; cursor: pointer;">
                </div>

                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 4px 0;">

                <div class="campo">
                    <label style="font-size: 11px; font-weight: bold; color: #203764; margin-bottom: 4px; text-transform: uppercase;">Tipo de Comprobante (Siigo)</label>
                    <select id="selComprobante" style="width: 100%; padding: 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; background: white;">
                        <option value="FC-1" ${configAvanzadaSiigo.tipoComprobante === 'FC-1' ? 'selected' : ''}>[FC-1] Factura de Compra General</option>
                        <option value="FC-2" ${configAvanzadaSiigo.tipoComprobante === 'FC-2' ? 'selected' : ''}>[FC-2] Compra Proveedor Exterior</option>
                        <option value="Gastos" ${configAvanzadaSiigo.tipoComprobante === 'Gastos' ? 'selected' : ''}>[G-1] Comprobante de Gasto Directo</option>
                    </select>
                </div>

                <div class="campo">
                    <label style="font-size: 11px; font-weight: bold; color: #203764; margin-bottom: 4px; text-transform: uppercase;">Forma de Pago Contable</label>
                    <select id="selPago" style="width: 100%; padding: 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; background: white;">
                        <option value="credito-30" ${configAvanzadaSiigo.formaPago === 'credito-30' ? 'selected' : ''}>Crédito Proveedores (30 Días)</option>
                        <option value="contado-caja" ${configAvanzadaSiigo.formaPago === 'contado-caja' ? 'selected' : ''}>Efectivo / Caja General (Contado)</option>
                        <option value="transferencia" ${configAvanzadaSiigo.formaPago === 'transferencia' ? 'selected' : ''}>Transferencia Bancaria / Bancolombia</option>
                    </select>
                </div>

                <div class="campo">
                    <label style="font-size: 11px; font-weight: bold; color: #203764; margin-bottom: 4px; text-transform: uppercase;">Observaciones / Notas de la Factura</label>
                    <textarea id="txtObservacionesAvanzadas" rows="3" style="width: 100%; padding: 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; font-family: inherit; resize: none;" placeholder="Estas notas viajarán al documento contable en Siigo...">${configAvanzadaSiigo.observaciones}</textarea>
                </div>
            </div>

            <div style="background: #f8fafc; padding: 14px 20px; border-top: 1px solid #e2e8f0; display: flex; gap: 12px; justify-content: flex-end;">
                <button type="button" onclick="cerrarMenuAvanzadoSiigo()" style="padding: 10px 16px; background: #e2e8f0; color: #475569; border: none; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">Cancelar</button>
                <button type="button" onclick="guardarConfigAvanzadaSiigo()" style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">Aplicar Ajustes</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    // Lógica reactiva interna: Deshabilitar campos si el switch principal de Siigo está OFF
    const swSiigo = document.getElementById('swSiigo');
    const camposMapeables = [document.getElementById('swPrecios'), document.getElementById('selComprobante'), document.getElementById('selPago'), document.getElementById('txtObservacionesAvanzadas')];
    
    const verificarEstadoCampos = () => {
        camposMapeables.forEach(campo => {
            if (campo) {
                campo.disabled = !swSiigo.checked;
                campo.style.opacity = swSiigo.checked ? "1" : "0.5";
            }
        });
    };

    swSiigo.addEventListener('change', verificarEstadoCampos);
    verificarEstadoCampos(); // Ejecución inicial
}

function cerrarMenuAvanzadoSiigo() {
    const modal = document.getElementById('modalSiigoAvanzado');
    if (modal) modal.remove();
}

function guardarConfigAvanzadaSiigo() {
    // Extraer los valores modificados del DOM de la modal y persistirlos en el estado global
    configAvanzadaSiigo.sincronizarSiigo = document.getElementById('swSiigo').checked;
    configAvanzadaSiigo.actualizarPreciosSiigo = document.getElementById('swPrecios').checked;
    configAvanzadaSiigo.tipoComprobante = document.getElementById('selComprobante').value;
    configAvanzadaSiigo.formaPago = document.getElementById('selPago').value;
    configAvanzadaSiigo.observaciones = document.getElementById('txtObservacionesAvanzadas').value.trim();

    // Feedback visual al usuario
    if (typeof showToast === "function") {
        showToast("Configuración de enrutamiento aplicada correctamente.");
    } else {
        console.log("Configuración Siigo guardada con éxito:", configAvanzadaSiigo);
    }
    
    cerrarMenuAvanzadoSiigo();
}