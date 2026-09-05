/**
 * ============================================================
 *  AeroReserva – app.js
 *  Integración con n8n via Webhook
 * ============================================================
 *
 *  CONFIGURACIÓN RÁPIDA:
 *  1. Pega tu URL de Webhook de n8n en N8N_WEBHOOK_URL.
 *  2. Abre index.html en el navegador. ¡Listo!
 *
 *  Acciones que se envían a n8n:
 *    GET_ALL → leer todas las reservas
 *    CREATE  → crear reserva
 *    UPDATE  → editar reserva
 *    DELETE  → eliminar reserva
 * ============================================================
 */

'use strict';

// ──────────────────────────────────────────────
// 1. CONFIGURACIÓN DEL WEBHOOK DE N8N
// ──────────────────────────────────────────────

/**
 * URL por defecto del Webhook de n8n (se puede cambiar aquí o desde la interfaz web).
 */
const WEBHOOK_DEFAULT = 'https://gabyrin27.app.n8n.cloud/webhook-test/aeroreserva';

/** Obtiene la URL del Webhook activa */
function getWebhookUrl() {
  return localStorage.getItem('aeroreserva_webhook_url') || WEBHOOK_DEFAULT;
}

/** Estado del Modo Demostración Local (para pruebas sin n8n activo) */
let modoDemo = localStorage.getItem('aeroreserva_modo_demo') === 'true';

const MOCK_RESERVAS_DEMO = [
  {
    id: 'res_demo_101',
    nombre: 'Carlos Mendoza',
    correo: 'carlos.mendoza@email.com',
    telefono: '+57 300 123 4567',
    origen: 'BOG',
    destino: 'MIA',
    fechaVuelo: '2026-10-15',
    horaVuelo: '08:30',
    clase: 'Ejecutiva',
    asiento: '4A',
    fechaRegreso: '2026-10-25'
  },
  {
    id: 'res_demo_102',
    nombre: 'Valentina Restrepo',
    correo: 'v.restrepo@domain.co',
    telefono: '+57 315 987 6543',
    origen: 'MDE',
    destino: 'MAD',
    fechaVuelo: '2026-11-02',
    horaVuelo: '18:45',
    clase: 'Económica',
    asiento: '18C',
    fechaRegreso: null
  }
];

function getReservasLocal() {
  const data = localStorage.getItem('aeroreserva_local_reservas');
  if (!data) {
    localStorage.setItem('aeroreserva_local_reservas', JSON.stringify(MOCK_RESERVAS_DEMO));
    return [...MOCK_RESERVAS_DEMO];
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    return [...MOCK_RESERVAS_DEMO];
  }
}

function saveReservasLocal(reservas) {
  localStorage.setItem('aeroreserva_local_reservas', JSON.stringify(reservas));
}

function toggleModoDemo() {
  modoDemo = !modoDemo;
  localStorage.setItem('aeroreserva_modo_demo', modoDemo ? 'true' : 'false');
  actualizarBotonDemo();
  if (modoDemo) {
    setEstadoConexion('demo');
    mostrarToast('🚀', 'Modo Demostración Activado', 'Operando con almacenamiento local (LocalStorage).', 'info');
  } else {
    setEstadoConexion('connecting');
    mostrarToast('🔄', 'Modo n8n Activado', 'Intentando conectar con el Webhook de n8n.', 'info');
  }
  mostrarReservas();
}

function actualizarBotonDemo() {
  const btnDemo = document.getElementById('btn-toggle-demo');
  if (!btnDemo) return;
  if (modoDemo) {
    btnDemo.textContent = '🟢 Modo Demo (Activo)';
    btnDemo.style.background = 'rgba(46, 204, 113, 0.3)';
    btnDemo.style.borderColor = 'rgba(46, 204, 113, 0.7)';
  } else {
    btnDemo.textContent = '⚪ Modo Demo (Inactivo)';
    btnDemo.style.background = 'rgba(255, 255, 255, 0.15)';
    btnDemo.style.borderColor = 'rgba(255, 255, 255, 0.35)';
  }
}

