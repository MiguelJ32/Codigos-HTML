let df_componentes = [];
let df_pallet = [];
let df_single = [];
let lista_materiales_unicos = [];

document.getElementById('excel-file').addEventListener('change', cargarExcelDesdeInput);
document.getElementById('entry-busqueda').addEventListener('input', alEscribirBuscador);

// Intento de carga automática vía fetch (si la red compartida permite protocolo HTTP/UNC)
document.addEventListener('DOMContentLoaded', () => {
    fetch('datos.xlsx')
        .then(response => {
            if (!response.ok) throw new Error("No fetch");
            return response.arrayBuffer();
        })
        .then(buffer => procesarBufferExcel(buffer, "datos.xlsx"))
        .catch(() => {
            console.log("Carga por protocolo estricto local. Utilice el selector de archivos.");
        });
});

function cargarExcelDesdeInput(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(evt) {
        procesarBufferExcel(evt.target.result, file.name);
    };
    reader.readAsArrayBuffer(file);
}

function procesarBufferExcel(arrayBuffer, nombreArchivo) {
    try {
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // 1. Hoja Componentes
        if (workbook.SheetNames.length > 0) {
            df_componentes = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
        }

        // 2. Hoja Pallet Packaging
        if (workbook.SheetNames.length > 1) {
            df_pallet = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[1]], { defval: "" });
        }

        // 3. Hoja Single Packaging
        if (workbook.SheetNames.length > 2) {
            df_single = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[2]], { defval: "" });
        }

        const lblEstado = document.getElementById('status-label');
        lblEstado.innerText = `● Conectado: ${nombreArchivo}`;
        lblEstado.className = "status-online";
        document.getElementById('entry-busqueda').disabled = false;

        procesarExcel();
    } catch (err) {
        console.error("Error al procesar el Excel:", err);
        alert("Ocurrió un error al leer el archivo de Excel.");
    }
}

function getVal(row, nombreCol) {
    if (!row) return "";
    const target = nombreCol.trim().toLowerCase();
    const key = Object.keys(row).find(k => k.trim().toLowerCase() === target || k.trim().toLowerCase().includes(target));
    if (key && row[key] !== undefined && row[key] !== null) {
        const v = String(row[key]).trim();
        return (v.toLowerCase() === 'nan' || v.toLowerCase() === 'none') ? "" : v;
    }
    return "";
}

function procesarExcel() {
    lista_materiales_unicos = [];
    const mapaUnicos = new Map();

    df_componentes.forEach(row => {
        const mat = getVal(row, 'material');
        const maq = getVal(row, 'maquina');
        const desc = getVal(row, 'definición') || getVal(row, 'definicion');

        if (mat && !mapaUnicos.has(`${mat}_${maq}`)) {
            mapaUnicos.set(`${mat}_${maq}`, { mat, maq, desc });
            lista_materiales_unicos.push({ mat, maq, desc });
        }
    });

    if (lista_materiales_unicos.length > 0) {
        seleccionarMaterial(lista_materiales_unicos[0].mat, lista_materiales_unicos[0].maq);
    }
}

function alEscribirBuscador() {
    const query = document.getElementById('entry-busqueda').value.toLowerCase().trim();
    const sugerenciasBox = document.getElementById('frame-sugerencias');
    sugerenciasBox.innerHTML = "";

    if (!query) {
        sugerenciasBox.style.display = "none";
        return;
    }

    let coincidencias = 0;
    lista_materiales_unicos.forEach(item => {
        const textoEval = `${item.mat} ${item.maq} ${item.desc}`.toLowerCase();
        if (textoEval.includes(query)) {
            const div = document.createElement('div');
            div.className = "sugerencia-item";
            div.innerText = `${item.mat}  │  Máq: ${item.maq} ${item.desc ? `(${item.desc})` : ""}`;
            div.onclick = () => seleccionarMaterial(item.mat, item.maq);
            sugerenciasBox.appendChild(div);
            coincidencias++;
            if (coincidencias >= 20) return;
        }
    });

    sugerenciasBox.style.display = coincidencias > 0 ? "block" : "none";
}

function seleccionarMaterial(material, maquina) {
    document.getElementById('frame-sugerencias').style.display = "none";
    document.getElementById('entry-busqueda').value = "";

    const filtradosComp = df_componentes.filter(row => {
        return getVal(row, 'material') === material && getVal(row, 'maquina') === maquina;
    });

    let descText = "Sin descripción registrada";
    if (filtradosComp.length > 0) {
        const d = getVal(filtradosComp[0], 'definición') || getVal(filtradosComp[0], 'definicion');
        if (d) descText = d;
    }

    document.getElementById('lbl-definicion').innerText = descText;
    document.getElementById('lbl-info-maq').innerText = `Máquina: ${maquina}`;
    document.getElementById('lbl-info-mat').innerText = `Material: ${material}`;

    renderizarComponentes(filtradosComp, maquina);
    renderizarPackaging(material, maquina);
}

