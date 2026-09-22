let gruposData = [];
let estudiantesGrupo = [];
let currentGrupoId = null;
let currentFechasSemana = [];

const NOMBRES_DIAS = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];

function parseFechaLocal(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function formatFechaLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

document.addEventListener('DOMContentLoaded', function() {
    cargarGrupos();

    // Initialize flatpickr for week selection
    flatpickr('#fecha_semana', {
        enableTime: false,
        dateFormat: 'Y-m-d',
        defaultDate: formatFechaLocal(new Date()),
        onChange: async function(selectedDates, dateStr) {
            if (dateStr && currentGrupoId) {
                generarFechasSemana(dateStr);
                await renderTablaAsistenciaSemana();
            }
        }
    });

    // Initialize flatpickr for historial week selection
    flatpickr('#fecha_historial', {
        enableTime: false,
        dateFormat: 'Y-m-d',
        defaultDate: formatFechaLocal(new Date())
    });
});

async function cargarGrupos() {
    try {
        const response = await fetch('/api/grupos/list');
        gruposData = await response.json();
        const select = document.getElementById('grupo_asistencia');
        select.innerHTML = '<option value="">Seleccionar curso...</option>';
        gruposData.forEach(g => {
            const option = document.createElement('option');
            option.value = g.id;
            option.textContent = `${g.nombre_materia} - ${g.curso} (${g.paralelo}) - ${g.especialidad || 'Sin especialidad'}`;
            select.appendChild(option);
        });
    } catch (err) {
        console.error('Error:', err);
        showNotification('Error al cargar cursos', 'danger');
    }
}

function generarFechasSemana(fechaInicio) {
    const fecha = parseFechaLocal(fechaInicio);

    // Retroceder al lunes de la semana que contiene la fecha
    const dow = fecha.getDay();
    const diasAtras = dow === 0 ? 6 : dow - 1;
    fecha.setDate(fecha.getDate() - diasAtras);

    currentFechasSemana = [];
    for (let i = 0; i < 5; i++) {
        const d = new Date(fecha);
        d.setDate(fecha.getDate() + i);
        currentFechasSemana.push({
            fecha: formatFechaLocal(d),
            dia: NOMBRES_DIAS[d.getDay()]
        });
    }

    document.getElementById('fechaSemanaMostrar').textContent =
        `${currentFechasSemana[0].fecha} al ${currentFechasSemana[4].fecha}`;
}

async function cargarEstudiantesAsistencia() {
    const grupoId = document.getElementById('grupo_asistencia').value;
    if (!grupoId) {
        document.getElementById('tablaAsistenciaSemana').style.display = 'none';
        document.getElementById('btnGuardarSemana').style.display = 'none';
        return;
    }

    currentGrupoId = grupoId;

    try {
        const response = await fetch(`/api/grupos/${grupoId}/estudiantes`);
        estudiantesGrupo = await response.json();

        document.getElementById('btnGuardarSemana').style.display = 'inline-block';

        // Set default week date if not set
        const fechaInput = document.getElementById('fecha_semana');
        if (!fechaInput.value) {
            const today = formatFechaLocal(new Date());
            fechaInput.value = today;
            generarFechasSemana(today);
        } else {
            generarFechasSemana(fechaInput.value);
        }

        await renderTablaAsistenciaSemana();
        document.getElementById('tablaAsistenciaSemana').style.display = 'block';
    } catch (err) {
        console.error('Error:', err);
        showNotification('Error al cargar estudiantes', 'danger');
    }
}

async function renderTablaAsistenciaSemana() {
    const trHeader = document.getElementById('diaHeaders');
    const tbody = document.getElementById('tablaAsistenciaEstudiantes');

    if (currentFechasSemana.length === 0) {
        tbody.innerHTML = '';
        return;
    }

    // Generate day headers (only existing headers are kept, new ones appended)
    // Clear any existing day headers (keep Cedula and Nombres)
    const existingHeaders = trHeader.querySelectorAll('th');
    for (let i = existingHeaders.length - 1; i >= 2; i--) {
        trHeader.removeChild(existingHeaders[i]);
    }

    // Add day headers for each day
    currentFechasSemana.forEach(d => {
        const th = document.createElement('th');
        th.className = 'text-center';
        th.innerHTML = `<small>${d.dia}</small><br><small>${d.fecha.split('-')[2]}/${d.fecha.split('-')[1]}</small>`;
        trHeader.appendChild(th);
    });

    // Load existing attendance for this week
    const fechasStr = currentFechasSemana.map(d => d.fecha).join(',');
    let existingAsistencias = {};
    try {
        const response = await fetch(`/api/asistencias/semana/${currentGrupoId}?fechas=${fechasStr}`);
        const data = await response.json();
        data.forEach(a => {
            const fechaNormalizada = a.fecha.split('T')[0];
            const key = `${a.grupo_id}_${fechaNormalizada}`;
            existingAsistencias[key] = { estado: a.estado, comentario: a.comentario || '' };
        });
    } catch (err) {
        console.log('No existing attendance for this week');
    }

    tbody.innerHTML = '';
    if (estudiantesGrupo.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">No hay estudiantes en este curso</td></tr>';
        return;
    }

    estudiantesGrupo.forEach(est => {
        const esInactivo = est.activo === 0;
        const disabledAttr = esInactivo ? 'disabled' : '';
        const estiloInactivo = esInactivo ? 'opacity:0.5;background:#e9ecef' : '';
        const cells = currentFechasSemana.map(d => {
            const key = `${est.id}_${d.fecha}`;
            const isChecked = existingAsistencias[key]?.estado === 'ausente';
            const comentario = existingAsistencias[key]?.comentario || '';
            return `
                <td class="text-center align-middle position-relative" style="${estiloInactivo}">
                    <input type="checkbox" name="asistencia_${est.id}" value="${d.fecha}" data-estudiante="${est.id}" data-fecha="${d.fecha}" ${isChecked ? 'checked' : ''} ${disabledAttr}>
                    <i class="fas fa-comment ${comentario ? 'text-warning' : ''} position-absolute btn-comentario-asistencia" style="top:2px;right:2px;font-size:10px;cursor:pointer"
                        data-estudiante="${est.id}"
                        data-fecha="${d.fecha}"
                        data-estudiante-nombre="${est.nombres_apellidos}"
                        data-dia="${d.dia}"
                        data-comentario="${comentario}"
                        onclick="abrirComentarioAsistencia(this)"></i>
                </td>
            `;
        }).join('');

        const row = `
            <tr style="${estiloInactivo}">
                <td>${est.cedula}</td>
                <td>${nombreEstudiante(est.nombres_apellidos, est.discapacidad)}${esInactivo ? ' <span class="badge bg-secondary">INACTIVO</span>' : ''}</td>
                ${cells}
            </tr>
        `;
        tbody.innerHTML += row;
    });
}

async function guardarAsistenciaSemana() {
    const grupoId = document.getElementById('grupo_asistencia').value;
    const fechaInput = document.getElementById('fecha_semana').value;

    if (!grupoId || !fechaInput) {
        showNotification('Seleccione un curso y semana', 'warning');
        return;
    }

    if (currentFechasSemana.length === 0) {
        showNotification('Seleccione una fecha válida', 'warning');
        return;
    }

    // Validate week range
    const inicioSemana = currentFechasSemana[0].fecha;
    const finSemana = currentFechasSemana[4].fecha;
    const inicioPeriodo = parseFechaLocal('2026-08-01');
    const finPeriodo = parseFechaLocal('2027-07-31');

    if (new Date(inicioSemana) < inicioPeriodo || new Date(finSemana) > finPeriodo) {
        showNotification('La semana debe estar entre agosto 2026 y julio 2027', 'warning');
        return;
    }

    // Collect attendance data from checkboxes
    const asistenciasData = [];
    const checkboxes = document.querySelectorAll('input[name^="asistencia_"]');
    checkboxes.forEach(cb => {
        const grupoEstudiante = cb.getAttribute('data-estudiante');
        const fecha = cb.getAttribute('data-fecha');
        if (cb.disabled) return; // Saltar inactivos
        // Buscar el comentario del ícono de commentario de esta celda
        const icon = cb.parentElement.querySelector('.btn-comentario-asistencia');
        const comentario = icon ? (icon.getAttribute('data-comentario') || '') : '';
        asistenciasData.push({
            grupo_id: parseInt(grupoEstudiante),
            fecha: fecha,
            estado: cb.checked ? 'ausente' : 'presente',
            comentario: comentario || null
        });
    });

    if (asistenciasData.length === 0) {
        showNotification('No hay estudiantes para registrar', 'warning');
        return;
    }

    try {
        const response = await fetch('/api/asistencias/semana', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                asistencias: asistenciasData
            })
        });

        const data = await response.json();
        if (response.ok) {
            showNotification(`Asistencia guardada correctamente (${asistenciasData.length} registros)`, 'success');
            await renderTablaAsistenciaSemana();
        } else {
            showNotification(data.error || 'Error', 'danger');
        }
    } catch (err) {
        console.error('Error:', err);
        showNotification('Error de conexión', 'danger');
    }
}

