// 1. Proteger la página: verificar si hay una sesión activa
const sessionUser = sessionStorage.getItem("session_user");
const sessionArea = sessionStorage.getItem("session_area");

// Si no hay datos de sesión, redirigir inmediatamente al login (index.html)
if (!sessionUser || !sessionArea) {
    window.location.href = "index.html";
} else {
    // 2. Controlar visibilidad de las tarjetas según el área del usuario
    const area = sessionArea.toLowerCase().trim();

    // Referencias a todos los botones del menú
    const btnProductos = document.getElementById("btnProductos");
    const btnBuses = document.getElementById("buses.html"); // Buscaremos por elemento de buses si quisiéramos, pero este se queda siempre visible.
    const btnSalidas = document.getElementById("btnSalidas");
    const btnVentas = document.getElementById("btnVentas");
    const btnCompras = document.getElementById("btnCompras");

    if (area === "tecnico") {
        // Ocultamos absolutamente todo, menos Buses
        if (btnProductos) btnProductos.style.display = "none";
        if (btnSalidas) btnSalidas.style.display = "none";
        if (btnVentas) btnVentas.style.display = "none";
        if (btnCompras) btnCompras.style.display = "none";
        
        // Hacemos que la única tarjeta (Buses) ocupe todo el ancho para que se vea simétrica
        const tarjetaBuses = document.querySelector('a[href="buses.html"]');
        if (tarjetaBuses) {
            tarjetaBuses.style.gridColumn = "span 2";
        }

        // Cambiar títulos personalizados para el rol técnico
        const tituloPanel = document.querySelector(".brand-side h1");
        if (tituloPanel) tituloPanel.innerText = "Panel Técnico";

        const controlGestion = document.querySelector(".menu-side h2");
        if (controlGestion) controlGestion.innerText = "Servicio Técnico";
    } else if (area === "gestion") {
        // Si es gestión, nos aseguramos de que todo se muestre correctamente
        if (btnProductos) btnProductos.style.display = "flex";
        if (btnSalidas) btnSalidas.style.display = "flex";
        if (btnVentas) btnVentas.style.display = "flex";
        if (btnCompras) btnCompras.style.display = "flex";
    }
}