let gruposAlertas = [];
let datosInasistenciaActual = [];
let datosRendimientoActual = [];

function exportarPDFAlertas(tablaId, titulo) {
    const tabla = document.getElementById(tablaId);
    if (!tabla) return;
    const select = document.getElementById('alertaGrupoSelect');
    const idx = select.selectedIndex;
    const profesor = idx > 0 ? (gruposAlertas[idx - 1]?.profesor || '') : '';
    const config = {
        margin: [10, 5, 10, 5],
        filename: tablaId + '.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };
    const div = document.createElement('div');
    const tituloCompleto = titulo + (profesor ? ' - Docente: ' + profesor : '');
    div.innerHTML = '<h4 style="text-align:center; margin-bottom:10px;">' + tituloCompleto + '</h4>' + tabla.outerHTML;
    html2pdf().set(config).from(div).save();
}

function generarWhatsApp(nombre, representante, telefono, tipo, detalle, profesor, materiaNombre, grupoNombre) {
    if (!telefono) return '';
    const tel = telefono.replace(/[^0-9]/g, '');
    const firma = profesor || 'Sistema Academico';
    const tipoLabel = tipo === 'inasistencia' ? 'inasistencia' : tipo === 'rendimiento' ? 'bajo rendimiento' : 'una observacion';
    const msg = encodeURIComponent(`Estimado/a ${representante || 'Representante'}, le informamos que el estudiante ${nombre} presenta ${tipoLabel}: ${detalle}. Atentamente, ${firma}.`);
    const msgRaw = `Estimado/a ${representante || 'Representante'}, le informamos que el estudiante ${nombre} presenta ${tipoLabel}: ${detalle}. Atentamente, ${firma}.`;
    const onClick = `registrarWhatsApp('${nombre.replace(/'/g, "\\'")}', '${(representante || '').replace(/'/g, "\\'")}', '${telefono}', '${grupoNombre.replace(/'/g, "\\'")}', '${materiaNombre.replace(/'/g, "\\'")}', '${firma.replace(/'/g, "\\'")}', '${tipo}', '${msgRaw.replace(/'/g, "\\'").replace(/\n/g, ' ')}')`;
    return `<a href="https://wa.me/593${tel}?text=${msg}" target="_blank" class="btn btn-sm btn-success" title="Enviar WhatsApp" onclick="${onClick}"><i class="fab fa-whatsapp"></i></a>`;
}

function enviarWhatsAppTutor(tipo) {
    const datos = tipo === 'inasistencia' ? datosInasistenciaActual : datosRendimientoActual;
    if (!datos || datos.length === 0) { showNotification('No hay alertas para enviar al tutor', 'warning'); return; }
    const tutorTel = datos[0].tutor_telefono;
    const tutorNom = datos[0].tutor_nombre;
    if (!tutorTel) { showNotification('Esta materia no tiene tutor asignado', 'warning'); return; }
    const materia = datos[0].nombre_materia || datos[0].nombre_grupo;
    const curso = datos[0].nombre_grupo;
    const profesor = datos[0].profesor || 'Sistema Academico';
    let detalle;
    if (tipo === 'inasistencia') {
        detalle = datos.map(d => {
            const pct = parseFloat(d.pct_ausencia) || 0;
            return `- ${d.nombres_apellidos}: ${d.ausencias} ausencias de ${d.total_clases} clases (${pct}%)`;
        }).join('%0A');
        const msg = encodeURIComponent(`Estimado/a Tutor ${tutorNom}, le informamos que en la materia ${materia} del curso ${curso} se han detectado ${datos.length} caso(s) de inasistencia:%0A${detalle}%0AAtentamente, ${profesor}.`);
        window.open(`https://wa.me/593${tutorTel.replace(/[^0-9]/g, '')}?text=${msg}`, '_blank');
    } else {
        detalle = datos.map(d => `- ${d.nombres_apellidos}: Nota Final ${d.nota_final}`).join('%0A');
        const msg = encodeURIComponent(`Estimado/a Tutor ${tutorNom}, le informamos que en la materia ${materia} del curso ${curso} se han detectado ${datos.length} caso(s) de bajo rendimiento:%0A${detalle}%0AAtentamente, ${profesor}.`);
        window.open(`https://wa.me/593${tutorTel.replace(/[^0-9]/g, '')}?text=${msg}`, '_blank');
    }
    const tablaId = tipo === 'inasistencia' ? 'tablaInasistencia' : 'tablaRendimiento';
    const titulo = tipo === 'inasistencia' ? 'Alertas de Inasistencia' : 'Alertas de Bajo Rendimiento';
    exportarPDFAlertas(tablaId, titulo);
}

async function registrarWhatsApp(estudiante, representante, telefono, grupo, materia, profesor, tipo, mensaje) {
    try {
        await fetch('/api/reportes/whatsapp/registrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ estudiante, representante, telefono, grupo_nombre: grupo, materia_nombre: materia, profesor, tipo, mensaje })
        });
    } catch (err) {
        console.error('Error al registrar mensaje:', err);
    }
}