function abrirComentarioAsistencia(el) {
    const grupoEstudiante = el.getAttribute('data-estudiante');
    const fecha = el.getAttribute('data-fecha');
    const nombre = el.getAttribute('data-estudiante-nombre');
    const dia = el.getAttribute('data-dia');
    const comentarioActual = el.getAttribute('data-comentario') || '';

    const comentario = prompt(`Comentario para ${nombre} - ${dia} (${fecha}):`, comentarioActual);
    if (comentario === null) return;

    // Guardar comentario
    fetch('/api/asistencias/comentario', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            grupo_id: parseInt(grupoEstudiante),
            fecha: fecha,
            comentario: comentario
        })
    })
    .then(res => res.json())
    .then(data => {
        el.setAttribute('data-comentario', comentario);
        el.classList.toggle('text-warning', !!comentario);
        showNotification('Comentario guardado', 'success');
    })
    .catch(err => {
        console.error('Error:', err);
        showNotification('Error al guardar comentario', 'danger');
    });
}

async function cargarHistorialAsistencia() {
    // Limpiar resultados anteriores
    document.getElementById('resultadoEstudiante').style.display = 'none';
    document.getElementById('sinResultado').style.display = 'none';
    document.getElementById('historial_busqueda').value = '';

    // Abrir modal
    const modal = new bootstrap.Modal(document.getElementById('modalHistorial'));
    modal.show();
}

