console.log("ThermoAir JS cargado");


const URL_PRODUCTOS =
"https://1drv.ms/x/c/376564bb9ea4de16/IQAxTXPJfd6lTaNuf1aw5aPEAWAAkS2uOjX74J6Vi3iLl2s?e=Sm3knd";


const URL_BUSES =
"https://1drv.ms/x/c/376564bb9ea4de16/IQBhE3hkdl3qQ4FzEZoYzx6PAWGud5Ej6XyPayl8Q6gNW0s?e=YQDoOf";


const URL_SALIDAS =
"https://1drv.ms/x/c/376564bb9ea4de16/IQDtbTAMInMDQa_qa5I6xF3VAUiUfJk8urO3Mv0_83Br11E?e=67qobz";


let datosActuales = [];


async function cargarCSV(url){


    console.log("Cargando:", url);


    const respuesta = await fetch(url);


    const texto = await respuesta.text();


    console.log(texto);


    const filas = texto.split("\n");


    const encabezados = filas[0].split(",");


    let datos = [];


    for(let i=1;i<filas.length;i++){


        if(filas[i].trim()=="") continue;


        const valores = filas[i].split(",");


        let fila={};


        encabezados.forEach((campo,index)=>{

            fila[campo.replace(/"/g,"")] =
            valores[index]?.replace(/"/g,"") || "";

        });


        datos.push(fila);


    }


    datosActuales = datos;


    mostrar(datos);

}



function mostrar(datos){


    let html="";


    datos.forEach(item=>{


        html += `

        <div class="card">

        ${Object.keys(item).map(campo=>`

        <b>${campo}</b>:
        ${item[campo]}
        <br>

        `).join("")}

        </div>

        `;


    });


    document.getElementById("resultado").innerHTML = html;


}



function mostrarBuses(){

console.log("boton buses");

cargarCSV(URL_BUSES);

}



function mostrarProductos(){

console.log("boton productos");

cargarCSV(URL_PRODUCTOS);

}



function mostrarSalidas(){

console.log("boton salidas");

cargarCSV(URL_SALIDAS);

}



function buscar(){


    let texto =
    document.getElementById("buscar").value.toLowerCase();


    let filtrado =
    datosActuales.filter(x=>

        JSON.stringify(x)
        .toLowerCase()
        .includes(texto)

    );


    mostrar(filtrado);


}