async function cargarGruposAlertas() {
    try {
        const response = await fetch('/api/alertas/list');
        gruposAlertas = await response.json();
        poblarFiltrosAlertas(gruposAlertas);
        filtrarGrupos();
    } catch (err) {
        console.error('Error:', err);
        showNotification('Error al cargar cursos', 'danger');
    }
}

function poblarFiltrosAlertas(datos) {
    const cursos = [...new Set(datos.map(g => g.curso).filter(Boolean))].sort();
    const paralelos = [...new Set(datos.map(g => g.paralelo).filter(Boolean))].sort();
    const materias = [...new Set(datos.map(g => g.nombre_materia).filter(Boolean))].sort();
    const especialidades = [...new Set(datos.map(g => g.especialidad).filter(Boolean))].sort();

    const selCurso = document.getElementById('filtroCurso');
    const selParalelo = document.getElementById('filtroParalelo');
    const selMateria = document.getElementById('filtroMateria');
    const selEspecialidad = document.getElementById('filtroEspecialidad');

    if (selCurso) {
        cursos.forEach(c => { selCurso.innerHTML += `<option value="${c}">${c}</option>`; });
    }
    if (selParalelo) {
        paralelos.forEach(p => { selParalelo.innerHTML += `<option value="${p}">${p}</option>`; });
    }
    if (selMateria) {
        materias.forEach(m => { selMateria.innerHTML += `<option value="${m}">${m}</option>`; });
    }
    if (selEspecialidad) {
        especialidades.forEach(e => { selEspecialidad.innerHTML += `<option value="${e}">${e}</option>`; });
    }
}

function filtrarGrupos() {
    const curso = document.getElementById('filtroCurso')?.value || '';
    const paralelo = document.getElementById('filtroParalelo')?.value || '';
    const materia = document.getElementById('filtroMateria')?.value || '';
    const especialidad = document.getElementById('filtroEspecialidad')?.value || '';

    let filtrados = gruposAlertas;
    if (curso) filtrados = filtrados.filter(g => g.curso === curso);
    if (paralelo) filtrados = filtrados.filter(g => g.paralelo === paralelo);
    if (materia) filtrados = filtrados.filter(g => g.nombre_materia === materia);
    if (especialidad) filtrados = filtrados.filter(g => g.especialidad === especialidad);

    const select = document.getElementById('alertaGrupoSelect');
    select.innerHTML = '<option value="">Seleccionar curso...</option>';
    filtrados.forEach(g => {
        const option = document.createElement('option');
        option.value = g.id;
        option.textContent = `${g.nombre_materia} - ${g.curso} (${g.paralelo}) - ${g.especialidad || 'Sin especialidad'} [${g.total_estudiantes} students]`;
        select.appendChild(option);
    });
}

