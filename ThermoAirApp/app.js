const SUPABASE_URL =
"https://vdlxmajvzdtbewchyowm.supabase.co/rest/v1/";

const SUPABASE_KEY =
"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkbHhtYWp2emR0YmV3Y2h5b3dtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyMTQwNzAsImV4cCI6MjA5Nzc5MDA3MH0.Lkd6dAfeItdxPS-rEiruHDB36-1GDE6I_0ogR7TuhFM";

const supabaseClient =
supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

async function cargarBuses(){

    const { data, error } =
    await supabaseClient
        .from("buses")
        .select("*")
        .limit(100);

    if(error){

        console.error(error);
        return;
    }

    const tabla =
    document.getElementById("tablaBuses");

    tabla.innerHTML = "";

    data.forEach(bus=>{

        tabla.innerHTML += `
        <tr>
            <td>${bus.id}</td>
            <td>${bus.bus}</td>
            <td>${bus.placa}</td>
            <td>${bus.cliente}</td>
        </tr>
        `;
    });

}

cargarBuses();