const SUPABASE_URL = "https://vdlxmajvzdtbewchyowm.supabase.co"; // Se quitó /rest/v1/ de aquí
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM";

document.getElementById("formLogin").addEventListener("submit", async function (e) {
    e.preventDefault();
    
    const usuarioInput = document.getElementById("txtUsuario").value.trim().toLowerCase();
    const contrasenaInput = document.getElementById("txtContrasena").value.trim();
    const divError = document.getElementById("mensajeError");
    const boton = this.querySelector(".btn-ingresar");

    divError.style.display = "none";
    boton.innerText = "Verificando...";
    boton.disabled = true;

    try {
        // Ahora la URL se genera correctamente sin duplicados
        const urlEndpoint = `${SUPABASE_URL}/rest/v1/usuarios?usuario=eq.${encodeURIComponent(usuarioInput)}&contrasena=eq.${encodeURIComponent(contrasenaInput)}&select=usuario,area`;
        
        const respuesta = await fetch(urlEndpoint, {
            method: "GET",
            headers: {
                "apikey": SUPABASE_KEY,
                "Authorization": `Bearer ${SUPABASE_KEY}`,
                "Content-Type": "application/json"
            }
        });

        if (!respuesta.ok) throw new Error("Fallo en red o autenticación");

        const data = await respuesta.json();

        if (data && data.length > 0) {
            const cuentaValida = data[0];
            
            sessionStorage.setItem("session_user", cuentaValida.usuario);
            sessionStorage.setItem("session_area", cuentaValida.area);
            sessionStorage.setItem("session_time", Date.now().toString());

            window.location.href = `index_${cuentaValida.area}.html`;
            
        } else {
            divError.innerText = "Usuario o contraseña incorrectos";
            divError.style.display = "block";
        }
    } catch (error) {
        console.error("Error detallado:", error);
        divError.innerText = "Error al conectar con el servidor";
        divError.style.display = "block";
    } finally {
        boton.innerText = "Ingresar";
        boton.disabled = false;
    }
});