function limpiarFiltrosAlertas() {
    ['filtroCurso', 'filtroParalelo', 'filtroMateria', 'filtroEspecialidad'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    filtrarGrupos();
}

async function cargarAlertas() {
    const grupoId = document.getElementById('alertaGrupoSelect').value;
    if (!grupoId) {
        document.getElementById('tbodyInasistencia').innerHTML = '<tr><td colspan="9" class="text-center text-muted">Seleccione un curso</td></tr>';
        document.getElementById('tbodyRendimiento').innerHTML = '<tr><td colspan="10" class="text-center text-muted">Seleccione un curso</td></tr>';
        return;
    }
    await Promise.all([
        cargarInasistencia(grupoId),
        cargarRendimiento(grupoId)
    ]);
}

async function cargarInasistencia(grupoId) {
    const umbral = document.getElementById('umbralAusencia').value || 20;
    try {
        const response = await fetch(`/api/alertas/inasistencia/${grupoId}?porcentaje_min=${umbral}`);
        const data = await response.json();
        datosInasistenciaActual = data;
        const tbody = document.getElementById('tbodyInasistencia');
        tbody.innerHTML = '';
        const btnTutor = document.getElementById('btnTutorInasistencia');
        if (btnTutor) btnTutor.style.display = (data.length > 0 && data[0].tutor_telefono) ? '' : 'none';
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-success">No hay alertas de inasistencia</td></tr>';
            if (btnTutor) btnTutor.style.display = 'none';
            return;
        }
        data.forEach((row, i) => {
            const pct = parseFloat(row.pct_ausencia) || 0;
            let badge = 'bg-warning text-dark';
            if (pct >= 40) badge = 'bg-danger';
            else if (pct >= 30) badge = 'bg-danger';
            const whatsapp = generarWhatsApp(row.nombres_apellidos, row.representante, row.telefono_representante, 'inasistencia', `${row.ausencias} ausencias de ${row.total_clases} clases (${pct}%)`, row.profesor, row.nombre_materia, row.nombre_grupo);
            tbody.innerHTML += `
                <tr>
                    <td>${i + 1}</td>
                    <td>${row.cedula}</td>
                    <td>${nombreEstudiante(row.nombres_apellidos, row.discapacidad)}</td>
                    <td>${row.nombre_materia || row.nombre_grupo}</td>
                    <td>${row.total_clases}</td>
                    <td>${row.ausencias}</td>
                    <td class="fw-bold text-danger">${pct}%</td>
                    <td><span class="badge ${badge}">${pct >= 40 ? 'Crítica' : pct >= 30 ? 'Alta' : 'Media'}</span></td>
                    <td>${whatsapp}</td>
                </tr>
            `;
        });
        showNotification(`${data.length} alertas de inasistencia encontradas`, 'warning');
    } catch (err) {
        console.error('Error:', err);
    }
}

async function cargarRendimiento(grupoId) {
    const umbral = parseFloat(document.getElementById('umbralRendimiento').value) || 0;
    try {
        const response = await fetch(`/api/alertas/rendimiento/${grupoId}`);
        const data = await response.json();
        const tbody = document.getElementById('tbodyRendimiento');
        tbody.innerHTML = '';
        const btnTutor = document.getElementById('btnTutorRendimiento');
        if (!data.estudiantes || data.estudiantes.length === 0) {
            datosRendimientoActual = [];
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-success">No hay alertas de bajo rendimiento</td></tr>';
            if (btnTutor) btnTutor.style.display = 'none';
            return;
        }
        const filtrados = data.estudiantes.filter(e => parseFloat(e.nota_final) < umbral);
        datosRendimientoActual = filtrados;
        if (btnTutor) btnTutor.style.display = (filtrados.length > 0 && filtrados[0].tutor_telefono) ? '' : 'none';
        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-success">No hay alertas de bajo rendimiento</td></tr>';
            if (btnTutor) btnTutor.style.display = 'none';
            return;
        }
        filtrados.forEach((row, i) => {
            const nota = parseFloat(row.nota_final) || 0;
            let badge = 'bg-warning text-dark';
            if (nota < 4) badge = 'bg-danger';
            else if (nota < 5) badge = 'bg-danger';
            const whatsapp = generarWhatsApp(row.nombres_apellidos, row.representante, row.telefono_representante, 'bajo rendimiento', `Nota Final en Clase hasta la fecha: ${row.nota_final}`, row.profesor, row.nombre_materia || row.nombre_grupo, row.nombre_grupo);
            tbody.innerHTML += `
                <tr>
                    <td>${i + 1}</td>
                    <td>${row.cedula}</td>
                    <td>${nombreEstudiante(row.nombres_apellidos, row.discapacidad)}</td>
                    <td>${row.nombre_materia || row.nombre_grupo}</td>
                    <td>${row.prom_tareas}</td>
                    <td>${row.proyecto_final}</td>
                    <td>${row.examen_final}</td>
                    <td class="fw-bold text-danger">${row.nota_final}</td>
                    <td><span class="badge ${badge}">${nota < 4 ? 'Crítica' : 'Baja'}</span></td>
                    <td>${whatsapp}</td>
                </tr>
            `;
        });
        showNotification(`${filtrados.length} alertas de bajo rendimiento encontradas`, 'warning');
    } catch (err) {
        console.error('Error:', err);
    }
}

document.addEventListener('DOMContentLoaded', cargarGruposAlertas);
