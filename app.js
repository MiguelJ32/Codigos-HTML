// ==============================================================================
// 1. CONFIGURACIÓN Y CONSTANTES
// ==============================================================================

// URL de tu Web App desplegada en Google Apps Script
const URL_APPS_SCRIPT = "https://script.google.com/macros/s/AKfycbxRu_PdrXqqFHRL3PtCvJKkY89mu2zajbQHHGIpHWJfImxiRIbG63nM0LGzFnjwNsR6uQ/exec";

// Claves para el almacenamiento local (Equivalente a SharedPreferences)
const CACHE_KEY_DATOS = "json_datos_planta";
const CACHE_KEY_DEVICE = "device_unique_id";

let df_componentes = [];
let df_pallet = [];
let df_single = [];
let lista_materiales_unicos = [];

// ==============================================================================
// 2. GESTIÓN DE MEMORIA LOCAL (LocalStorage / Cache)
// ==============================================================================

function obtenerOCrearDeviceId() {
    let id = localStorage.getItem(CACHE_KEY_DEVICE);
    if (!id) {
        id = 'DEV-' + Math.random().toString(36).substring(2, 10).toUpperCase();
        localStorage.setItem(CACHE_KEY_DEVICE, id);
    }
    return id;
}

function guardarDatosEnCache(data) {
    try {
        localStorage.setItem(CACHE_KEY_DATOS, JSON.stringify(data));
    } catch (e) {
        console.warn("No se pudo guardar en caché local:", e);
    }
}