function renderizarComponentes(lista, maquina) {
    const grid = document.getElementById('grid-componentes');
    grid.innerHTML = "";
    document.getElementById('title-comp').style.display = lista.length > 0 ? "block" : "none";

    lista.forEach((item, index) => {
        const comp = getVal(item, 'componente');
        const desc = getVal(item, 'descripcion');
        const qty = getVal(item, 'cantidad');
        const valX = getVal(item, 'X?').toLowerCase();

        const datosQr = valX === 'x' ? `5X${comp}/${qty}/${maquina}/930` : `/${comp}/${qty}/${maquina}`;
        
        let pieQr = `${qty} PIEZAS`;
        if (!qty || qty === "0") pieQr = "1 PALLET";
        else if (qty === "1") pieQr = "1 CAJA";

        crearTarjeta(grid, comp, desc, pieQr, datosQr, index % 2 === 0);
    });
}

function renderizarPackaging(material, maquina) {
    const gridPallet = document.getElementById('grid-pallet');
    const gridSingle = document.getElementById('grid-single');
    gridPallet.innerHTML = "";
    gridSingle.innerHTML = "";

    const filtradosPallet = df_pallet.filter(row => getVal(row, 'Material') === material);
    const filtradosSingle = df_single.filter(row => getVal(row, 'Material') === material);

    const maxFilas = Math.max(filtradosPallet.length, filtradosSingle.length);

    for (let i = 0; i < maxFilas; i++) {
        // --- 1. PALLET PACKAGING (COLUMNA IZQUIERDA) ---
        if (i < filtradosPallet.length) {
            const itemP = filtradosPallet[i];
            const compP = getVal(itemP, 'Pallet Packaging Material');
            const descP = getVal(itemP, 'Pallet description');
            let qtyP = getVal(itemP, 'Pallet quantity') || getVal(itemP, 'quantity') || getVal(itemP, 'qty');

            if (compP) {
                const qtyQrP = qtyP !== "" ? qtyP : "1";
                const datosQrP = `1X${compP}/${qtyQrP}/${maquina}`;
                crearTarjeta(gridPallet, compP, descP, "1 PALLET", datosQrP, true);
            } else {
                crearTarjetaVacia(gridPallet);
            }
        } else {
            crearTarjetaVacia(gridPallet);
        }

        // --- 2. SINGLE PACKAGING (COLUMNA DERECHA) ---
        if (i < filtradosSingle.length) {
            const itemS = filtradosSingle[i];
            const compS = getVal(itemS, 'Single Packaging Material');
            const descS = getVal(itemS, 'Box description');
            let qtyS = getVal(itemS, 'Single Qty') || getVal(itemS, 'quantity') || getVal(itemS, 'qty');

            if (compS) {
                if (qtyS === "0" || qtyS === "") {
                    crearTarjetaVacia(gridSingle);
                } else {
                    const datosQrS = `1X${compS}/${qtyS}/${maquina}`;
                    const pieText = `${qtyS} CAJAS`;
                    crearTarjeta(gridSingle, compS, descS, pieText, datosQrS, false);
                }
            } else {
                crearTarjetaVacia(gridSingle);
            }
        } else {
            crearTarjetaVacia(gridSingle);
        }
    }

    const tienePackaging = gridPallet.children.length > 0 || gridSingle.children.length > 0;
    document.getElementById('packaging-container').style.display = tienePackaging ? "flex" : "none";
}

function crearTarjeta(contenedor, comp, desc, pieQr, datosQr, qrDerecha = true) {
    const card = document.createElement('div');
    card.className = "card";

    const qrContainerId = `qr_${Math.random().toString(36).substring(2, 9)}`;

    const textHtml = `
        <div class="card-text">
            <div class="card-comp">${comp}</div>
            <div class="card-desc">${desc}</div>
        </div>
    `;

    const qrHtml = `
        <div class="card-qr-box">
            <div id="${qrContainerId}"></div>
            <div class="card-pie">${pieQr}</div>
        </div>
    `;

    card.innerHTML = qrDerecha ? (textHtml + qrHtml) : (qrHtml + textHtml);
    contenedor.appendChild(card);

    requestAnimationFrame(() => {
        const el = document.getElementById(qrContainerId);
        if (el) {
            el.innerHTML = "";
            new QRCode(el, {
                text: datosQr || " ",
                width: 85,
                height: 85,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.L
            });
        }
    });
}

function crearTarjetaVacia(contenedor) {
    const card = document.createElement('div');
    card.className = "card card-vacia";
    contenedor.appendChild(card);
}