/** Permite cambiar la URL del Webhook desde un prompt en pantalla */
function cambiarWebhookUrl() {
  const urlActual = getWebhookUrl();
  const nuevaUrl = prompt(
    '⚙️ Configuración del Webhook de n8n:\n\nIngresa la URL de tu Webhook (Production/Test) de n8n:\n(Si dejas en blanco se usará la URL por defecto)',
    urlActual
  );

  if (nuevaUrl !== null) {
    const urlLimpia = nuevaUrl.trim();
    if (urlLimpia) {
      localStorage.setItem('aeroreserva_webhook_url', urlLimpia);
      mostrarToast('⚙️', 'Webhook configurado', `URL actualizada a: ${urlLimpia}`, 'info');
    } else {
      localStorage.removeItem('aeroreserva_webhook_url');
      mostrarToast('⚙️', 'Webhook reseteado', 'Se usará la URL por defecto.', 'info');
    }
    if (modoDemo) toggleModoDemo();
    else mostrarReservas();
  }
}

// ──────────────────────────────────────────────
// 2. ESTADO GLOBAL
// ──────────────────────────────────────────────

/** ID de la reserva que se está editando (null = modo creación) */
let modoEdicion = null;

/** ID pendiente de eliminación, usado por el modal de confirmación */
let idPendienteEliminar = null;

// ──────────────────────────────────────────────
// 3. REFERENCIAS AL DOM
// ──────────────────────────────────────────────

const formReserva         = document.getElementById('form-reserva');
const inputNombre         = document.getElementById('nombre');
const inputCorreo         = document.getElementById('correo');
const inputTelefono       = document.getElementById('telefono');
const inputOrigen         = document.getElementById('origen');
const inputDestino        = document.getElementById('destino');
const inputFechaVuelo     = document.getElementById('fecha-vuelo');
const inputHoraVuelo      = document.getElementById('hora-vuelo');
const checkboxRegreso     = document.getElementById('viaje-regreso');
const grupFechaRegreso    = document.getElementById('grupo-fecha-regreso');
const inputFechaRegreso   = document.getElementById('fecha-regreso');
const listaReservas       = document.getElementById('lista-reservas');
const estadoVacio         = document.getElementById('estado-vacio');
const contadorHero        = document.getElementById('contador-hero');
const contadorReservas    = document.getElementById('contador-reservas');
const formCard            = document.querySelector('.form-card');
const btnReservar         = document.getElementById('btn-reservar');
const statusDot           = document.getElementById('status-dot');
const statusText          = document.getElementById('status-text');

// Modal
const modalConfirmacion   = document.getElementById('modal-confirmacion');
const modalBackdrop       = document.getElementById('modal-backdrop');
const btnConfirmarElim    = document.getElementById('btn-confirmar-eliminar');
const btnCancelarElim     = document.getElementById('btn-cancelar-eliminar');

// Toast container
const toastContainer      = document.getElementById('toast-container');

// ──────────────────────────────────────────────
// 4. CAPA DE COMUNICACIÓN (N8N Y FALLBACK LOCAL)
// ──────────────────────────────────────────────

/**
 * Función centralizada para comunicarse con n8n o ejecutar simulación local en Modo Demo.
 * @param {string} action  - 'GET_ALL' | 'CREATE' | 'UPDATE' | 'DELETE'
 * @param {Object} payload - Datos adicionales a enviar (opcional)
 * @returns {Promise<any>}
 */
async function api(action, payload = {}) {
  // Manejo directo en modo demostración local
  if (modoDemo) {
    let local = getReservasLocal();
    if (action === 'GET_ALL') {
      return local;
    } else if (action === 'CREATE') {
      const nueva = { id: generarId(), ...payload };
      local.unshift(nueva);
      saveReservasLocal(local);
      return { success: true, reserva: nueva };
    } else if (action === 'UPDATE') {
      local = local.map(r => r.id === payload.id ? { ...r, ...payload } : r);
      saveReservasLocal(local);
      return { success: true, reserva: payload };
    } else if (action === 'DELETE') {
      local = local.filter(r => r.id !== payload.id);
      saveReservasLocal(local);
      return { success: true };
    }
  }

  // Si no está en modo demo, ejecuta petición de red hacia n8n
  const body = { action, ...payload };
  const url = getWebhookUrl();

  try {
    const respuesta = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });

    if (!respuesta.ok) {
      throw new Error(`Error HTTP: ${respuesta.status} ${respuesta.statusText}`);
    }

    const texto = await respuesta.text();
    setEstadoConexion('online');
    return texto ? JSON.parse(texto) : {};
  } catch (error) {
    // Si la conexión falla, se activa notificación y se sugiere modo demo
    setEstadoConexion('offline');
    console.warn('Fallo de conexión n8n. Puedes activar el Modo Demo para evaluar la interfaz localmente.', error);
    throw error;
  }
}

// ──────────────────────────────────────────────
// 5. INDICADOR DE ESTADO DE CONEXIÓN
// ──────────────────────────────────────────────

