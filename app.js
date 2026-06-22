const URL_PRODUCTOS =
"https://1drv.ms/x/c/376564bb9ea4de16/IQAxTXPJfd6lTaNuf1aw5aPEAWAAkS2uOjX74J6Vi3iLl2s?e=Sm3knd";

const URL_BUSES =
"https://1drv.ms/x/c/376564bb9ea4de16/IQBhE3hkdl3qQ4FzEZoYzx6PAWGud5Ej6XyPayl8Q6gNW0s?e=YQDoOf";


const URL_SALIDAS =
"https://1drv.ms/x/c/376564bb9ea4de16/IQDtbTAMInMDQa_qa5I6xF3VAUiUfJk8urO3Mv0_83Br11E?e=67qobz";


let datos=[];



async function cargarCSV(url){


let respuesta = await fetch(url);


let texto = await respuesta.text();


let filas = texto.split("\n");


let cabeceras =
filas[0].split(",");



let resultado=[];


for(let i=1;i<filas.length;i++){


let valores =
filas[i].split(",");


let objeto={};


cabeceras.forEach((x,j)=>{

objeto[x]=valores[j];

});


resultado.push(objeto);


}


datos=resultado;


mostrar(datos);


}



function mostrar(lista){


let html="";


lista.forEach(x=>{


html += `

<div class="card">

${Object.entries(x).map(([a,b])=>`

<b>${a}</b>: ${b}<br>

`).join("")}

</div>

`;


});


document.getElementById("resultado").innerHTML=html;


}



function mostrarBuses(){

cargarCSV(URL_BUSES);

}


function mostrarProductos(){

cargarCSV(URL_PRODUCTOS);

}


function mostrarSalidas(){

cargarCSV(URL_SALIDAS);

}




function buscar(){


let texto =
document.getElementById("buscar").value.toUpperCase();



let filtrado =
datos.filter(x=>

JSON.stringify(x)
.toUpperCase()
.includes(texto)

);


mostrar(filtrado);


}