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

// Configuración avanzada de enrutamiento para Siigo (Valores por defecto montados en Window)
window.configAvanzadaSiigo = {
    sincronizarSiigo: false,
    actualizarPreciosSiigo: true,
    tipoComprobante: "FC-1",
    pagos: [
        { metodo: "credito-proveedores", monto: 0, activo: true },
        { metodo: "efectivo", monto: 0, activo: false }
    ],
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
    Analiza el texto de esta factura electrónica de venta colombiana emitida a través del software SIIGO (o distribuidores autorizados como The Factory HKA).
    
    INSTRUCCIONES DE EXTRACCIÓN CRÍTICAS:
    1. PROVEEDOR (EMISOR): Extrae el nombre o Razón Social del emisor (ej: "INVERPRIMOS S.A.S."). No confundas con el adquirente (THERMO AIR S.A.S.) ni con el proveedor tecnológico (The Factory HKA).
    2. NÚMERO DE FACTURA (id_factura): Localiza el número de documento de la factura. Remueve cualquier prefijo de letras, espacios o caracteres que tenga al inicio y extrae ÚNICAMENTE el número consecutivo final. Ignora por completo los números de Resolución DIAN de 13 dígitos.
    4. IMPUESTOS (iva): Busca el bloque o tabla de "Impuestos" o "Totales". Identifica el MONTO CALCULADO DEL IVA (ej: "IVA : 19.00% Base: 798,319.33 Monto/Total: 151,680.67"). El valor de "iva" DEBE ser el monto en dinero (151681), NUNCA el porcentaje (19).
    5. TOTALES: Extrae el gran total final de la factura (ej: "TOTAL: 950,000.00").
    6. TRATAMIENTO DE NÚMEROS: Elimina puntos de miles y redondea los decimales al entero más cercano (ej: 151,680.67 -> 151681; 199,579.83 -> 199580).
    7. ÍTEMS (TABLA DE PRODUCTOS): Recorre la tabla de artículos. Para cada ítem extrae:
       - 'codigo_proveedor': El código SKU o de fábrica que aparece en la columna "# Código" o similar.
       - 'descripcion': El texto descriptivo del producto de forma literal.
       - 'cantidad': Número entero o decimal de unidades compradas.
       - 'costo_unitario': El valor unitario ANTES de IVA (Base Imponible).
    
    Responde ÚNICAMENTE con el objeto JSON estructurado según el esquema. Sin explicaciones ni marcas Markdown.
    `,

    GENERAL: `
    Analiza este documento de factura. Actúa como un auditor contable, no solo como un extractor de texto.

    1. EXTRACCIÓN DE DATOS: 
       - Identifica Razón Social y NIT del emisor (sin caracteres especiales).
       - Extrae el número de factura y la fecha (YYYY-MM-DD).
       - Identifica 'iva' (moneda, no %) y 'total' (neto, suma final).

    2. LÓGICA DE ÍTEMS Y CÁLCULO DE COSTO (CRÍTICO):
       - Para cada fila de producto, extrae: código, descripción y cantidad.
       - Para 'costo_unitario': 
         A) Identifica el Precio Lista por unidad.
         B) Resta cualquier descuento (%), valor de descuento ($) o bonificación asociada a la fila.
         C) El resultado final (después de descuentos) es tu 'costo_unitario'.
       - Regla de oro: 'costo_unitario' multiplicado por 'cantidad' debe dar un subtotal que, sumado al IVA distribuido, coincida con el 'total' de la factura. Si no coincide, revisa tu cálculo de descuento antes de generar el JSON.

    3. FORMATO DE SALIDA:
       - Genera un objeto JSON que siga estrictamente el esquema.
       - 'costo_unitario' y 'precio_antes_iva' deben ser valores enteros.
       - NO incluyas textos explicativos, ni Markdown, ni comentarios fuera del JSON.
       - Si un ítem no tiene código, asígnale un identificador único basado en su descripción.
    `
    };

const esquemaFacturaJSON = {
    type: "object",
    properties: {
        proveedor: { type: "string" },
        nit_proveedor: { type: "string", description: "NIT del proveedor/emisor sin puntos ni guiones, solo números y sin dígito de verificación (ej: 901964829)" },
        id_factura: { type: "string", description: "Solo los números del consecutivo final, sin letras ni guiones" },
        id_factura_completa: { type: "string", description: "El número original completo tal cual aparece en el PDF, conservando prefijos de letras o guiones si los tiene" },
        fecha: { type: "string", description: "Formato estricto YYYY-MM-DD" },
        iva: { type: "integer", description: "Monto total del IVA en dinero/pesos liquidados. NO es el porcentaje (ej: guarda 151681, NO 19)" },
        total: { type: "integer", description: "Valor total neto de la factura (Subtotal + IVA)" },
items: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    codigo_proveedor: { type: "string" },
                    descripcion: { type: "string" },
                    cantidad: { type: "integer" },
                    costo_unitario: { type: "integer", description: "Costo unitario del producto ANTES de IVA" },
                    precio_antes_iva: { type: "integer", description: "Precio unitario bruto del artículo sin IVA, idéntico a costo_unitario" }
                },
                required: ["codigo_proveedor", "descripcion", "cantidad", "costo_unitario", "precio_antes_iva"]
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
        .select('row_id, codigo, descripcion, precio_compra, precio_venta, proveedor, codigo_prov');
    
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

        // Inyección de lógica de auditoría visual en el listado histórico principal
        let claseAlertaHistorial = "";
        if (fac.items && Array.isArray(fac.items)) {
            const tieneAlzaCritica = fac.items.some(item => {
                const baseCosto = parseFloat(item.costo_unitario) || 0;
                // Simulación preventiva contra rotura de datos locales
                const factorIvaSimulado = fac.total / (fac.total - fac.iva) || 1.19;
                const costoConIva = Math.round(baseCosto * factorIvaSimulado);
                const matchProd = dbProductos.find(p => p.codigo === item.codigo_proveedor);
                if (matchProd && matchProd.precio_compra > 0) {
                    const variacion = (costoConIva - matchProd.precio_compra) / matchProd.precio_compra;
                    return variacion > 0.05; // Alerta si supera el 5% de incremento
                }
                return false;
            });
            if (tieneAlzaCritica) claseAlertaHistorial = 'style="background-color: #fef2f2; border-left: 4px solid #ef4444;"';
        }

        tr.innerHTML = `
            <td style="font-weight:bold;">${fac.id_factura}</td>
            <td>${fac.proveedor}</td>
            <td style="white-space:nowrap;">${fac.fecha || '-'}</td>
            <td style="text-align:center;">${linkPdf}</td>
            <td style="text-align:right;">${formatoMoneda(totalNum - ivaNum)}</td>
            <td style="text-align:right;">${formatoMoneda(ivaNum)}</td>
            <td style="font-weight:bold; text-align:right;">${formatoMoneda(totalNum)}</td>
        `;
        if (claseAlertaHistorial) tr.setAttribute('style', tr.getAttribute('style') ? tr.getAttribute('style') + "; background-color: #fef2f2;" : "background-color: #fef2f2;");
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
                // Guardamos el número limpio en el input para mantener la consistencia de tus llaves
                document.getElementById('inputIdFac').value = facturaIA.id_factura;
                // Adjuntamos temporalmente el prefijo completo en un atributo de Window para recuperarlo al enviar a Siigo
                window.idFacturaCompletaSiigo = facturaIA.id_factura_completa || facturaIA.id_factura;
                // NUEVO: Guardar el NIT extraído directamente por la IA, sino fallback
                window.nitProveedorExtraido = facturaIA.nit_proveedor ? String(facturaIA.nit_proveedor).replace(/[^0-9]/g, "").trim() : (String(facturaIA.proveedor).replace(/[^0-9]/g, "").trim() || "");
                document.getElementById('inputFecha').value = fechaNormalizada;
                document.getElementById('resumenIva').textContent = formatoMoneda(totalIva);
                document.getElementById('resumenTotal').textContent = formatoMoneda(totalFactura);

lineasFactura = facturaIA.items.map(item => {
                    let skuFactura = item.codigo_proveedor ? String(item.codigo_proveedor).trim() : '';
                    if (skuFactura.toUpperCase().includes("PROV:")) {
                        const matchRegex = skuFactura.match(/PROV:\s*([^\]]+)/i);
                        if (matchRegex) skuFactura = matchRegex[1].trim();
                    }
                    const match = dbProductos.find(p => 
                        (p.codigo && p.codigo.toUpperCase() === skuFactura.toUpperCase()) || 
                        (p.codigo_prov && p.codigo_prov.toUpperCase() === skuFactura.toUpperCase())
                    );
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
                        requiere_homologacion: match ? false : true,
                        precio_unitario_sin_iva: parseFloat(item.precio_antes_iva) || parseFloat(item.costo_unitario) || 0
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
        let badgeVar = `<span class="badge-variacion" style="padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold; background-color:#e2e8f0; color:#475569;">0%</span>`;
        
        if (linea.costo_anterior > 0) {
            if (varCostoEntero > 5) {
                // Inyección visual disruptiva para alzas críticas que superan el 5% permitido
                badgeVar = `<span class="badge-variacion" style="padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold; background-color:#fef2f2; color:#ef4444; border: 1px solid #fca5a5;">+${varCostoEntero}% </span>`;
                tr.style.backgroundColor = "#fff5f5";
            } else if (varCostoEntero > 0) {
                badgeVar = `<span class="badge-variacion" style="padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold; background-color:#fffbeb; color:#d97706;">+${varCostoEntero}%</span>`;
            } else if (varCostoEntero < 0) {
                badgeVar = `<span class="badge-variacion" style="padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold; background-color:#f0fdf4; color:#16a34a;">${varCostoEntero}%</span>`;
            }
        } else {
            badgeVar = `<span class="badge-variacion" style="padding:2px 6px; border-radius:4px; font-size:11px; font-weight:bold; background-color:#f1f5f9; color:#64748b;">N/A</span>`;
        }

        tr.innerHTML = `
            <td style="font-weight:bold; padding:8px 4px;">${linea.codigo_interno}</td>