/**
 * Actualiza el indicador visual de conexión en la navbar.
 * @param {'connecting'|'online'|'offline'|'demo'} estado
 */
function setEstadoConexion(estado) {
  if (!statusDot || !statusText) return;

  const config = {
    connecting: { clase: 'connecting', texto: 'Conectando a n8n...' },
    online:     { clase: 'online',     texto: 'Conectado a n8n' },
    offline:    { clase: 'offline',    texto: 'Webhook n8n Offline' },
    demo:       { clase: 'demo',       texto: 'Modo Demo (Local)' },
  };

  const c = config[estado] || config.offline;
  statusDot.className  = `status-dot status-dot--${c.clase}`;
  statusText.textContent = c.texto;
}

// ──────────────────────────────────────────────
// 6. INICIALIZACIÓN
// ──────────────────────────────────────────────

/**
 * Punto de entrada. Se ejecuta cuando el DOM está listo.
 */
document.addEventListener('DOMContentLoaded', () => {
  // Fijar fecha mínima al día actual
  const hoy = obtenerFechaHoy();
  inputFechaVuelo.setAttribute('min', hoy);
  inputFechaRegreso.setAttribute('min', hoy);

  // Evento principal del formulario
  formReserva.addEventListener('submit', (e) => {
    e.preventDefault();
    guardarReserva();
  });

  // Mostrar/ocultar campo de fecha de regreso
  checkboxRegreso.addEventListener('change', toggleFechaRegreso);

  // Modal: confirmar y cancelar eliminación
  btnConfirmarElim.addEventListener('click', confirmarEliminacion);
  btnCancelarElim.addEventListener('click', cerrarModal);
  modalBackdrop.addEventListener('click', cerrarModal);

  // Cerrar modal con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modalConfirmacion.hidden) cerrarModal();
  });

  // Modo Demo botón
  const btnDemo = document.getElementById('btn-toggle-demo');
  if (btnDemo) {
    btnDemo.addEventListener('click', toggleModoDemo);
    actualizarBotonDemo();
  }

  // Cargar reservas al iniciar
  if (modoDemo) {
    setEstadoConexion('demo');
  }
  mostrarReservas();
});

// ──────────────────────────────────────────────
// 7. VALIDACIONES
// ──────────────────────────────────────────────

/**
 * Valida todos los campos del formulario.
 * Muestra errores debajo de cada campo inválido.
 * @returns {boolean} true si el formulario es válido
 */
function validarFormulario() {
  let esValido = true;
  limpiarErrores();

  // ── Nombre ──
  const nombre = inputNombre.value.trim();
  if (!nombre) {
    mostrarError('nombre-error', 'El nombre completo es obligatorio.');
    marcarCampoError(inputNombre); esValido = false;
  } else if (nombre.length < 3) {
    mostrarError('nombre-error', 'El nombre debe tener al menos 3 caracteres.');
    marcarCampoError(inputNombre); esValido = false;
  } else { marcarCampoExito(inputNombre); }

  // ── Correo ──
  const correo = inputCorreo.value.trim();
  const regexCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!correo) {
    mostrarError('correo-error', 'El correo electrónico es obligatorio.');
    marcarCampoError(inputCorreo); esValido = false;
  } else if (!regexCorreo.test(correo)) {
    mostrarError('correo-error', 'Ingresa un correo válido (ej: usuario@correo.com).');
    marcarCampoError(inputCorreo); esValido = false;
  } else { marcarCampoExito(inputCorreo); }

  // ── Teléfono ──
  const telefono = inputTelefono.value.trim();
  if (!telefono) {
    mostrarError('telefono-error', 'El teléfono es obligatorio.');
    marcarCampoError(inputTelefono); esValido = false;
  } else if (telefono.replace(/[\s+\-()]/g, '').length < 7) {
    mostrarError('telefono-error', 'Ingresa un número de teléfono válido.');
    marcarCampoError(inputTelefono); esValido = false;
  } else { marcarCampoExito(inputTelefono); }

  // ── Origen ──
  const origen = inputOrigen.value.trim();
  if (!origen) {
    mostrarError('origen-error', 'La ciudad de origen es obligatoria.');
    marcarCampoError(inputOrigen); esValido = false;
  } else { marcarCampoExito(inputOrigen); }

  // ── Destino ──
  const destino = inputDestino.value.trim();
  if (!destino) {
    mostrarError('destino-error', 'La ciudad de destino es obligatoria.');
    marcarCampoError(inputDestino); esValido = false;
  } else if (origen && destino.toLowerCase() === origen.toLowerCase()) {
    mostrarError('destino-error', 'El destino no puede ser igual al origen.');
    marcarCampoError(inputDestino); esValido = false;
  } else { marcarCampoExito(inputDestino); }

  // ── Fecha del vuelo ──
  const fechaVuelo = inputFechaVuelo.value;
  if (!fechaVuelo) {
    mostrarError('fecha-vuelo-error', 'La fecha del vuelo es obligatoria.');
    marcarCampoError(inputFechaVuelo); esValido = false;
  } else if (fechaVuelo < obtenerFechaHoy()) {
    mostrarError('fecha-vuelo-error', 'La fecha del vuelo no puede ser anterior a hoy.');
    marcarCampoError(inputFechaVuelo); esValido = false;
  } else { marcarCampoExito(inputFechaVuelo); }

  // ── Hora del vuelo ──
  if (!inputHoraVuelo.value) {
    mostrarError('hora-vuelo-error', 'La hora del vuelo es obligatoria.');
    marcarCampoError(inputHoraVuelo); esValido = false;
  } else { marcarCampoExito(inputHoraVuelo); }

  // ── Fecha de regreso (condicional) ──
  if (checkboxRegreso.checked) {
    const fechaRegreso = inputFechaRegreso.value;
    if (!fechaRegreso) {
      mostrarError('fecha-regreso-error', 'La fecha de regreso es obligatoria si marcas viaje de vuelta.');
      marcarCampoError(inputFechaRegreso); esValido = false;
    } else if (fechaVuelo && fechaRegreso <= fechaVuelo) {
      mostrarError('fecha-regreso-error', 'La fecha de regreso debe ser posterior a la del vuelo.');
      marcarCampoError(inputFechaRegreso); esValido = false;
    } else { marcarCampoExito(inputFechaRegreso); }
  }

  return esValido;
}

