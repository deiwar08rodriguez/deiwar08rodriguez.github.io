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

    const { data, error } =
        await supabaseClient
            .from("productos")
            .select("*")
            .order("descripcion");

    console.log(data);
    console.log(error);

    if (error) {

        document.getElementById("contenido").innerHTML =
            `<pre>${JSON.stringify(error, null, 2)}</pre>`;

        return;
    }

    if (!data || data.length === 0) {

        document.getElementById("contenido").innerHTML =
            "<h3>No hay productos.</h3>";

        return;
    }

    const tbody =
        document.getElementById("tablaProductos");

    tbody.innerHTML = "";

productos = data;

renderizarProductos(productos);

}

function renderizarProductos(datos) {

    const tabla =
        document.getElementById("tablaProductos");

    tabla.innerHTML = "";

    datos.forEach(producto => {

        tabla.innerHTML += `
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

}

document
.getElementById("txtBuscar")
.addEventListener("input", function () {

    const texto =
        this.value
            .trim()
            .toUpperCase();

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

            String(p.descripcion ?? "")
                .toUpperCase()
                .includes(texto)

            ||

            String(p.proveedor ?? "")
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

        );

    renderizarProductos(filtrados);

});

cargarProductos();