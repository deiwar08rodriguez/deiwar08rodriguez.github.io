const SUPABASE_URL = "https://vdlxmajvzdtbewchyowm.supabase.co";

const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let productos = [];
let timeoutBusqueda;

function formatoMoneda(valor) {
    const numero = Number(valor ?? 0);
    return numero.toLocaleString("es-CO", {
        style: "currency",
        currency: "COP",
        minimumFractionDigits: 0
    });
}

// Replica exacta traducida de tu funcion CalcularMargen de VBA
function calcularMargenThermoAir(precioVenta, precioCompra) {
    if (precioVenta === null || precioCompra === null) return 0;
    if (precioVenta === "" || precioCompra === "") return 0;
    
    const pv = Number(String(precioVenta).replace(",", "."));
    const pc = Number(String(precioCompra).replace(",", "."));

    if (isNaN(pv) || isNaN(pc)) return 0;
    if (pc <= 0) return 0;

    return ((pv * 0.9) - pc) / pc;
}

async function cargarProductos() {
    console.time("Consulta Supabase");

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

    console.log("DATA:", data);
    console.error("ERROR:", error);

    if (error) {
        document.body.innerHTML += `<pre>${JSON.stringify(error, null, 2)}</pre>`;
        return;
    }

    console.timeEnd("Consulta Supabase");
    console.time("Renderizado");

    productos = data || [];
    renderizarProductos(productos);

    console.timeEnd("Renderizado");
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

        // 1. Inyeccion en estructura de PC con consistencia de colores
        htmlTabla += `
        <tr>
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

        // 2. Inyeccion en estructura Movil
        htmlMovil += `
        <div class="prod-card" id="card-${producto.codigo}">
            <div class="card-descripcion">${producto.descripcion ?? "Sin descripcion"}</div>
            <div class="card-codigo-badge">${producto.codigo ?? ""}</div>
            <div class="card-subtexto">${producto.categoria ?? ""} / ${producto.subcategoria ?? ""}</div>
            <div class="card-precio-venta">${formatoMoneda(producto.precio_venta)}</div>
            
            <div class="card-detalles-ocultos">
                <strong>Precio Compra:</strong> ${formatoMoneda(producto.precio_compra)}<br>
                <strong>Margen:</strong> ${margenVisual}<br>
                <strong>Proveedor:</strong> ${producto.proveedor ?? "---"}<br>
                <strong>Codigo Prov:</strong> ${producto.codigo_prov ?? "---"}
            </div>
            
            <div class="card-footer-movil">
                <button class="btn-ver-mas" onclick="toggleDetalleCard('card-${producto.codigo}')">
                    <span class="btn-text">Mas datos</span> <span class="btn-icon">▼</span>
                </button>
                <div class="card-stock-text ${claseStock}">Stock: ${stockActual}</div>
            </div>
        </div>
        `;
    });

    if (tabla) tabla.innerHTML = htmlTabla;
    if (contenedorMovil) contenedorMovil.innerHTML = htmlMovil;
}



// Funcion interactiva con auto-cierre estricto (Acordeon unico)
function toggleDetalleCard(idCard) {
    const tarjetaActual = document.getElementById(idCard);
    if (!tarjetaActual) return;

    if (!tarjetaActual.classList.contains("abierta")) {
        document.querySelectorAll(".prod-card.abierta").forEach(card => {
            card.classList.remove("abierta");
            const boton = card.querySelector(".btn-ver-mas");
            if (boton) {
                boton.querySelector(".btn-text").innerText = "Mas datos";
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
            botonActual.querySelector(".btn-text").innerText = "Mas datos";
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

cargarProductos();