/** Muestra un mensaje de error bajo un campo */
function mostrarError(idError, mensaje) {
  const span = document.getElementById(idError);
  if (span) span.textContent = mensaje;
}

/** Marca un input con estilo de error */
function marcarCampoError(input) {
  input.classList.remove('form__input--success');
  input.classList.add('form__input--error');
}

/** Marca un input con estilo de éxito */
function marcarCampoExito(input) {
  input.classList.remove('form__input--error');
  input.classList.add('form__input--success');
}

/** Limpia todos los errores y estilos de validación */
function limpiarErrores() {
  document.querySelectorAll('.form__error').forEach(el => { el.textContent = ''; });
  document.querySelectorAll('.form__input').forEach(el => {
    el.classList.remove('form__input--error', 'form__input--success');
  });
}

// ──────────────────────────────────────────────
// 8. GUARDAR RESERVA (CREATE / UPDATE en n8n)
// ──────────────────────────────────────────────

/**
 * Valida el formulario y envía los datos a n8n.
 * - Si modoEdicion está activo → action: UPDATE
 * - Si no → action: CREATE
 */
async function guardarReserva() {
  if (!validarFormulario()) {
    const primerError = document.querySelector('.form__input--error');
    if (primerError) primerError.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  // Estado de carga en el botón
  setBtnCargando(true);

  // Construir payload de la reserva
  const reserva = {
    id:           modoEdicion || generarId(),
    nombre:       inputNombre.value.trim(),
    correo:       inputCorreo.value.trim(),
    telefono:     inputTelefono.value.trim(),
    origen:       capitalizar(inputOrigen.value.trim()),
    destino:      capitalizar(inputDestino.value.trim()),
    fechaVuelo:   inputFechaVuelo.value,
    horaVuelo:    inputHoraVuelo.value,
    viajeSolo:    !checkboxRegreso.checked,
    fechaRegreso: checkboxRegreso.checked ? inputFechaRegreso.value : null,
    estado:       'Confirmada',
    fechaCreacion: modoEdicion ? undefined : new Date().toISOString(),
  };

  const action = modoEdicion ? 'UPDATE' : 'CREATE';

  try {
    // ── Enviar a n8n ──
    await api(action, { data: reserva });

    if (modoEdicion) {
      mostrarToast('✏️', 'Reserva actualizada', `El vuelo ${reserva.origen} → ${reserva.destino} fue actualizado.`, 'info');
      salirModoEdicion();
    } else {
      mostrarToast('🎉', '¡Reserva confirmada!', `Tu vuelo ${reserva.origen} → ${reserva.destino} está listo.`, 'success');
    }

    limpiarFormulario();

    // Recargar lista desde n8n para reflejar el estado real
    await mostrarReservas();

    setTimeout(() => {
      document.getElementById('mis-reservas').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);

  } catch (err) {
    console.error('[AeroReserva] Error al guardar:', err);
    mostrarToast('❌', 'Error de conexión', 'No se pudo guardar la reserva. Verifica la URL del Webhook de n8n.', 'error', 7000);
    setEstadoConexion('offline');
  } finally {
    setBtnCargando(false);
  }
}

// ──────────────────────────────────────────────
// 9. MOSTRAR RESERVAS (GET_ALL desde n8n)
// ──────────────────────────────────────────────

/**
 * Solicita todas las reservas a n8n y las renderiza en pantalla.
 * Muestra un skeleton loader mientras espera la respuesta.
 */
async function mostrarReservas() {
  setEstadoConexion('connecting');
  mostrarSkeletonLoader();

  try {
    // ── Solicitar todas las reservas a n8n ──
    const respuesta = await api('GET_ALL');

    // n8n puede devolver el array directamente o dentro de una propiedad
    const reservas = Array.isArray(respuesta)
      ? respuesta
      : (respuesta.reservas || respuesta.data || []);

    setEstadoConexion('online');
    renderizarReservas(reservas);

  } catch (err) {
    console.error('[AeroReserva] Error al cargar reservas:', err);
    setEstadoConexion('offline');
    ocultarSkeletonLoader();
    mostrarErrorConexion();
    mostrarToast('📡', 'Sin conexión', 'No se pudo conectar con n8n. Revisa la URL del Webhook.', 'error', 8000);
  }
}

/** Renderiza las tarjetas de reservas en el DOM */
function renderizarReservas(reservas) {
  ocultarSkeletonLoader();

  const total = Array.isArray(reservas) ? reservas.length : 0;
  contadorHero.textContent     = total;
  contadorReservas.textContent = total;

  listaReservas.innerHTML = '';

  if (total === 0) {
    estadoVacio.style.display = 'block';
    listaReservas.style.display = 'none';
  } else {
    estadoVacio.style.display = 'none';
    listaReservas.style.display = 'grid';
    reservas.forEach((reserva, index) => {
      const card = crearTarjetaReserva(reserva, index);
      listaReservas.appendChild(card);
    });
  }
}

// ──────────────────────────────────────────────
// 10. ELIMINAR RESERVA (DELETE en n8n)
// ──────────────────────────────────────────────

/** Abre el modal de confirmación antes de eliminar */
function iniciarEliminacion(id) {
  idPendienteEliminar = id;
  modalConfirmacion.hidden = false;
  modalConfirmacion.removeAttribute('hidden');
  setTimeout(() => btnConfirmarElim.focus(), 100);
}

/** Confirma y ejecuta la eliminación */
async function confirmarEliminacion() {
  if (!idPendienteEliminar) return;
  cerrarModal();
  await eliminarReserva(idPendienteEliminar);
}

/**
 * Envía una solicitud DELETE a n8n y actualiza la UI.
 * @param {string} id - ID de la reserva a eliminar
 */
async function eliminarReserva(id) {
  // Animar la tarjeta antes de eliminar
  const card = document.querySelector(`.reserva-card[data-id="${id}"]`);
  if (card) {
    card.style.transition = 'all 0.35s ease';
    card.style.opacity    = '0';
    card.style.transform  = 'scale(0.9) translateY(10px)';
  }

  try {
    // ── Enviar DELETE a n8n ──
    await api('DELETE', { id });

    mostrarToast('🗑️', 'Reserva eliminada', 'La reserva fue eliminada correctamente.', 'error');

    // Recargar lista desde n8n
    await mostrarReservas();

  } catch (err) {
    console.error('[AeroReserva] Error al eliminar:', err);
    // Restaurar la tarjeta si falla
    if (card) {
      card.style.opacity   = '1';
      card.style.transform = 'none';
    }
    mostrarToast('❌', 'Error al eliminar', 'No se pudo eliminar la reserva. Intenta nuevamente.', 'error', 6000);
    setEstadoConexion('offline');
  }

  idPendienteEliminar = null;
}

/** Cierra el modal de confirmación */
function cerrarModal() {
  modalConfirmacion.hidden = true;
  idPendienteEliminar = null;
}

// ──────────────────────────────────────────────
// 11. EDITAR RESERVA
// ──────────────────────────────────────────────

/**
 * Carga los datos de una reserva en el formulario para editarla.
 * Obtiene los datos directamente desde el DOM de la tarjeta (sin consultar n8n).
 * @param {string} id - ID de la reserva a editar
 */
async function editarReserva(id) {
  // Buscar la reserva pidiendo todas a n8n para tener datos frescos
  setBtnCargando(true, '🔄 Cargando...');
  try {
    const respuesta = await api('GET_ALL');
    const reservas  = Array.isArray(respuesta)
      ? respuesta
      : (respuesta.reservas || respuesta.data || []);
    const reserva   = reservas.find(r => r.id === id);

    if (!reserva) {
      mostrarToast('❌', 'Error', 'No se encontró la reserva para editar.', 'error');
      return;
    }

    // Rellenar el formulario
    inputNombre.value       = reserva.nombre       || '';
    inputCorreo.value       = reserva.correo       || '';
    inputTelefono.value     = reserva.telefono     || '';
    inputOrigen.value       = reserva.origen       || '';
    inputDestino.value      = reserva.destino      || '';
    inputFechaVuelo.value   = reserva.fechaVuelo   || '';
    inputHoraVuelo.value    = reserva.horaVuelo    || '';

    checkboxRegreso.checked = !reserva.viajeSolo;
    toggleFechaRegreso();

    if (!reserva.viajeSolo && reserva.fechaRegreso) {
      inputFechaRegreso.value = reserva.fechaRegreso;
    }

    modoEdicion = id;
    activarModoEdicion();

    document.getElementById('reservar').scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error('[AeroReserva] Error al cargar para editar:', err);
    mostrarToast('❌', 'Error', 'No se pudo obtener la reserva desde n8n.', 'error');
  } finally {
    setBtnCargando(false);
  }
}

/** Aplica estilos y feedback visual del modo edición */
function activarModoEdicion() {
  formCard.classList.add('form-card--editing');
  btnReservar.innerHTML = `<span class="btn__icon" aria-hidden="true">✏️</span> Actualizar Reserva`;

  if (!document.querySelector('.edit-banner')) {
    const banner = document.createElement('div');
    banner.className = 'edit-banner';
    banner.id = 'edit-banner';
    banner.innerHTML = `
      <span aria-hidden="true">✏️</span>
      <span>Modo edición activo – modifica los campos y pulsa <strong>Actualizar Reserva</strong>.</span>
      <button type="button" class="btn btn--ghost btn--small" onclick="limpiarFormulario()" style="margin-left:auto;">✕ Cancelar</button>
    `;
    formCard.insertBefore(banner, formCard.firstChild);
  }
}

/** Restaura el formulario al modo de creación */
function salirModoEdicion() {
  modoEdicion = null;
  formCard.classList.remove('form-card--editing');
  btnReservar.innerHTML = `<span class="btn__icon" aria-hidden="true">✈️</span> Reservar Vuelo`;
  const banner = document.getElementById('edit-banner');
  if (banner) banner.remove();
}

// ──────────────────────────────────────────────
// 12. LIMPIAR FORMULARIO
// ──────────────────────────────────────────────

/**
 * Limpia todos los campos del formulario y sale del modo edición.
 */
function limpiarFormulario() {
  formReserva.reset();
  limpiarErrores();
  salirModoEdicion();

  grupFechaRegreso.hidden = true;
  grupFechaRegreso.setAttribute('aria-hidden', 'true');
  inputFechaRegreso.removeAttribute('required');

  document.querySelectorAll('.form__input').forEach(el => {
    el.classList.remove('form__input--error', 'form__input--success');
  });
}

// ──────────────────────────────────────────────
// 13. CAMPO CONDICIONAL DE REGRESO
// ──────────────────────────────────────────────

/**
 * Muestra u oculta el campo de fecha de regreso según el checkbox.
 */
function toggleFechaRegreso() {
  const mostrar = checkboxRegreso.checked;
  grupFechaRegreso.hidden = !mostrar;
  grupFechaRegreso.setAttribute('aria-hidden', String(!mostrar));

  if (mostrar) {
    inputFechaRegreso.setAttribute('required', '');
    inputFechaRegreso.setAttribute('min', inputFechaVuelo.value || obtenerFechaHoy());
    grupFechaRegreso.style.animation = 'none';
    requestAnimationFrame(() => {
      grupFechaRegreso.style.animation = 'fadeInUp 0.4s ease both';
    });
    setTimeout(() => inputFechaRegreso.focus(), 100);
  } else {
    inputFechaRegreso.removeAttribute('required');
    inputFechaRegreso.value = '';
    document.getElementById('fecha-regreso-error').textContent = '';
    inputFechaRegreso.classList.remove('form__input--error', 'form__input--success');
  }
}

// Actualizar mínimo de fecha regreso cuando cambia la del vuelo
inputFechaVuelo.addEventListener('change', () => {
  if (inputFechaVuelo.value) {
    inputFechaRegreso.setAttribute('min', inputFechaVuelo.value);
    if (inputFechaRegreso.value && inputFechaRegreso.value <= inputFechaVuelo.value) {
      inputFechaRegreso.value = '';
    }
  }
});

// ──────────────────────────────────────────────
// 14. CREAR TARJETA DE RESERVA
// ──────────────────────────────────────────────

/**
 * Crea y retorna el elemento DOM de una tarjeta de reserva.
 * @param {Object} reserva
 * @param {number} index
 * @returns {HTMLElement}
 */
function crearTarjetaReserva(reserva, index) {
  const card = document.createElement('article');
  card.className = 'reserva-card';
  card.setAttribute('role', 'listitem');
  card.setAttribute('aria-label', `Reserva de ${reserva.nombre}: ${reserva.origen} a ${reserva.destino}`);
  card.style.animationDelay = `${index * 0.07}s`;
  card.dataset.id = reserva.id;

  const fechaVueloFmt   = formatearFecha(reserva.fechaVuelo);
  const fechaRegresoFmt = reserva.fechaRegreso ? formatearFecha(reserva.fechaRegreso) : null;

  card.innerHTML = `
    <div class="reserva-card__header">
      <div class="reserva-card__route">
        <span>${escHtml(reserva.origen)}</span>
        <span class="reserva-card__route-icon">✈</span>
        <span>${escHtml(reserva.destino)}</span>
      </div>
      <span class="reserva-card__status">✅ ${escHtml(reserva.estado || 'Confirmada')}</span>
    </div>

    <div class="reserva-card__body">
      <div class="reserva-card__info">
        <span class="reserva-card__info-icon" aria-hidden="true">👤</span>
        <div class="reserva-card__info-block">
          <span class="reserva-card__info-label">Pasajero</span>
          <span class="reserva-card__info-value">${escHtml(reserva.nombre)}</span>
        </div>
      </div>
      <div class="reserva-card__info">
        <span class="reserva-card__info-icon" aria-hidden="true">📧</span>
        <div class="reserva-card__info-block">
          <span class="reserva-card__info-label">Correo</span>
          <span class="reserva-card__info-value">${escHtml(reserva.correo)}</span>
        </div>
      </div>
      <div class="reserva-card__info">
        <span class="reserva-card__info-icon" aria-hidden="true">📱</span>
        <div class="reserva-card__info-block">
          <span class="reserva-card__info-label">Teléfono</span>
          <span class="reserva-card__info-value">${escHtml(reserva.telefono)}</span>
        </div>
      </div>
      <div class="reserva-card__separator" role="separator"></div>
      <div class="reserva-card__info">
        <span class="reserva-card__info-icon" aria-hidden="true">📅</span>
        <div class="reserva-card__info-block">
          <span class="reserva-card__info-label">Fecha del vuelo</span>
          <span class="reserva-card__info-value">${fechaVueloFmt}</span>
        </div>
      </div>
      <div class="reserva-card__info">
        <span class="reserva-card__info-icon" aria-hidden="true">🕐</span>
        <div class="reserva-card__info-block">
          <span class="reserva-card__info-label">Hora de salida</span>
          <span class="reserva-card__info-value">${escHtml(formatearHora(reserva.horaVuelo))}</span>
        </div>
      </div>
      <div class="reserva-card__info">
        <span class="reserva-card__info-icon" aria-hidden="true">🔄</span>
        <div class="reserva-card__info-block">
          <span class="reserva-card__info-label">Viaje de regreso</span>
          <span class="reserva-card__info-value">
            ${reserva.viajeSolo
              ? '<span class="badge badge--no">❌ No</span>'
              : `<span class="badge badge--yes">✅ Sí${fechaRegresoFmt ? ` – ${fechaRegresoFmt}` : ''}</span>`
            }
          </span>
        </div>
      </div>
    </div>

    <div class="reserva-card__actions">
      <button class="btn btn--ghost btn--small" onclick="editarReserva('${escHtml(reserva.id)}')" aria-label="Editar reserva de ${escHtml(reserva.nombre)}">
        ✏️ Editar
      </button>
      <button class="btn btn--small" style="background:var(--color-danger-light);color:var(--color-danger);border-color:rgba(225,112,85,.3);" onclick="iniciarEliminacion('${escHtml(reserva.id)}')" aria-label="Eliminar reserva de ${escHtml(reserva.nombre)}">
        🗑️ Eliminar
      </button>
    </div>
  `;

  return card;
}

// ──────────────────────────────────────────────
// 15. SKELETON LOADER (estado de carga)
// ──────────────────────────────────────────────

/** Muestra tarjetas skeleton mientras se carga desde n8n */
function mostrarSkeletonLoader() {
  estadoVacio.style.display  = 'none';
  listaReservas.style.display = 'grid';
  listaReservas.innerHTML = '';

  for (let i = 0; i < 3; i++) {
    const sk = document.createElement('div');
    sk.className = 'skeleton-card';
    sk.innerHTML = `
      <div class="sk-header"></div>
      <div class="sk-body">
        <div class="sk-line sk-line--short"></div>
        <div class="sk-line"></div>
        <div class="sk-line sk-line--medium"></div>
        <div class="sk-line sk-line--short"></div>
      </div>
    `;
    listaReservas.appendChild(sk);
  }
}

/** Elimina el skeleton loader */
function ocultarSkeletonLoader() {
  listaReservas.querySelectorAll('.skeleton-card').forEach(el => el.remove());
}

/** Muestra un mensaje de error de conexión en la sección de reservas */
function mostrarErrorConexion() {
  listaReservas.style.display = 'none';
  estadoVacio.style.display   = 'block';
  estadoVacio.innerHTML = `
    <div class="empty-state__icon" aria-hidden="true">📡</div>
    <h3 class="empty-state__title">Sin conexión con n8n</h3>
    <p class="empty-state__text">
      No se pudo cargar la información desde el servidor.<br />
      Verifica que la URL del Webhook en <code>app.js</code> sea correcta y que n8n esté activo.
    </p>
    <button class="btn btn--primary" onclick="mostrarReservas()">🔄 Reintentar</button>
  `;
}

// ──────────────────────────────────────────────
// 16. TOAST / NOTIFICACIONES
// ──────────────────────────────────────────────

/**
 * Muestra una notificación toast temporal.
 * @param {string} icono
 * @param {string} titulo
 * @param {string} mensaje
 * @param {'success'|'error'|'info'|'warning'} tipo
 * @param {number} duracion - ms
 */
function mostrarToast(icono, titulo, mensaje, tipo = 'info', duracion = 4500) {
  const toast = document.createElement('div');
  toast.className = `toast toast--${tipo}`;
  toast.setAttribute('role', 'alert');
  toast.innerHTML = `
    <span class="toast__icon" aria-hidden="true">${icono}</span>
    <div class="toast__content">
      <p class="toast__title">${titulo}</p>
      <p class="toast__msg">${mensaje}</p>
    </div>
    <button class="toast__close" onclick="this.parentElement.remove()" aria-label="Cerrar notificación">✕</button>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    if (toast.parentElement) {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 350);
    }
  }, duracion);
}

// ──────────────────────────────────────────────
// 17. HELPERS DEL BOTÓN
// ──────────────────────────────────────────────

/**
 * Activa / desactiva el estado de carga en el botón principal.
 * @param {boolean} cargando
 * @param {string}  texto - Texto alternativo mientras carga
 */
function setBtnCargando(cargando, texto = '') {
  btnReservar.disabled = cargando;
  if (cargando) {
    btnReservar.classList.add('btn--loading');
    if (texto) btnReservar.dataset.textoOriginal = btnReservar.textContent;
  } else {
    btnReservar.classList.remove('btn--loading');
  }
}

// ──────────────────────────────────────────────
// 18. UTILIDADES GENERALES
// ──────────────────────────────────────────────

/** Genera un ID único */
function generarId() {
  return `res_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Retorna la fecha de hoy en formato YYYY-MM-DD */
function obtenerFechaHoy() {
  const hoy = new Date();
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
}

/** Formatea YYYY-MM-DD a fecha larga en español */
function formatearFecha(fechaISO) {
  if (!fechaISO) return '—';
  try {
    return new Date(`${fechaISO}T00:00:00`).toLocaleDateString('es-CO', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch { return fechaISO; }
}

/** Formatea HH:MM a 12h con AM/PM */
function formatearHora(hora) {
  if (!hora) return '—';
  try {
    const [h, m] = hora.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  } catch { return hora; }
}

/** Capitaliza la primera letra de cada palabra */
function capitalizar(str) {
  return str.toLowerCase().split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

/** Escapa caracteres HTML para prevenir XSS */
function escHtml(str) {
  const mapa = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(str).replace(/[&<>"']/g, m => mapa[m]);
}