<td title="${linea.descripcion || String(linea.descripcion_original).replace(/\[PROV:\s*/i, '[')}" style="max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:8px 4px;">
                ${linea.descripcion || String(linea.descripcion_original).replace(/\[PROV:\s*/i, '[')}
            </td>
            <td style="text-align:center; font-weight:500; padding:8px 4px;">${linea.cantidad}</td>
            <td style="text-align:right; padding:8px 4px;">${formatoMoneda(linea.costo)} ${badgeVar}</td>
            <td style="text-align:right; font-weight:bold; color:#10b981; padding:8px 4px;">${formatoMoneda(linea.precio_final)}</td>
            <td style="text-align:center; font-weight:bold; color:#284B87; padding:8px 4px;">${Math.round(linea.margen * 100)}%</td>
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

// 4. BUSCADOR INTERACTIVO PARA HOMOLOGAR

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
            div.style.padding = "8px";
            div.style.cursor = "pointer";
            div.textContent = `[${prod.codigo || 'S/C'}] ${prod.descripcion}`;
            
            div.onclick = () => {
                if (dropdown) dropdown.style.display = 'none';
                document.getElementById('inputProductoInterno').value = `[${prod.codigo || 'PENDIENTE'}] ${prod.descripcion}`;
                
                const costoAnteriorNum = parseFloat(prod.precio_compra) || 0;
                const precioActualNum = parseFloat(prod.precio_venta) || 0;
                
                // Interceptamos la fila actual seleccionada en la mini tabla para extraer su costo real analizado
                let costoAnalizadoActual = 0;
                if (filaSeleccionada > -1) {
                    costoAnalizadoActual = lineasFactura[filaSeleccionada].costo;
                }

                // Inyección del núcleo financiero en tiempo de selección/búsqueda interactiva
                const calculosPrecio = ejecutarAlgoritmoFinanciero(costoAnalizadoActual, costoAnteriorNum, precioActualNum);

                if (document.getElementById('txtAuditoriaCostoAnterior')) document.getElementById('txtAuditoriaCostoAnterior').value = maskPrecio(costoAnteriorNum);
                if (document.getElementById('txtAuditoriaPrecioActual')) document.getElementById('txtAuditoriaPrecioActual').value = maskPrecio(precioActualNum);
                if (document.getElementById('txtAuditoriaCostoNuevo')) document.getElementById('txtAuditoriaCostoNuevo').value = maskPrecio(costoAnalizadoActual);

                if (document.getElementById('txtPrecioSugerido')) document.getElementById('txtPrecioSugerido').value = maskPrecio(calculosPrecio.sugerido);
                if (document.getElementById('txtPrecioFinal')) document.getElementById('txtPrecioFinal').value = maskPrecio(calculosPrecio.final);
                if (document.getElementById('txtMargen')) document.getElementById('txtMargen').value = maskMargen(Math.round(calculosPrecio.margen * 100));

                const txtAudVar = document.getElementById('txtAuditoriaVariacion');
                if (txtAudVar) {
                    if (costoAnteriorNum > 0) {
                        const varEntero = Math.round(((costoAnalizadoActual - costoAnteriorNum) / costoAnteriorNum) * 100);
                        txtAudVar.value = varEntero > 0 ? `+${varEntero}%` : `${varEntero}%`;
                        txtAudVar.style.color = varEntero > 5 ? "#b91c1c" : (varEntero < 0 ? "#15803d" : "#475569");
                    } else {
                        txtAudVar.value = "N/A";
                        txtAudVar.style.color = "#475569";
                    }
                }
                
                document.getElementById('inputProductoInterno').dataset.selectedProd = JSON.stringify(prod);
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
        
        const matchCodigoProv = item.descripcion_original ? item.descripcion_original.match(/\[PROV:\s*([^\]]+)\]/) : null;
        const codigoProvReal = matchCodigoProv ? matchCodigoProv[1].trim() : "";
        const proveedorActual = document.getElementById('inputProveedor')?.value || "";

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
            codigo_prov: codigoProvReal,
            proveedor: proveedorActual,
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

    const btnConf = document.getElementById('btnConfirmar');
    let textoOriginalBtn = "";
    if (btnConf) {
        textoOriginalBtn = btnConf.innerHTML;
        btnConf.disabled = true;
        btnConf.innerHTML = `<i class="fa fa-spinner fa-spin"></i> Guardando local y sincronizando...`;
    }

    const llaveIdUnica = `${idFacturaOriginal}_${proveedor.replace(/\s+/g, '_')}`;
    let rutaDocumentoStorage = null;

    if (archivoPDFSeleccionado) {
        let nombreBase = limpiarNombreArchivo(`${llaveIdUnica}`);
        
        nombreBase = nombreBase
            .replace(/\s+/g, '_')               
            .replace(/\.+/g, '.')               
            .replace(/[^a-zA-Z0-9_\-\.]/g, ''); 
        
        const nombreArchivo = `${nombreBase.replace(/\.pdf$/i, '')}.pdf`;

        const { data: uploadData, error: uploadErr } = await supabaseClient
            .storage
            .from('facturas_compra')
            .upload(nombreArchivo, archivoPDFSeleccionado, { cacheControl: '3600', upsert: true });

        if (uploadErr) {
            console.error("Error cargando el PDF al Storage: ", uploadErr);
            showToast("Error al almacenar el PDF adjunto.", true);
            if (btnConf) { btnConf.disabled = false; btnConf.innerHTML = textoOriginalBtn; }
            return;
        }
        rutaDocumentoStorage = uploadData.path; 
    }

    const { data: facData, error: facErr } = await supabaseClient
        .from('facturas_compra') 
        .insert([{
            id_factura: String(llaveIdUnica), 
            proveedor: String(proveedor),
            fecha: String(fecha),
            estado: "PROCESADO",
            items: String(lineasFactura.length), 
            iva: String(rawIva),
            descuento: "0",
            total: String(rawTotal),
            documento_origen: String(rutaDocumentoStorage || '')
        }]).select();
        
    if (facErr) { 
        console.error("Error al insertar en la base de datos: ", facErr);
        showToast("Error al guardar en la tabla facturas_compra.", true); 
        if (btnConf) { btnConf.disabled = false; btnConf.innerHTML = textoOriginalBtn; }
        return; 
    }

    for (const item of lineasFactura) {
        // Guardado de la transacción histórica en productos_compras
        await supabaseClient
            .from('productos_compras')
            .insert([{
                id_factura: String(llaveIdUnica),
                estado: "PROCESADO",
                fecha: String(fecha),
                codigo: String(item.codigo_interno || ''),
                descripcion: String(item.descripcion || item.descripcion_original || ''),
                precio_compra: String(item.costo),
                cantidad: String(item.cantidad || 1),
                proveedor: String(proveedor),
                codigo_proveedor: String(idFacturaOriginal), 
                documento_origen: String(rutaDocumentoStorage || '')
            }]);

        // ACTUALIZACIÓN EN CASCADA DEL MAESTRO DE PRODUCTOS
        if (item.id_producto) {
            let skuLimpio = item.codigo_proveedor || '';
            
            if (!skuLimpio && item.descripcion_original) {
                const matchSku = item.descripcion_original.match(/\[PROV:\s*([^\]]+)\]/i);
                if (matchSku) {
                    skuLimpio = matchSku[1].trim();
                }
            }

            const { error: errMaestro } = await supabaseClient
                .from('productos')
                .update({
                    precio_compra: item.costo,                     
                    fecha_precio: fecha,                    
                    proveedor: proveedor,                  
                    codigo_prov: String(skuLimpio),        
                    precio_venta: Math.round(parseFloat(item.precio_final) || 0)
                })
                .eq('row_id', item.id_producto);

            if (errMaestro) {
                console.error(`Error actualizando maestro del producto ${item.codigo_interno}:`, errMaestro);
            }
        }

    }

    // NUEVA CONEXIÓN INTEGRAL CON EDGE FUNCTION SIIGO
    if (window.configAvanzadaSiigo && window.configAvanzadaSiigo.sincronizarSiigo) {
        showToast("Guardado local listo. Sincronizando con Siigo...");

try {
            // Usar el NIT extraído por la IA si existe, sino fallback al proveedor actual
            const nitIdentificacion = window.nitProveedorExtraido || proveedor.replace(/[^0-9]/g, "");

const pagosActivos = window.configAvanzadaSiigo.pagos.filter(p => p.activo && p.monto > 0);
            
            const payloadSiigo = {
                proveedor_nit: nitIdentificacion || "800123456",
                id_factura_proveedor: window.idFacturaCompletaSiigo ? String(window.idFacturaCompletaSiigo).trim() : (idFacturaOriginal ? String(idFacturaOriginal).trim() : "1"),
                fecha_emision: fecha,
                total_neto: parseFloat(rawTotal) || 0,
                pagos_multiplo: pagosActivos.length > 0 ? pagosActivos : [{ metodo: "credito-proveedores", monto: parseFloat(rawTotal) || 0 }],
                observaciones_adicionales: window.configAvanzadaSiigo.observaciones || '',
                actualizar_precios_maestros: window.configAvanzadaSiigo.actualizarPreciosSiigo || false,
                items_factura: lineasFactura.map(linea => ({
                    codigo_interno: linea.codigo_interno,
                    descripcion: linea.descripcion || linea.descripcion_original,
                    cantidad: parseInt(linea.cantidad) || 1,
                    costo: parseFloat(linea.precio_unitario_sin_iva) || parseFloat(linea.costo) || 0,
                    precio_final: parseFloat(linea.precio_final) || 0,
                    precio_anterior: parseFloat(linea.precio_actual) || 0
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
                showToast(`¡Factura guardada y subida a Siigo con éxito! Documento: ${siigoResult.name}`);
            } else {
                console.error("Siigo no pudo procesar el documento:", siigoResult.error);
                showToast("Guardado local OK, pero Siigo rechazó la factura. Verifica logs.", true);
            }

        } catch (siigoErr) {
            console.error("Error crítico de red en Edge Function Siigo:", siigoErr);
            showToast("Error de conexión con la Edge Function de Siigo.", true);
        }
    } else {
        showToast("Factura procesada localmente con éxito en ThermoAir.");
    }

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

// 4B. GESTIÓN DEL MENÚ AVANZADO DE CONFIGURACIÓN (SIIGO UI)

function abrirMenuAvanzadoSiigo() {
    const modalExistente = document.getElementById('modalSiigoAvanzado');
    if (modalExistente) modalExistente.remove();

    window.configAvanzadaSiigo.actualizarPreciosSiigo = true;
    window.configAvanzadaSiigo.tipoComprobante = "FC-1";

    const overlay = document.createElement('div');
    overlay.id = 'modalSiigoAvanzado';
    overlay.style = `
        position: fixed; inset: 0; background: rgba(0,0,0,0.6); 
        z-index: 2000; display: flex; align-items: center; justify-content: center;
        padding: 20px; font-family: inherit;
    `;

    const totalFactura = parseInt(document.getElementById('resumenTotal').textContent.replace(/[^0-9]/g, "")) || 0;

overlay.innerHTML = `
        <div style="background: white; width: 100%; max-width: 550px; border-radius: 14px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); overflow: hidden; display: flex; flex-direction: column;">
            
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

                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 4px 0;">

                <div style="font-size: 12px; font-weight: bold; color: #475569; text-transform: uppercase; letter-spacing: 0.4px;">Métodos de Pago (Máx. 2)</div>
                
<div id="contenedorPagos" style="display: flex; flex-direction: column; gap: 12px;">
                    ${configAvanzadaSiigo.pagos.map((pago, idx) => `
                        <div style="display: grid; grid-template-columns: 1fr 120px; gap: 8px; align-items: end;">
                            <select id="selPago${idx}" onchange="actualizarNombrePago(${idx}, this.value)" style="padding: 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; background: white;">
                                <option value="credito-proveedores" ${pago.metodo === 'credito-proveedores' ? 'selected' : ''}>Crédito Proveedores</option>
                                <option value="efectivo" ${pago.metodo === 'efectivo' ? 'selected' : ''}>Efectivo</option>
                                <option value="bancolombia" ${pago.metodo === 'bancolombia' ? 'selected' : ''}>Bancolombia</option>
                                <option value="bbva" ${pago.metodo === 'bbva' ? 'selected' : ''}>BBVA</option>
                            </select>
                            <input type="text" id="montoPago${idx}" value="${maskPrecio(pago.monto)}" oninput="actualizarMontoPago(${idx}, this)" style="padding: 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; text-align: right;" placeholder="$0">
                            <label style="display: flex; align-items: center; gap: 6px; cursor: pointer;">
                                <input type="checkbox" id="chkPago${idx}" ${pago.activo ? 'checked' : ''} onchange="alternarPago(${idx})">
                                <span style="font-size: 11px; color: #475569;">Activo</span>
                            </label>
                        </div>
                    `).join('')}
                </div>
                
                <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 10px; font-size: 12px; color: #92400e;">
                    <strong>Total Factura:</strong> ${maskPrecio(totalFactura)} | <strong id="sumaPagosDisplay">Pagos: $0</strong>
                </div>

                <div class="campo">
                    <label style="font-size: 11px; font-weight: bold; color: #203764; margin-bottom: 4px; text-transform: uppercase;">Observaciones / Notas de la Factura</label>
                    <textarea id="txtObservacionesAvanzadas" rows="3" style="width: 100%; padding: 10px; border: 1.5px solid #cbd5e1; border-radius: 8px; font-size: 14px; outline: none; font-family: inherit; resize: none;" placeholder="Estas notas viajarán al documento contable en Siigo...">${configAvanzadaSiigo.observaciones || ''}</textarea>
                </div>
            </div>

            <div style="background: #f8fafc; padding: 14px 20px; border-top: 1px solid #e2e8f0; display: flex; gap: 12px; justify-content: flex-end;">
                <button type="button" onclick="cerrarMenuAvanzadoSiigo()" style="padding: 10px 16px; background: #e2e8f0; color: #475569; border: none; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">Cancelar</button>
                <button type="button" onclick="guardarConfigAvanzadaSiigo()" style="padding: 10px 20px; background: #10b981; color: white; border: none; border-radius: 6px; font-weight: bold; font-size: 13px; cursor: pointer;">Aplicar Ajustes</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const swSiigo = document.getElementById('swSiigo');
    
    const verificarEstadoCampos = () => {
        for (let i = 0; i < 2; i++) {
            const sel = document.getElementById(`selPago${i}`);
            const inp = document.getElementById(`montoPago${i}`);
            const chk = document.getElementById(`chkPago${i}`);
            if (sel && inp && chk) {
                sel.disabled = !swSiigo.checked;
                inp.disabled = !swSiigo.checked;
                chk.disabled = !swSiigo.checked;
                sel.style.opacity = swSiigo.checked ? "1" : "0.5";
                inp.style.opacity = swSiigo.checked ? "1" : "0.5";
            }
        }
        const obs = document.getElementById('txtObservacionesAvanzadas');
        if (obs) {
            obs.disabled = !swSiigo.checked;
            obs.style.opacity = swSiigo.checked ? "1" : "0.5";
        }
    };

swSiigo.addEventListener('change', () => {
        window.configAvanzadaSiigo.sincronizarSiigo = swSiigo.checked;
        verificarEstadoCampos();
    });
    
    // Calcular suma de pagos al abrir
    actualizarSumaPagos();
    verificarEstadoCampos();
}

// Funciones auxiliares para el modal de multipago
function alternarPago(idx) {
    const chk = document.getElementById(`chkPago${idx}`);
    if (chk) window.configAvanzadaSiigo.pagos[idx].activo = chk.checked;
    actualizarSumaPagos();
}

function actualizarNombrePago(idx, valor) {
    window.configAvanzadaSiigo.pagos[idx].metodo = valor;
}

function actualizarMontoPago(idx, elemento) {
    let cursorPosition = elemento.selectionStart;
    let oldLength = elemento.value.length;
    let valorNumerico = 0;
    
    let limpia = elemento.value.replace(/[^0-9]/g, "");
    if (limpia === "") {
        elemento.value = "$0";
        elemento.setSelectionRange(2, 2);
        valorNumerico = 0;
    } else {
        valorNumerico = parseInt(limpia, 10) || 0;
        
        // 1. Obtener el total de la factura desde el DOM
        const totalFactura = parseInt(document.getElementById('resumenTotal')?.textContent?.replace(/[^0-9]/g, "")) || 0;
        
        // 2. Calcular cuánto han sumado los DEMÁS campos de pago (excluyendo el actual)
        let sumaOtrosPagos = 0;
        for (let i = 0; i < 2; i++) {
            if (i !== idx) {
                sumaOtrosPagos += window.configAvanzadaSiigo.pagos[i].monto || 0;
            }
        }
        
        // 3. Si el nuevo número sobrepasa el límite disponible, frenar el exceso
        const maximoDisponible = totalFactura - sumaOtrosPagos;
        if (valorNumerico > maximoDisponible) {
            valorNumerico = maximoDisponible;
        }

        elemento.value = maskPrecio(valorNumerico);
        let newLength = elemento.value.length;
        elemento.setSelectionRange(cursorPosition + (newLength - oldLength), cursorPosition + (newLength - oldLength));
    }
    
    window.configAvanzadaSiigo.pagos[idx].monto = valorNumerico;
    actualizarSumaPagos();
}

function actualizarSumaPagos() {
    let sumaPagos = 0;
    for (let i = 0; i < 2; i++) {
        sumaPagos += window.configAvanzadaSiigo.pagos[i].monto || 0;
    }
    const display = document.getElementById('sumaPagosDisplay');
    if (display) display.textContent = `Pagos: ${maskPrecio(sumaPagos)}`;
}

function cerrarMenuAvanzadoSiigo() {
    const modal = document.getElementById('modalSiigoAvanzado');
    if (modal) modal.remove();
}

function guardarConfigAvanzadaSiigo() {
    configAvanzadaSiigo.sincronizarSiigo = document.getElementById('swSiigo')?.checked || false;
    configAvanzadaSiigo.observaciones = document.getElementById('txtObservacionesAvanzadas')?.value?.trim() || "";

    // Guardar configuración de pagos desde el modal
    for (let i = 0; i < 2; i++) {
        const selPago = document.getElementById(`selPago${i}`);
        const montoPago = document.getElementById(`montoPago${i}`);
        const chkPago = document.getElementById(`chkPago${i}`);
        
        if (selPago && montoPago && chkPago) {
            window.configAvanzadaSiigo.pagos[i].metodo = selPago.value;
            window.configAvanzadaSiigo.pagos[i].monto = limpiarValorMonedaAFloat(montoPago.value);
            window.configAvanzadaSiigo.pagos[i].activo = chkPago.checked;
        }
    }

    if (typeof showToast === "function") {
        showToast("Configuración de enrutamiento aplicada correctamente.");
    } else {
        console.log("Configuración Siigo guardada con éxito:", configAvanzadaSiigo);
    }
    
    cerrarMenuAvanzadoSiigo();
}

// NÚCLEO FINANCIERO DE PRICING DINÁMICO (THERMOAIR BASE)

function ejecutarAlgoritmoFinanciero(costoNuevo, costoAnterior, precioActual) {
    let sugerido = calcularPrecioSugerido(costoNuevo);
    
    let final = (precioActual > 0) ? precioActual : sugerido; 
    
    if (precioActual >= sugerido) {
        sugerido = precioActual;
    }
    
    let margen = 0;
    if (costoNuevo > 0) {
        margen = ((final * 0.9) / costoNuevo) - 1;
    }

    return { sugerido: sugerido, final: final, margen: margen };
}

function calcularPrecioSugerido(costo) {
    let multiplicador = obtenerMultiplicador(costo);
    return redondearPrecio(costo * multiplicador);
}

function obtenerMultiplicador(precioCompra) {
    if (precioCompra <= 0) return 1.445;

    const costos = [
        1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
        11000, 12000, 13000, 14000, 15000, 16000, 17000, 18000, 19000, 20000,
        25000, 30000, 35000, 40000, 45000, 50000, 55000, 60000, 65000, 70000,
        75000, 80000, 85000, 90000, 95000, 100000, 125000, 150000, 175000, 200000,
        225000, 250000, 275000, 300000, 325000, 350000, 375000, 400000, 425000, 450000,
        475000, 500000, 525000, 550000, 575000, 600000, 625000, 650000, 675000, 700000,
        725000, 750000, 775000, 800000, 825000, 850000, 875000, 900000, 925000, 950000,
        975000, 1000000, 1250000, 1500000, 1750000, 2000000, 2250000, 2500000, 2750000, 3000000,
        3250000, 3500000, 3750000, 4000000, 4250000, 4500000, 4750000, 5000000, 6000000, 7000000,
        8000000, 9000000, 10000000, 11000000, 12000000, 13000000, 14000000, 15000000, 16000000, 17000000,
        18000000, 19000000, 20000000
    ];

    const multip = [
        2.5, 2.35, 2.25, 2.15, 2.05, 1.98, 1.92, 1.87, 1.83, 1.78,
        1.74, 1.7, 1.67, 1.64, 1.6, 1.58, 1.56, 1.54, 1.52, 1.5,
        1.495, 1.49, 1.485, 1.48, 1.475, 1.47, 1.468, 1.466, 1.464, 1.462,
        1.46, 1.458, 1.456, 1.454, 1.452, 1.45, 1.445, 1.44, 1.435, 1.43,
        1.427, 1.424, 1.421, 1.418, 1.415, 1.412, 1.409, 1.406, 1.403, 1.4,
        1.397, 1.394, 1.391, 1.388, 1.385, 1.382, 1.379, 1.376, 1.373, 1.37,
        1.367, 1.364, 1.361, 1.358, 1.355, 1.352, 1.349, 1.346, 1.343, 1.34,
        1.337, 1.334, 1.324, 1.314, 1.304, 1.294, 1.286, 1.279, 1.272, 1.264,
        1.257, 1.249, 1.242, 1.234, 1.229, 1.224, 1.219, 1.214, 1.206, 1.198,
        1.19, 1.186, 1.182, 1.178, 1.174, 1.17, 1.166, 1.162, 1.158, 1.154,
        1.15, 1.146, 1.142
    ];

    if (precioCompra <= costos[0]) return multip[0];

    for (let i = 0; i < costos.length - 1; i++) {
        if (precioCompra >= costos[i] && precioCompra <= costos[i + 1]) {
            return interpolar(costos[i], costos[i + 1], multip[i], multip[i + 1], precioCompra);
        }
    }

    return multip[multip.length - 1];
}

function interpolar(x1, x2, y1, y2, x) {
    if (x2 === x1) return y1;
    return y1 + ((x - x1) * (y2 - y1)) / (x2 - x1);
}

function redondearPrecio(precio) {
    let salto = 100000;
    if (precio < 10000) salto = 500;
    else if (precio < 100000) salto = 1000;
    else if (precio < 1000000) salto = 10000;

    // Emulación nativa exacta de WorksheetFunction.Ceiling (Redondeo hacia arriba al múltiplo más cercano)
    return Math.ceil(precio / salto) * salto;
}