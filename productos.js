const SUPABASE_URL =
"https://vdlxmajvzdtbewchyowm.supabase.co";

const SUPABASE_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM";

const supabaseClient =
supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

let productos = [];
let timeoutBusqueda;

function formatoMoneda(valor) {

    const numero =
        Number(valor ?? 0);

    return numero.toLocaleString(
        "es-CO",
        {
            style: "currency",
            currency: "COP",
            minimumFractionDigits: 0
        }
    );

}

async function cargarProductos() {

    console.time("Consulta Supabase");

    const { data, error } =
        await supabaseClient
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
    console.log("ERROR:", error);

    if (error) {

        document.body.innerHTML += `
            <pre>${JSON.stringify(error, null, 2)}</pre>
        `;

        return;
    }

console.timeEnd("Consulta Supabase");

console.time("Renderizado");

productos = data || [];

renderizarProductos(productos);

console.timeEnd("Renderizado");

}

function renderizarProductos(datos) {

    const tabla =
        document.getElementById("tablaProductos");

    let html = "";

    datos.forEach(producto => {

        html += `
        <tr>
            <td>${producto.codigo ?? ""}</td>
            <td>${producto.categoria ?? ""}</td>
            <td>${producto.subcategoria ?? ""}</td>
            <td>${producto.descripcion ?? ""}</td>
            <td class="stock">${producto.stock ?? 0}</td>
            <td>${producto.proveedor ?? ""}</td>
            <td class="precio">${formatoMoneda(producto.precio_compra)}</td>
            <td class="precio">${formatoMoneda(producto.precio_venta)}</td>
            <td>${producto.codigo_prov ?? ""}</td>
        </tr>
        `;

    });

    tabla.innerHTML = html;

}

document
.getElementById("txtBuscar")
.addEventListener("input", function () {

    clearTimeout(timeoutBusqueda);

    const texto =
        this.value
            .trim()
            .toUpperCase();

    timeoutBusqueda = setTimeout(() => {

        if (texto === "") {

            renderizarProductos(productos);
            return;

        }

const filtrados =
    productos.filter(p =>

        String(p.codigo ?? "")
            .toUpperCase()
            .includes(texto)

        ||

        String(p.categoria ?? "")
            .toUpperCase()
            .includes(texto)

        ||

        String(p.subcategoria ?? "")
            .toUpperCase()
            .includes(texto)

        ||

        String(p.descripcion ?? "")
            .toUpperCase()
            .includes(texto)

        ||

        String(p.proveedor ?? "")
            .toUpperCase()
            .includes(texto)

        ||

        String(p.codigo_prov ?? "")
            .toUpperCase()
            .includes(texto)

    );

        renderizarProductos(filtrados);

    }, 150);

});

cargarProductos();