async function buscarPorEstudiante() {
    const busqueda = document.getElementById('historial_busqueda').value.trim();

    if (!busqueda) {
        showNotification('Ingrese cedula o nombre del estudiante', 'warning');
        return;
    }

    try {
        const response = await fetch(`/api/asistencias/buscar-estudiante?busqueda=${encodeURIComponent(busqueda)}`);
        const historial = await response.json();

        const tbody = document.getElementById('tablaHistorialAsistencia');
        tbody.innerHTML = '';

        if (historial.length === 0) {
            document.getElementById('resultadoEstudiante').style.display = 'none';
            document.getElementById('sinResultado').style.display = 'block';
        } else {
            document.getElementById('resultadoEstudiante').style.display = 'block';
            document.getElementById('sinResultado').style.display = 'none';

            historial.forEach(a => {
                const fechaObj = parseFechaLocal(String(a.fecha).split('T')[0]);
                const fecha = fechaObj.toLocaleDateString('es-ES');
                const diaSemana = NOMBRES_DIAS[fechaObj.getDay()];
                let estadoBadge, estadoTexto;
                if (a.justificacion_id) {
                    estadoBadge = 'bg-info';
                    estadoTexto = 'Justificado';
                } else if (a.estado === 'presente') {
                    estadoBadge = 'bg-success';
                    estadoTexto = 'Presente';
                } else if (a.estado === 'ausente') {
                    estadoBadge = 'bg-danger';
                    estadoTexto = 'Ausente';
                } else {
                    estadoBadge = 'bg-warning';
                    estadoTexto = 'Atraso';
                }
                const motivoTitle = a.justificacion_id && a.motivo ? ` title="Motivo: ${a.motivo}"` : '';
                tbody.innerHTML += `
                    <tr>
                        <td><small>${a.nombre_materia}</small></td>
                        <td><small>${a.curso} (${a.paralelo})</small></td>
                        <td><small>${a.cedula}</small></td>
                        <td><small>${nombreEstudiante(a.nombres_apellidos, a.discapacidad)}</small></td>
                        <td><small>${fecha}</small></td>
                        <td><small>${diaSemana}</small></td>
                        <td><span class="badge ${estadoBadge}"${motivoTitle}>${estadoTexto}</span></td>
                    </tr>
                `;
            });
            showNotification(`${historial.length} registros encontrados`, 'info');
        }
    } catch (err) {
        console.error('Error:', err);
        showNotification('Error al buscar asistencia', 'danger');
    }
}