function obtenerDatosDeCache() {
    const raw = localStorage.getItem(CACHE_KEY_DATOS);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function limpiarMemoriaLocal() {
    localStorage.removeItem(CACHE_KEY_DATOS);
}

// ==============================================================================
// 3. INICIALIZACIÓN Y SINCRONIZACIÓN
// ==============================================================================

document.addEventListener('DOMContentLoaded', () => {
    // 1. Carga inmediata si existen datos en caché
    const datosCache = obtenerDatosDeCache();
    if (datosCache) {
        df_componentes = datosCache.componentes || [];
        df_pallet = datosCache.pallet || [];
        df_single = datosCache.single || [];
        
        const lblEstado = document.getElementById('status-label');
        lblEstado.innerText = "● Memoria Local (Actualizando...)";
        lblEstado.className = "status-online";
        
        procesarDatosServidor();
    }

    // 2. Sincronización remota en segundo plano
    cargarDatosDesdeGoogleScript();
});

document.getElementById('entry-busqueda').addEventListener('input', alEscribirBuscador);

function cargarDatosDesdeGoogleScript() {
    const lblEstado = document.getElementById('status-label');
    const lblDefinicion = document.getElementById('lbl-definicion');
    
    // Si no había caché previa, muestra el mensaje de carga
    if (!obtenerDatosDeCache()) {
        lblEstado.innerText = "● Conectando a Google Sheets...";
        lblEstado.className = "status-offline";
        lblDefinicion.innerText = "Cargando datos desde la nube por primera vez...";
    }

    const deviceId = obtenerOCrearDeviceId();
    const urlFinal = `${URL_APPS_SCRIPT}?deviceId=${encodeURIComponent(deviceId)}`;

    // Timeout de 45 segundos (mismo que en Android)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    fetch(urlFinal, {
        method: 'GET',
        mode: 'cors',
        redirect: 'follow',
        signal: controller.signal
    })
    .then(response => {
        clearTimeout(timeoutId);
        if (!response.ok) {
            throw new Error(`Error HTTP: ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        if (data.status === "OK") {
            lblEstado.innerText = "● Sincronizado";
            lblEstado.className = "status-online";
            
            // Guardar en la memoria caché local
            guardarDatosEnCache(data);

            df_componentes = data.componentes || [];
            df_pallet = data.pallet || [];
            df_single = data.single || [];

            procesarDatosServidor();
        } else if (data.status === "PENDIENTE") {
            lblEstado.innerText = "⚠️ Dispositivo Pendiente";
            lblEstado.className = "status-offline";
            lblDefinicion.innerText = `${data.message} (ID: ${deviceId})`;
            alert(`Dispositivo registrado (${deviceId}). Cambie su estado a PERMITIDO en la pestaña 'Dispositivos' de Google Sheets.`);
        } else if (data.status === "WIPE_AND_BLOCK") {
            lblEstado.innerText = "❌ Acceso Revocado";
            lblEstado.className = "status-offline";
            lblDefinicion.innerText = "Acceso revocado remotamente. Memoria local borrada.";
            
            // Borrado remoto de caché local
            limpiarMemoriaLocal();
            limpiarPantalla();
        } else {
            throw new Error(data.message || "Estado no reconocido");
        }
    })
    .catch(err => {
        clearTimeout(timeoutId);
        console.warn("Fallo de red o timeout al conectar con Apps Script:", err);
        
        // Si hay datos locales, no interrumpir al usuario y notificar suavemente
        if (obtenerDatosDeCache()) {
            lblEstado.innerText = "● Usando datos en Caché (Sin Conexión)";
            lblEstado.className = "status-online";
        } else {
            lblEstado.innerText = "❌ Error de Conexión";
            lblEstado.className = "status-offline";
            if (err.name === 'AbortError') {
                lblDefinicion.innerText = "La consulta tardó más de 45 segundos. Reintente sincronizar.";
            } else {
                lblDefinicion.innerText = "No se pudo sincronizar. Verifique su conexión.";
            }
        }
    });
}

// ==============================================================================
// 4. PROCESAMIENTO Y FILTRADO DE DATOS
// ==============================================================================

function procesarDatosServidor() {
    lista_materiales_unicos = [];
    const mapaUnicos = new Map();

    df_componentes.forEach(item => {
        const mat = item.material ? String(item.material).trim() : "";
        const maq = item.maquina ? String(item.maquina).trim() : "";
        const desc = item.definicion ? String(item.definicion).trim() : "";

        if (mat && !mapaUnicos.has(`${mat}_${maq}`)) {
            mapaUnicos.set(`${mat}_${maq}`, { mat, maq, desc });
            lista_materiales_unicos.push({ mat, maq, desc });
        }
    });

    document.getElementById('entry-busqueda').disabled = false;

    if (lista_materiales_unicos.length > 0) {
        // Mantiene la selección o toma el primero
        const inputMat = document.getElementById('lbl-info-mat').innerText.replace("Material: ", "").trim();
        const inputMaq = document.getElementById('lbl-info-maq').innerText.replace("Máquina: ", "").trim();
        
        if (inputMat && inputMat !== "---") {
            seleccionarMaterial(inputMat, inputMaq);
        } else {
            seleccionarMaterial(lista_materiales_unicos[0].mat, lista_materiales_unicos[0].maq);
        }
    } else {
        document.getElementById('lbl-definicion').innerText = "No hay datos disponibles en la memoria local ni en la hoja.";
    }
}

// ==============================================================================
// 5. BUSCADOR Y SUGERENCIAS
// ==============================================================================

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

    const filtradosComp = df_componentes.filter(item => {
        return String(item.material).trim() === material && String(item.maquina).trim() === maquina;
    });

    let descText = "Sin descripción registrada";
    if (filtradosComp.length > 0 && filtradosComp[0].definicion) {
        descText = filtradosComp[0].definicion;
    }

    document.getElementById('lbl-definicion').innerText = descText;
    document.getElementById('lbl-info-maq').innerText = `Máquina: ${maquina}`;
    document.getElementById('lbl-info-mat').innerText = `Material: ${material}`;

    renderizarComponentes(filtradosComp, maquina);
    renderizarPackaging(material, maquina);
}

// ==============================================================================
// 6. RENDERIZADO DE COMPONENTES Y PACKAGING
// ==============================================================================

function renderizarComponentes(lista, maquina) {
    const grid = document.getElementById('grid-componentes');
    grid.innerHTML = "";
    document.getElementById('title-comp').style.display = lista.length > 0 ? "block" : "none";

    lista.forEach((item, index) => {
        const comp = item.codigo ? String(item.codigo).trim() : "";
        const desc = item.descripcion ? String(item.descripcion).trim() : "";
        const qty = item.cantidad ? String(item.cantidad).trim() : "";
        const esX = item.esTipoX;

        const datosQr = esX ? `5X${comp}/${qty}/${maquina}/930` : `/${comp}/${qty}/${maquina}`;
        
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

    const filtradosPallet = df_pallet.filter(item => String(item.materialRef).trim() === material);
    const filtradosSingle = df_single.filter(item => String(item.materialRef).trim() === material);

    const maxFilas = Math.max(filtradosPallet.length, filtradosSingle.length);

    for (let i = 0; i < maxFilas; i++) {
        // --- 1. PALLET PACKAGING (COLUMNA IZQUIERDA) ---
        if (i < filtradosPallet.length) {
            const itemP = filtradosPallet[i];
            const compP = itemP.codigo ? String(itemP.codigo).trim() : "";
            const descP = itemP.descripcion ? String(itemP.descripcion).trim() : "";
            let qtyP = itemP.cantidad ? String(itemP.cantidad).trim() : "";

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
            const compS = itemS.codigo ? String(itemS.codigo).trim() : "";
            const descS = itemS.descripcion ? String(itemS.descripcion).trim() : "";
            let qtyS = itemS.cantidad ? String(itemS.cantidad).trim() : "";

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

// ==============================================================================
// 7. DIBUJO DE TARJETAS Y LIMPIEZA
// ==============================================================================

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

function limpiarPantalla() {
    df_componentes = [];
    df_pallet = [];
    df_single = [];
    lista_materiales_unicos = [];
    document.getElementById('grid-componentes').innerHTML = "";
    document.getElementById('grid-pallet').innerHTML = "";
    document.getElementById('grid-single').innerHTML = "";
    document.getElementById('entry-busqueda').disabled = true;
}
