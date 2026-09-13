let gruposData = [];
let materiasData = [];
let estudiantesNotas = [];
let tareasCount = 0;
let tareasNombres = {};
let porcentajes = {};
let currentGrupoId = null;
let currentTrimestre = 1;
let currentCurso = null;
let currentParalelo = null;
let currentMateriaId = null;

document.addEventListener('DOMContentLoaded', function() {
    cargarDatos();
});

async function cargarDatos() {
    try {
        const [materiasRes, pctRes] = await Promise.all([
            fetch('/api/notas/materias'),
            fetch('/api/notas/porcentajes')
        ]);
        materiasData = await materiasRes.json();
        const pctRows = await pctRes.json();
        
        pctRows.forEach(row => {
            porcentajes[row.concepto] = parseFloat(row.porcentaje);
        });
        
        document.getElementById('pct_tareas').value = porcentajes.promedio_tareas ?? 70;
        document.getElementById('pct_proyecto').value = porcentajes.proyecto ?? 15;
        document.getElementById('pct_examen').value = porcentajes.examen ?? 15;
        
        // Cargar materias en el select
        const selectMateria = document.getElementById('materia_notas');
        selectMateria.innerHTML = '<option value="">Seleccionar materia...</option>';
        
        // Agrupar materias por nombre
        const materiasUnicas = {};
        materiasData.forEach(m => {
            if (!materiasUnicas[m.nombre_materia]) {
                materiasUnicas[m.nombre_materia] = m.nombre_materia;
            }
        });
        
        Object.keys(materiasUnicas).sort().forEach(nombre => {
            const option = document.createElement('option');
            option.value = nombre;
            option.textContent = nombre;
            selectMateria.appendChild(option);
        });
        
        // Cargar selectores de porcentajes
        const selectMateriaPct = document.getElementById('pct_materia');
        selectMateriaPct.innerHTML = '<option value="">Seleccionar...</option>';
        Object.keys(materiasUnicas).sort().forEach(nombre => {
            const option = document.createElement('option');
            option.value = nombre;
            option.textContent = nombre;
            selectMateriaPct.appendChild(option);
        });
        
        // Cargar cursos únicos
        const selectCursoPct = document.getElementById('pct_curso');
        selectCursoPct.innerHTML = '<option value="">Seleccionar...</option>';
        const cursosUnicos = [...new Set(materiasData.map(m => m.curso))].sort();
        cursosUnicos.forEach(curso => {
            const option = document.createElement('option');
            option.value = curso;
            option.textContent = curso;
            selectCursoPct.appendChild(option);
        });
        
        // Cargar paralelos únicos
        const selectParaleloPct = document.getElementById('pct_paralelo');
        selectParaleloPct.innerHTML = '<option value="">Seleccionar...</option>';
        const paralelosUnicos = [...new Set(materiasData.map(m => m.paralelo).filter(Boolean))].sort();
        paralelosUnicos.forEach(par => {
            const option = document.createElement('option');
            option.value = par;
            option.textContent = par;
            selectParaleloPct.appendChild(option);
        });
        
        // Cargar especialidades únicas
        const selectEspecialidadPct = document.getElementById('pct_especialidad');
        selectEspecialidadPct.innerHTML = '<option value="">Ninguna</option>';
        const especialidadesUnicas = [...new Set(materiasData.map(m => m.especialidad).filter(Boolean))].sort();
        especialidadesUnicas.forEach(esp => {
            const option = document.createElement('option');
            option.value = esp;
            option.textContent = esp;
            selectEspecialidadPct.appendChild(option);
        });
    } catch (err) {
        console.error('Error:', err);
        showNotification('Error al cargar datos', 'danger');
    }
}

function cargarCursosPorMateria() {
    const nombreMateria = document.getElementById('materia_notas').value;
    const selectCurso = document.getElementById('grupo_notas');
    
    if (!nombreMateria) {
        selectCurso.innerHTML = '<option value="">Seleccionar curso...</option>';
        document.getElementById('tablaNotasCard').style.display = 'none';
        return;
    }
    
    // Filtrar cursos por materia seleccionada
    const cursosFiltrados = materiasData.filter(m => m.nombre_materia === nombreMateria);
    
    selectCurso.innerHTML = '<option value="">Seleccionar curso...</option>';
    cursosFiltrados.forEach(m => {
        const option = document.createElement('option');
        option.value = `${m.curso}_${m.paralelo}_${m.id}`;
        option.textContent = `${m.curso} - ${m.paralelo}${m.especialidad ? ' (' + m.especialidad + ')' : ''}`;
        selectCurso.appendChild(option);
    });
}

// Cargar porcentajes automáticamente para una materia+curso+paralelo+especialidad (sin UI)
async function cargarPorcentajesAutomatico(materiaId, curso, paralelo, especialidad) {
    try {
        let url = `/api/notas/porcentajes/config?materia_id=${materiaId}&curso=${encodeURIComponent(curso)}&paralelo=${encodeURIComponent(paralelo)}`;
        if (especialidad) url += `&especialidad=${encodeURIComponent(especialidad)}`;
        
        const res = await fetch(url);
        const data = await res.json();
        if (data.global) {
            // Usar globales
            data.porcentajes.forEach(row => {
                porcentajes[row.concepto] = parseFloat(row.porcentaje);
            });
        } else {
            // Usar específicos
            porcentajes = {
                promedio_tareas: parseFloat(data.promedio_tareas) ?? 70,
                proyecto: parseFloat(data.proyecto) ?? 15,
                examen: parseFloat(data.examen) ?? 15
            };
        }
    } catch (err) {
        console.error('Error cargando porcentajes automáticos:', err);
    }
}

async function cargarPorcentajesConfig() {
    const nombreMateria = document.getElementById('pct_materia').value;
    const curso = document.getElementById('pct_curso').value;
    const paralelo = document.getElementById('pct_paralelo').value;
    const especialidad = document.getElementById('pct_especialidad').value;
    const badge = document.getElementById('badgePorcentajes');
    
    if (!nombreMateria || !curso || !paralelo) {
        // Cargar porcentajes globales
        try {
            const res = await fetch('/api/notas/porcentajes');
            const data = await res.json();
            data.forEach(row => {
                porcentajes[row.concepto] = parseFloat(row.porcentaje);
            });
            document.getElementById('pct_tareas').value = porcentajes.promedio_tareas ?? 70;
            document.getElementById('pct_proyecto').value = porcentajes.proyecto ?? 15;
            document.getElementById('pct_examen').value = porcentajes.examen ?? 15;
            badge.style.display = 'none';
        } catch (err) {}
        return;
    }
    
    // Buscar materia_id por nombre + curso + paralelo + especialidad
    const materia = materiasData.find(m => m.nombre_materia === nombreMateria && m.curso === curso && m.paralelo === paralelo && (m.especialidad || '') === (especialidad || ''));
    if (!materia) return;
    
    try {
        let url = `/api/notas/porcentajes/config?materia_id=${materia.id}&curso=${encodeURIComponent(curso)}&paralelo=${encodeURIComponent(paralelo)}`;
        if (especialidad) url += `&especialidad=${encodeURIComponent(especialidad)}`;
        
        const res = await fetch(url);
        const data = await res.json();
        if (data.global) {
            data.porcentajes.forEach(row => {
                porcentajes[row.concepto] = parseFloat(row.porcentaje);
            });
            document.getElementById('pct_tareas').value = porcentajes.promedio_tareas ?? 70;
            document.getElementById('pct_proyecto').value = porcentajes.proyecto ?? 15;
            document.getElementById('pct_examen').value = porcentajes.examen ?? 15;
            badge.style.display = 'inline';
            badge.textContent = 'Usando porcentajes globales';
        } else {
            porcentajes = {
                promedio_tareas: parseFloat(data.promedio_tareas) ?? 70,
                proyecto: parseFloat(data.proyecto) ?? 15,
                examen: parseFloat(data.examen) ?? 15
            };
            document.getElementById('pct_tareas').value = porcentajes.promedio_tareas;
            document.getElementById('pct_proyecto').value = porcentajes.proyecto;
            document.getElementById('pct_examen').value = porcentajes.examen;
            badge.style.display = 'inline';
            badge.textContent = 'Personalizados';
        }
    } catch (err) {}
}

function limpiarPorcentajes() {
    document.getElementById('pct_materia').value = '';
    document.getElementById('pct_curso').value = '';
    document.getElementById('pct_paralelo').value = '';
    document.getElementById('pct_especialidad').value = '';
    document.getElementById('badgePorcentajes').style.display = 'none';
    // Recargar porcentajes globales
    cargarPorcentajesConfig();
}

async function guardarPorcentajes() {
    const pctTareas = document.getElementById('pct_tareas').value;
    const pctProyecto = document.getElementById('pct_proyecto').value;
    const pctExamen = document.getElementById('pct_examen').value;
    const nombreMateria = document.getElementById('pct_materia').value;
    const curso = document.getElementById('pct_curso').value;
    const paralelo = document.getElementById('pct_paralelo').value;
    const especialidad = document.getElementById('pct_especialidad').value;
    
    const total = parseFloat(pctTareas) + parseFloat(pctProyecto) + parseFloat(pctExamen);
    
    if (total !== 100) {
        if (!confirm(`La suma de porcentajes es ${total}%, ¿desea continuar?`)) return;
    }
    
    try {
        let url, method;
        if (nombreMateria && curso && paralelo) {
            const materia = materiasData.find(m => m.nombre_materia === nombreMateria && m.curso === curso && m.paralelo === paralelo && (m.especialidad || '') === (especialidad || ''));
            if (!materia) return;
            url = '/api/notas/porcentajes/config';
            method = 'POST';
        } else {
            url = '/api/notas/porcentajes';
            method = 'PUT';
        }
        
        const body = method === 'POST' ? {
            materia_id: materiasData.find(m => m.nombre_materia === nombreMateria && m.curso === curso && m.paralelo === paralelo && (m.especialidad || '') === (especialidad || ''))?.id,
            curso, paralelo, especialidad: especialidad || null,
            promedio_tareas: parseFloat(pctTareas),
            proyecto: parseFloat(pctProyecto),
            examen: parseFloat(pctExamen)
        } : {
            promedio_tareas: parseFloat(pctTareas),
            proyecto: parseFloat(pctProyecto),
            examen: parseFloat(pctExamen)
        };
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        
        const data = await response.json();
        if (response.ok) {
            showNotification(method === 'POST' ? 'Porcentajes guardados para esta configuración' : 'Porcentajes globales guardados', 'success');
            porcentajes = {
                promedio_tareas: parseFloat(pctTareas),
                proyecto: parseFloat(pctProyecto),
                examen: parseFloat(pctExamen)
            };
            cargarTablaNotas();
        } else {
            showNotification(data.error || 'Error', 'danger');
        }
    } catch (err) {
        showNotification('Error de conexión', 'danger');
    }
}

function cargarEstudiantesNotas() {
    const cursoVal = document.getElementById('grupo_notas').value;
    const trimestreVal = document.getElementById('trimestre_notas').value;
    
    if (!cursoVal) {
        document.getElementById('tablaNotasCard').style.display = 'none';
        return;
    }
    
    const [curso, paralelo, materiaId] = cursoVal.split('_');
    currentCurso = curso;
    currentParalelo = paralelo;
    currentMateriaId = parseInt(materiaId);
    currentGrupoId = cursoVal;
    currentTrimestre = trimestreVal;
    tareasCount = 0;
    tareasNombres = {};
    
    // Buscar especialidad de la materia seleccionada
    const materiaInfo = materiasData.find(m => m.id === currentMateriaId);
    const especialidad = materiaInfo ? (materiaInfo.especialidad || '') : '';
    
    // Auto-seleccionar dropdowns de configuración
    if (materiaInfo) {
        document.getElementById('pct_materia').value = materiaInfo.nombre_materia;
        document.getElementById('pct_curso').value = curso;
        document.getElementById('pct_paralelo').value = paralelo;
        document.getElementById('pct_especialidad').value = especialidad;
    }
    
    // Cargar porcentajes automáticamente para esta configuración
    cargarPorcentajesAutomatico(currentMateriaId, curso, paralelo, especialidad).then(() => {
        // Actualizar inputs de porcentajes en la UI
        document.getElementById('pct_tareas').value = porcentajes.promedio_tareas ?? 70;
        document.getElementById('pct_proyecto').value = porcentajes.proyecto ?? 15;
        document.getElementById('pct_examen').value = porcentajes.examen ?? 15;
        
        // Mostrar badge si hay config específica
        const badge = document.getElementById('badgePorcentajes');
        badge.style.display = 'inline';
        badge.textContent = 'Aplicado a este grupo';
        badge.className = 'badge bg-success';
        
        const esPromFinal = trimestreVal === 'final';
        document.getElementById('btnAgregarTarea').style.display = esPromFinal ? 'none' : 'inline-block';
        document.getElementById('btnGuardarNotas').style.display = esPromFinal ? 'none' : 'inline-block';
        
        document.getElementById('tablaNotasCard').style.display = 'block';
        cargarTablaNotas();
    });
}

function agregarColumnaTarea() {
    tareasCount++;
    tareasNombres[tareasCount] = `T${tareasCount}`;
    cargarTablaNotas();
    showNotification(`Tarea T${tareasCount} agregada`, 'info');
}

function eliminarColumnaTarea(num) {
    if (!confirm(`¿Eliminar la tarea ${tareasNombres[num] || 'T' + num}? Se eliminarán todas las notas de esta columna.`)) return;
    
    // Eliminar de la BD
    fetch(`/api/notas/tarea-indice/${currentGrupoId}/${currentTrimestre}/${num - 1}`, { method: 'DELETE' })
        .then(res => res.json())
        .then(data => {
            showNotification(data.message || 'Tarea eliminada', 'info');
        })
        .catch(err => console.error('Error eliminando tarea:', err));
    
    // Shift names down
    for (let i = num; i < tareasCount; i++) {
        tareasNombres[i] = tareasNombres[i + 1];
    }
    delete tareasNombres[tareasCount];
    tareasCount--;
    cargarTablaNotas();
}

function renombrarTarea(num) {
    const nombre = prompt(`Nombre de la tarea:`, tareasNombres[num] || `T${num}`);
    if (nombre !== null && nombre.trim() !== '') {
        tareasNombres[num] = nombre.trim();
        guardarNombresTareas();
        cargarTablaNotas();
    }
}

function guardarNombresTareas() {
    const key = `tareas_${currentGrupoId}_${currentTrimestre}`;
    localStorage.setItem(key, JSON.stringify(tareasNombres));
}

function cargarNombresTareas() {
    const key = `tareas_${currentGrupoId}_${currentTrimestre}`;
    const guardados = localStorage.getItem(key);
    if (guardados) {
        tareasNombres = JSON.parse(guardados);
    }
}

function colorNotaValor(v) {
    if (v <= 0) return 'fw-bold';
    if (v <= 4) return 'fw-bold text-danger';
    if (v <= 6.99) return 'fw-bold text-pink';
    return 'fw-bold text-success';
}

async function cargarTablaNotas() {
    const tbody = document.getElementById('tablaNotasEstudiantes');
    tbody.innerHTML = '';
    
    const esPromFinal = currentTrimestre === 'final';
    
    try {
        const estudiantesRes = await fetch(`/api/notas/curso/${encodeURIComponent(currentCurso)}/paralelo/${encodeURIComponent(currentParalelo)}/materia/${currentMateriaId}/estudiantes`);
        const estudiantes = await estudiantesRes.json();
        estudiantesNotas = estudiantes;
        
        if (estudiantes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">No hay estudiantes en este grupo</td></tr>';
            return;
        }

        if (esPromFinal) {
            // Promedio Final: cargar notas de los 3 trimestres y calcular promedio
            const thead = document.getElementById('tablaNotasHead');
            thead.innerHTML = `
                <tr>
                    <th>Estudiante</th>
                    <th class="text-center">T1</th>
                    <th class="text-center">T2</th>
                    <th class="text-center">T3</th>
                    <th class="text-center bg-success-subtle text-dark">Promedio Final</th>
                    <th class="text-center bg-success-subtle text-dark">Aprendizajes</th>
                    <th class="text-center bg-warning-subtle text-dark">Supletorio</th>
                    <th class="text-center bg-danger-subtle text-dark">Pérdida</th>
                </tr>
            `;

            const avgT1 = [], avgT2 = [], avgT3 = [], avgPF = [];
            let supletCount = 0, perdidaCount = 0;

            for (const est of estudiantes) {
                const esInactivoPF = est.activo === 0;
                const promediosTrimestrales = [0, 0, 0];
                await Promise.all([1, 2, 3].map(async (t) => {
                    try {
                        const notasRes = await fetch(`/api/notas/grupo/${est.grupo_id}/trimestre/${t}`);
                        const notas = await notasRes.json();
                        
                        const tareas = notas.filter(n => n.tipo === 'tarea');
                        const proyectos = notas.filter(n => n.tipo === 'proyecto');
                        const examenes = notas.filter(n => n.tipo === 'examen');
                        
                        const tareasConNota = tareas.filter(t => t.nota !== null);
                        const promTareas = tareasConNota.length > 0 ? tareasConNota.reduce((s, t) => s + parseFloat(t.nota), 0) / tareasConNota.length : 0;
                        
                        const proyNota = proyectos.filter(p => p.indice === 0).map(p => parseFloat(p.nota) || 0);
                        const proyDR = proyectos.filter(p => p.indice === 1).map(p => parseFloat(p.nota) || 0);
                        const proyPR = proyectos.filter(p => p.indice === 2).map(p => parseFloat(p.nota) || 0);
                        const nP = proyNota.length > 0 ? proyNota[0] : 0;
                        const dr = proyDR.length > 0 ? proyDR[0] : 0;
                        const pr = proyPR.length > 0 ? proyPR[0] : 0;
                        const proyFinal = proyNota.length > 0 ? Math.max(nP, (nP + dr + pr) / 3) : 0;
                        
                        const examNota = examenes.filter(e => e.indice === 0).map(e => parseFloat(e.nota) || 0);
                        const examDRE = examenes.filter(e => e.indice === 1).map(e => parseFloat(e.nota) || 0);
                        const examER = examenes.filter(e => e.indice === 2).map(e => parseFloat(e.nota) || 0);
                        const nE = examNota.length > 0 ? examNota[0] : 0;
                        const dre = examDRE.length > 0 ? examDRE[0] : 0;
                        const er = examER.length > 0 ? examER[0] : 0;
                        const examFinal = examNota.length > 0 ? Math.max(nE, (nE + dre + er) / 3) : 0;
                        
                        // Calcular nota del trimestre solo con componentes que tienen porcentaje > 0
                        const pctTLocal = porcentajes.promedio_tareas ?? 0;
                        const pctPLocal = porcentajes.proyecto ?? 0;
                        const pctELocal = porcentajes.examen ?? 0;
                        const totalPctLocal = pctTLocal + pctPLocal + pctELocal;
                        
                        let notaTrim = 0;
                        if (totalPctLocal > 0) {
                            let sumaLocal = 0;
                            let divLocal = 0;
                            if (pctTLocal > 0 && promTareas > 0) { sumaLocal += promTareas * pctTLocal / 100; divLocal += pctTLocal; }
                            if (pctPLocal > 0 && proyFinal > 0) { sumaLocal += proyFinal * pctPLocal / 100; divLocal += pctPLocal; }
                            if (pctELocal > 0 && examFinal > 0) { sumaLocal += examFinal * pctELocal / 100; divLocal += pctELocal; }
                            const todosOk = (pctTLocal === 0 || promTareas > 0) && (pctPLocal === 0 || proyFinal > 0) && (pctELocal === 0 || examFinal > 0);
                            if (todosOk && divLocal > 0) {
                                notaTrim = divLocal === 100 ? sumaLocal : sumaLocal * 100 / divLocal;
                            }
                        }
                        promediosTrimestrales[t - 1] = notaTrim;
                        if (t === 1) avgT1.push(notaTrim);
                        else if (t === 2) avgT2.push(notaTrim);
                        else avgT3.push(notaTrim);
                    } catch (err) {
                        promediosTrimestrales[t - 1] = 0;
                    }
                }));
                
                const tieneAlgunaNota = promediosTrimestrales.some(n => n > 0);
                const promedioFinal = tieneAlgunaNota ? promediosTrimestrales.reduce((a, b) => a + b, 0) / promediosTrimestrales.filter(n => n > 0).length : 0;
                if (!esInactivoPF) {
                    avgPF.push(promedioFinal);
                    if (promedioFinal >= 4.01 && promedioFinal <= 6.99) supletCount++;
                    else if (promedioFinal > 0 && promedioFinal < 4) perdidaCount++;
                }
                
                let aprendizaje = '';
                if (promedioFinal > 0) {
                    if (promedioFinal <= 4) aprendizaje = 'No alcanza';
                    else if (promedioFinal <= 6.99) aprendizaje = 'Próximos a alcanzar';
                    else if (promedioFinal <= 8.99) aprendizaje = 'Alcanzan';
                    else aprendizaje = 'Domina';
                }
                
                const row = `
                    <tr style="${esInactivoPF ? 'opacity:0.5;background:#e9ecef' : ''}">
                        <td>${nombreEstudiante(est.nombres_apellidos, est.discapacidad)}${esInactivoPF ? ' <span class="badge bg-secondary">INACTIVO</span>' : ''}</td>
                        <td class="text-center fw-bold ${colorNotaValor(promediosTrimestrales[0])}">${promediosTrimestrales[0] > 0 ? promediosTrimestrales[0].toFixed(2) : '-'}</td>
                        <td class="text-center fw-bold ${colorNotaValor(promediosTrimestrales[1])}">${promediosTrimestrales[1] > 0 ? promediosTrimestrales[1].toFixed(2) : '-'}</td>
                        <td class="text-center fw-bold ${colorNotaValor(promediosTrimestrales[2])}">${promediosTrimestrales[2] > 0 ? promediosTrimestrales[2].toFixed(2) : '-'}</td>
                        <td class="text-center fw-bold bg-success-subtle ${colorNotaValor(promedioFinal)}">${promedioFinal > 0 ? promedioFinal.toFixed(2) : '-'}</td>
                        <td class="text-center bg-success-subtle fw-bold">${aprendizaje}</td>
                        <td class="text-center bg-warning-subtle fw-bold">${promedioFinal >= 4.01 && promedioFinal <= 6.99 ? 'X' : ''}</td>
                        <td class="text-center bg-danger-subtle fw-bold">${promedioFinal > 0 && promedioFinal < 4 ? 'X' : ''}</td>
                    </tr>
                `;
                tbody.innerHTML += row;
            }

            const avg = arr => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '0.00';
            tbody.innerHTML += `
                <tr class="table-secondary fw-bold">
                    <td>PROMEDIOS</td>
                    <td class="text-center">${avg(avgT1)}</td>
                    <td class="text-center">${avg(avgT2)}</td>
                    <td class="text-center">${avg(avgT3)}</td>
                    <td class="text-center">${avg(avgPF)}</td>
                    <td></td>
                    <td class="text-center">${supletCount}</td>
                    <td class="text-center">${perdidaCount}</td>
                </tr>
            `;
            return;
        }

        // Trimestre normal (1, 2 o 3) - fetch paralelo por estudiante
        const notasExistentes = {};
        await Promise.all(estudiantes.map(async (est) => {
            try {
                const notasRes = await fetch(`/api/notas/grupo/${est.grupo_id}/trimestre/${currentTrimestre}`);
                notasExistentes[est.id] = await notasRes.json();
            } catch (err) {
                notasExistentes[est.id] = [];
            }
        }));

        // Detectar tareas existentes en BD y mezclar con nombres guardados
        if (tareasCount === 0) {
            const primerEst = estudiantes[0]?.id;
            if (primerEst && notasExistentes[primerEst]) {
                const tareasBD = notasExistentes[primerEst].filter(n => n.tipo === 'tarea');
                if (tareasBD.length > 0) {
                    const maxIndice = Math.max(...tareasBD.map(t => t.indice || 0));
                    tareasCount = maxIndice + 1;
                }
            }
        }
        
        // Cargar nombres de tareas desde localStorage
        cargarNombresTareas();
        for (let i = 1; i <= tareasCount; i++) {
            if (!tareasNombres[i]) tareasNombres[i] = `T${i}`;
        }
        guardarNombresTareas();
        
        // Actualizar nombre del grupo seleccionado
        const select = document.getElementById('grupo_notas');
        if (select.selectedIndex >= 0) {
            document.getElementById('nombreGrupoSeleccionado').textContent = select.options[select.selectedIndex].text;
        }

        // Build header - ocultar columnas con 0%
        const thead = document.getElementById('tablaNotasHead');
        let headerRow1 = '<th>Estudiante</th>';
        let headerRow2 = '<th></th>';
        
        const pctT = porcentajes.promedio_tareas ?? 0;
        const pctP = porcentajes.proyecto ?? 0;
        const pctE = porcentajes.examen ?? 0;
        
        if (pctT > 0) {
            if (tareasCount > 0) {
                headerRow1 += `<th class="text-center" colspan="${tareasCount + 2}">Notas Clase</th>`;
                for (let i = 1; i <= tareasCount; i++) {
                    const nombre = tareasNombres[i] || `T${i}`;
                    headerRow2 += `<th class="text-center" style="min-width:50px">
                        <div style="writing-mode:vertical-lr;transform:rotate(180deg);white-space:nowrap">
                            <small class="fw-bold">${nombre}</small>
                        </div>
                        <div class="btn-group btn-group-sm mt-1" style="font-size:10px">
                            <button class="btn btn-outline-light btn-sm py-0 px-1" onclick="renombrarTarea(${i})" title="Renombrar"><i class="fas fa-pen"></i></button>
                            <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="eliminarColumnaTarea(${i})" title="Eliminar"><i class="fas fa-times"></i></button>
                        </div>
                    </th>`;
                }
                headerRow2 += `<th class="text-center" style="min-width:35px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)">Promedio Clase</div></th>`;
                headerRow2 += `<th class="text-center" style="min-width:35px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)">${pctT}%</div></th>`;
            } else {
                headerRow1 += `<th class="text-center" colspan="3">Notas Clase ${pctT}%</th>`;
                headerRow2 += `<th class="text-center"></th>`;
                headerRow2 += `<th class="text-center" style="min-width:35px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)">Promedio Clase</div></th>`;
                headerRow2 += `<th class="text-center" style="min-width:35px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)">${pctT}%</div></th>`;
            }
        } else {
            headerRow1 += `<th class="text-center text-muted" colspan="3"><s>Notas Clase 0%</s></th>`;
            headerRow2 += `<th class="text-center text-muted" style="min-width:35px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)"><s>Prom.</s></div></th>`;
            headerRow2 += `<th class="text-center text-muted" style="min-width:35px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)"><s>0%</s></div></th>`;
        }
        
        if (pctP > 0) {
            headerRow1 += '<th class="text-center table-info" colspan="5">Proyecto</th>';
            headerRow2 += '<th class="text-center table-info" style="min-width:45px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)">Nota Proyecto</div></th>';
            headerRow2 += '<th class="text-center table-info" style="min-width:45px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)">Deber Rec. Proy.</div></th>';
            headerRow2 += '<th class="text-center table-info" style="min-width:45px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)">Proyecto Recup.</div></th>';
            headerRow2 += '<th class="text-center table-info" style="min-width:45px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)">Proyecto Final</div></th>';
            headerRow2 += `<th class="text-center table-info" style="min-width:35px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)">${pctP}%</div></th>`;
        } else {
            headerRow1 += '<th class="text-center text-muted" colspan="5"><s>Proyecto 0%</s></th>';
            headerRow2 += '<th class="text-center text-muted"><div style="writing-mode:vertical-lr;transform:rotate(180deg)"><s>Proy.</s></div></th>';
            headerRow2 += '<th class="text-center text-muted"><div style="writing-mode:vertical-lr;transform:rotate(180deg)"><s>D.R.</s></div></th>';
            headerRow2 += '<th class="text-center text-muted"><div style="writing-mode:vertical-lr;transform:rotate(180deg)"><s>Rec.</s></div></th>';
            headerRow2 += '<th class="text-center text-muted"><div style="writing-mode:vertical-lr;transform:rotate(180deg)"><s>Final</s></div></th>';
            headerRow2 += '<th class="text-center text-muted"><div style="writing-mode:vertical-lr;transform:rotate(180deg)"><s>0%</s></div></th>';
        }
        
        if (pctE > 0) {
            headerRow1 += '<th class="text-center table-warning" colspan="5">Examen</th>';
            headerRow2 += '<th class="text-center table-warning" style="min-width:45px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)">Nota Examen</div></th>';
            headerRow2 += '<th class="text-center table-warning" style="min-width:45px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)">Deber Rec. Exa.</div></th>';
            headerRow2 += '<th class="text-center table-warning" style="min-width:45px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)">Examen Rec.</div></th>';
            headerRow2 += '<th class="text-center table-warning" style="min-width:45px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)">Examen Final</div></th>';
            headerRow2 += `<th class="text-center table-warning" style="min-width:35px"><div style="writing-mode:vertical-lr;transform:rotate(180deg)">${pctE}%</div></th>`;
        } else {
            headerRow1 += '<th class="text-center text-muted" colspan="5"><s>Examen 0%</s></th>';
            headerRow2 += '<th class="text-center text-muted"><div style="writing-mode:vertical-lr;transform:rotate(180deg)"><s>Exa.</s></div></th>';
            headerRow2 += '<th class="text-center text-muted"><div style="writing-mode:vertical-lr;transform:rotate(180deg)"><s>D.R.</s></div></th>';
            headerRow2 += '<th class="text-center text-muted"><div style="writing-mode:vertical-lr;transform:rotate(180deg)"><s>Rec.</s></div></th>';
            headerRow2 += '<th class="text-center text-muted"><div style="writing-mode:vertical-lr;transform:rotate(180deg)"><s>Final</s></div></th>';
            headerRow2 += '<th class="text-center text-muted"><div style="writing-mode:vertical-lr;transform:rotate(180deg)"><s>0%</s></div></th>';
        }
        
        headerRow1 += '<th class="text-center bg-success-subtle text-dark">Nota Final</th>';
        headerRow2 += '<th class="text-center bg-success-subtle text-dark"></th>';
        headerRow1 += '<th class="text-center bg-success-subtle text-dark">Aprendizajes</th>';
        headerRow2 += '<th class="text-center bg-success-subtle text-dark"></th>';

        thead.innerHTML = `<tr>${headerRow1}</tr><tr>${headerRow2}</tr>`;

        // Build rows
        for (const est of estudiantes) {
            const notas = notasExistentes[est.id] || [];
            const tareas = notas.filter(n => n.tipo === 'tarea');
            const tareasPorIndice = {};
            tareas.forEach(t => { tareasPorIndice[t.indice || 0] = t; });
            const proyectos = notas.filter(n => n.tipo === 'proyecto');
            const proyectosPorIndice = {};
            proyectos.forEach(p => { proyectosPorIndice[p.indice || 0] = p; });
            const examenes = notas.filter(n => n.tipo === 'examen');
            const examenesPorIndice = {};
            examenes.forEach(e => { examenesPorIndice[e.indice || 0] = e; });

            let taskInputs = '';
            const esInactivo = est.activo === 0;
            const disabledAttr = esInactivo ? 'disabled' : '';
            const estiloInactivo = esInactivo ? 'opacity:0.5;background:#e9ecef' : '';
            const estiloBloqueado = 'opacity:0.4;background:#e9ecef;pointer-events:none;';
            const disabledTareas = (pctT === 0) ? 'disabled' : disabledAttr;
            const disabledProy = (pctP === 0) ? 'disabled' : disabledAttr;
            const disabledExam = (pctE === 0) ? 'disabled' : disabledAttr;
            const estiloTareas = (pctT === 0) ? estiloBloqueado : estiloInactivo;
            const estiloProy = (pctP === 0) ? estiloBloqueado : estiloInactivo;
            const estiloExam = (pctE === 0) ? estiloBloqueado : estiloInactivo;
            
            for (let i = 0; i < tareasCount; i++) {
                const t = tareasPorIndice[i];
                const val = t ? parseFloat(t.nota).toFixed(1) : '';
                const tareaId = t ? t.id : '';
                const comentario = t && t.comentario ? t.comentario : '';
                const tieneComentario = comentario ? 'text-warning' : '';
                taskInputs += `<td class="text-center position-relative" style="${estiloTareas}">
                    <input type="number" class="form-control form-control-sm nota-input text-center" style="width:60px" min="0" max="10" step="0.1" value="${val}" data-tipo="tarea" data-idx="${i}" data-estudiante="${est.id}" data-nota-id="${tareaId}" onchange="calcularFila(this)" ${disabledTareas}>
                    <i class="fas fa-comment ${tieneComentario} position-absolute btn-comentario" style="top:2px;right:2px;font-size:10px;cursor:pointer"
                        data-nota-id="${tareaId}"
                        data-estudiante="${est.nombres_apellidos}"
                        data-tipo="T${i + 1}"
                        data-comentario="${comentario}"
                        onclick="abrirComentario(this)"></i>
                </td>`;
            }

            const tareasConNota = Object.values(tareasPorIndice).filter(t => t.nota !== null && t.nota !== undefined);
            const promTareas = tareasConNota.length > 0 && tareasCount > 0 ? (tareasConNota.reduce((s, t) => s + parseFloat(t.nota), 0) / tareasCount).toFixed(2) : '';
            const pctTareasVal = promTareas ? (parseFloat(promTareas) * porcentajes.promedio_tareas / 100).toFixed(2) : '';
            
            const proyNota = proyectosPorIndice[0] ? parseFloat(proyectosPorIndice[0].nota).toFixed(1) : '';
            const proyNotaId = proyectosPorIndice[0] ? proyectosPorIndice[0].id : '';
            const proyNotaCom = proyectosPorIndice[0] && proyectosPorIndice[0].comentario ? proyectosPorIndice[0].comentario : '';
            const tieneProyNotaCom = proyNotaCom ? 'text-warning' : '';

            const proyDeberRec = proyectosPorIndice[1] ? parseFloat(proyectosPorIndice[1].nota).toFixed(1) : '';
            const proyDeberRecId = proyectosPorIndice[1] ? proyectosPorIndice[1].id : '';

            const proyRec = proyectosPorIndice[2] ? parseFloat(proyectosPorIndice[2].nota).toFixed(1) : '';
            const proyRecId = proyectosPorIndice[2] ? proyectosPorIndice[2].id : '';

            const proyFinalVals = [proyNota, proyDeberRec, proyRec].filter(v => v !== '');
            const proyProm = proyFinalVals.length > 0 ? proyFinalVals.reduce((s, v) => s + parseFloat(v), 0) / proyFinalVals.length : 0;
            const proyFinal = (proyNota !== '' && proyProm < parseFloat(proyNota)) ? proyNota : (proyProm > 0 ? proyProm.toFixed(2) : '');
            const pctProyVal = proyFinal ? (parseFloat(proyFinal) * porcentajes.proyecto / 100).toFixed(2) : '';
            
            const examNota = examenesPorIndice[0] ? parseFloat(examenesPorIndice[0].nota).toFixed(1) : '';
            const examNotaId = examenesPorIndice[0] ? examenesPorIndice[0].id : '';
            const examNotaCom = examenesPorIndice[0] && examenesPorIndice[0].comentario ? examenesPorIndice[0].comentario : '';
            const tieneExamNotaCom = examNotaCom ? 'text-warning' : '';

            const examDre = examenesPorIndice[1] ? parseFloat(examenesPorIndice[1].nota).toFixed(1) : '';
            const examDreId = examenesPorIndice[1] ? examenesPorIndice[1].id : '';

            const examEr = examenesPorIndice[2] ? parseFloat(examenesPorIndice[2].nota).toFixed(1) : '';
            const examErId = examenesPorIndice[2] ? examenesPorIndice[2].id : '';

            const examFinalVals = [examNota, examDre, examEr].filter(v => v !== '');
            const examProm = examFinalVals.length > 0 ? examFinalVals.reduce((s, v) => s + parseFloat(v), 0) / examFinalVals.length : 0;
            const examFinal = (examNota !== '' && examProm < parseFloat(examNota)) ? examNota : (examProm > 0 ? examProm.toFixed(2) : '');
            const pctExamVal = examFinal ? (parseFloat(examFinal) * porcentajes.examen / 100).toFixed(2) : '';
            
            const tieneProy = proyFinal !== '';
            const tieneExam = examFinal !== '';
            let notaFinal = 0;
            let notaFinalCompleta = false;
            if (pctT > 0 && pctP > 0 && pctE > 0) {
                if (tieneProy && tieneExam && promTareas) {
                    notaFinal = parseFloat(pctTareasVal) + parseFloat(pctProyVal) + parseFloat(pctExamVal);
                    notaFinalCompleta = true;
                }
            } else if (pctT > 0 && pctP > 0 && pctE === 0) {
                if (tieneProy && promTareas) {
                    const totalPct = pctT + pctP;
                    notaFinal = (parseFloat(pctTareasVal) + parseFloat(pctProyVal)) * 100 / totalPct;
                    notaFinalCompleta = true;
                }
            } else if (pctT > 0 && pctP === 0 && pctE > 0) {
                if (tieneExam && promTareas) {
                    const totalPct = pctT + pctE;
                    notaFinal = (parseFloat(pctTareasVal) + parseFloat(pctExamVal)) * 100 / totalPct;
                    notaFinalCompleta = true;
                }
            } else if (pctT === 0 && pctP > 0 && pctE > 0) {
                if (tieneProy && tieneExam) {
                    const totalPct = pctP + pctE;
                    notaFinal = (parseFloat(pctProyVal) + parseFloat(pctExamVal)) * 100 / totalPct;
                    notaFinalCompleta = true;
                }
            } else if (pctT > 0 && pctP === 0 && pctE === 0) {
                if (promTareas) {
                    notaFinal = promTareas;
                    notaFinalCompleta = true;
                }
            } else if (pctT === 0 && pctP > 0 && pctE === 0) {
                if (tieneProy) {
                    notaFinal = proyFinal;
                    notaFinalCompleta = true;
                }
            } else if (pctT === 0 && pctP === 0 && pctE > 0) {
                if (tieneExam) {
                    notaFinal = examFinal;
                    notaFinalCompleta = true;
                }
            }
            const notaFinalStr = notaFinalCompleta ? notaFinal.toFixed(2) : '-';
            const notaFinalClass = colorNotaValor(notaFinalCompleta ? notaFinal : 0);

            let aprendizaje = '';
            if (notaFinalCompleta) {
                if (notaFinal <= 4) aprendizaje = 'No alcanza';
                else if (notaFinal <= 6.99) aprendizaje = 'Próximos a alcanzar';
                else if (notaFinal <= 8.99) aprendizaje = 'Alcanzan';
                else aprendizaje = 'Domina';
            }

            const row = `
                <tr data-estudiante="${est.id}" data-grupo-id="${est.grupo_id}" data-activo="${est.activo}" style="${estiloInactivo}">
                    <td>${nombreEstudiante(est.nombres_apellidos, est.discapacidad)}${esInactivo ? ' <span class="badge bg-secondary">INACTIVO</span>' : ''}</td>
                    ${taskInputs}
                    <td class="text-center fw-bold prom-tareas ${pctT > 0 ? colorNotaValor(promTareas) : 'text-muted'}" data-est="${est.id}">${pctT > 0 ? promTareas : '<s>-</s>'}</td>
                    <td class="text-center text-primary fw-bold pct-tareas" data-est="${est.id}">${pctT > 0 ? pctTareasVal : ''}</td>
                    <td class="text-center position-relative" style="${estiloProy}">
                        <input type="number" class="form-control form-control-sm nota-input text-center" style="width:60px" min="0" max="10" step="0.1" value="${proyNota}" data-tipo="proyecto" data-idx="0" data-estudiante="${est.id}" data-nota-id="${proyNotaId}" onchange="calcularFila(this)" ${disabledProy}>
                        <i class="fas fa-comment ${tieneProyNotaCom} position-absolute btn-comentario" style="top:2px;right:2px;font-size:10px;cursor:pointer"
                            data-nota-id="${proyNotaId}"
                            data-estudiante="${est.nombres_apellidos}"
                            data-tipo="Proyecto"
                            data-comentario="${proyNotaCom}"
                            onclick="abrirComentario(this)"></i>
                    </td>
                    <td class="text-center position-relative" style="${estiloProy}">
                        <input type="number" class="form-control form-control-sm nota-input text-center" style="width:60px" min="0" max="10" step="0.1" value="${proyDeberRec}" data-tipo="proyecto" data-idx="1" data-estudiante="${est.id}" data-nota-id="${proyDeberRecId}" onchange="calcularFila(this)" ${disabledProy}>
                        <i class="fas fa-comment position-absolute btn-comentario" style="top:2px;right:2px;font-size:10px;cursor:pointer"
                            data-nota-id="${proyDeberRecId}"
                            data-estudiante="${est.nombres_apellidos}"
                            data-tipo="DR Proy"
                            data-comentario=""
                            onclick="abrirComentario(this)"></i>
                    </td>
                    <td class="text-center position-relative" style="${estiloProy}">
                        <input type="number" class="form-control form-control-sm nota-input text-center" style="width:60px" min="0" max="10" step="0.1" value="${proyRec}" data-tipo="proyecto" data-idx="2" data-estudiante="${est.id}" data-nota-id="${proyRecId}" onchange="calcularFila(this)" ${disabledProy}>
                        <i class="fas fa-comment position-absolute btn-comentario" style="top:2px;right:2px;font-size:10px;cursor:pointer"
                            data-nota-id="${proyRecId}"
                            data-estudiante="${est.nombres_apellidos}"
                            data-tipo="PR Proy"
                            data-comentario=""
                            onclick="abrirComentario(this)"></i>
                    </td>
                    <td class="text-center text-primary fw-bold pct-proyecto ${pctP > 0 ? colorNotaValor(proyFinal) : 'text-muted'}" data-est="${est.id}">${pctP > 0 ? proyFinal : '<s>-</s>'}</td>
                    <td class="text-center text-primary fw-bold pct-proyecto-pct" data-est="${est.id}">${pctP > 0 ? pctProyVal : ''}</td>
                    <td class="text-center position-relative" style="${estiloExam}">
                        <input type="number" class="form-control form-control-sm nota-input text-center" style="width:60px" min="0" max="10" step="0.1" value="${examNota}" data-tipo="examen" data-idx="0" data-estudiante="${est.id}" data-nota-id="${examNotaId}" onchange="calcularFila(this)" ${disabledExam}>
                        <i class="fas fa-comment ${tieneExamNotaCom} position-absolute btn-comentario" style="top:2px;right:2px;font-size:10px;cursor:pointer"
                            data-nota-id="${examNotaId}"
                            data-estudiante="${est.nombres_apellidos}"
                            data-tipo="Examen"
                            data-comentario="${examNotaCom}"
                            onclick="abrirComentario(this)"></i>
                    </td>
                    <td class="text-center position-relative" style="${estiloExam}">
                        <input type="number" class="form-control form-control-sm nota-input text-center" style="width:60px" min="0" max="10" step="0.1" value="${examDre}" data-tipo="examen" data-idx="1" data-estudiante="${est.id}" data-nota-id="${examDreId}" onchange="calcularFila(this)" ${disabledExam}>
                        <i class="fas fa-comment position-absolute btn-comentario" style="top:2px;right:2px;font-size:10px;cursor:pointer"
                            data-nota-id="${examDreId}"
                            data-estudiante="${est.nombres_apellidos}"
                            data-tipo="DRE"
                            data-comentario=""
                            onclick="abrirComentario(this)"></i>
                    </td>
                    <td class="text-center position-relative" style="${estiloExam}">
                        <input type="number" class="form-control form-control-sm nota-input text-center" style="width:60px" min="0" max="10" step="0.1" value="${examEr}" data-tipo="examen" data-idx="2" data-estudiante="${est.id}" data-nota-id="${examErId}" onchange="calcularFila(this)" ${disabledExam}>
                        <i class="fas fa-comment position-absolute btn-comentario" style="top:2px;right:2px;font-size:10px;cursor:pointer"
                            data-nota-id="${examErId}"
                            data-estudiante="${est.nombres_apellidos}"
                            data-tipo="ER"
                            data-comentario=""
                            onclick="abrirComentario(this)"></i>
                    </td>
                    <td class="text-center text-primary fw-bold pct-examen ${pctE > 0 ? colorNotaValor(examFinal) : 'text-muted'}" data-est="${est.id}">${pctE > 0 ? examFinal : '<s>-</s>'}</td>
                    <td class="text-center text-primary fw-bold pct-examen-pct" data-est="${est.id}">${pctE > 0 ? pctExamVal : ''}</td>
                    <td class="text-center bg-success-subtle nota-final ${notaFinalClass}" data-est="${est.id}">${notaFinalStr}</td>
                    <td class="text-center bg-success-subtle fw-bold" data-est="${est.id}">${aprendizaje}</td>
                </tr>
            `;
            tbody.innerHTML += row;
        }

        // Fila de promedios
        if (estudiantes.length > 0) {
            let promTareasArr = [];
            let promTareasPctArr = [];
            let proyNotaArr = [], proyDRArr = [], proyPRArr = [], proyFinalArr = [], proyPctArr = [];
            let examNotaArr = [], examDREArr = [], examERArr = [], examFinalArr = [], examPctArr = [];
            let notaFinalArr = [];

            for (const est of estudiantes) {
                if (est.activo === 0) continue; // Saltar inactivos del promedio
                const notas = notasExistentes[est.id] || [];
                const tareas = notas.filter(n => n.tipo === 'tarea');
                const tareasPorIndice = {};
                tareas.forEach(t => { tareasPorIndice[t.indice || 0] = t; });
                const proyectos = notas.filter(n => n.tipo === 'proyecto');
                const proyectosPorIndice = {};
                proyectos.forEach(p => { proyectosPorIndice[p.indice || 0] = p; });
                const examenes = notas.filter(n => n.tipo === 'examen');
                const examenesPorIndice = {};
                examenes.forEach(e => { examenesPorIndice[e.indice || 0] = e; });

                const tareasConNota = Object.values(tareasPorIndice).filter(t => t.nota !== null && t.nota !== undefined);
                const promT = tareasConNota.length > 0 && tareasCount > 0 ? (tareasConNota.reduce((s, t) => s + parseFloat(t.nota), 0) / tareasCount) : 0;
                promTareasArr.push(promT);
                promTareasPctArr.push(promT * porcentajes.promedio_tareas / 100);

                const pN = proyectosPorIndice[0] ? parseFloat(proyectosPorIndice[0].nota) || 0 : 0;
                const pDR = proyectosPorIndice[1] ? parseFloat(proyectosPorIndice[1].nota) || 0 : 0;
                const pPR = proyectosPorIndice[2] ? parseFloat(proyectosPorIndice[2].nota) || 0 : 0;
                proyNotaArr.push(pN); proyDRArr.push(pDR); proyPRArr.push(pPR);
                const pFinal = Math.max(pN, (pN + pDR + pPR) / 3);
                proyFinalArr.push(pFinal);
                proyPctArr.push(pFinal * porcentajes.proyecto / 100);

                const eN = examenesPorIndice[0] ? parseFloat(examenesPorIndice[0].nota) || 0 : 0;
                const eDR = examenesPorIndice[1] ? parseFloat(examenesPorIndice[1].nota) || 0 : 0;
                const eER = examenesPorIndice[2] ? parseFloat(examenesPorIndice[2].nota) || 0 : 0;
                examNotaArr.push(eN); examDREArr.push(eDR); examERArr.push(eER);
                const eFinal = Math.max(eN, (eN + eDR + eER) / 3);
                examFinalArr.push(eFinal);
                examPctArr.push(eFinal * porcentajes.examen / 100);

                const nf = (promT * porcentajes.promedio_tareas + pFinal * porcentajes.proyecto + eFinal * porcentajes.examen) / 100;
                if (pFinal > 0 && eFinal > 0) notaFinalArr.push(nf);
            }

            const avg = arr => arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : '0.00';
            const total = estudiantes.length;

            let tareasCols = '';
            for (let i = 0; i < tareasCount; i++) {
                tareasCols += `<td class="text-center fw-bold bg-light">${avg(Array(total).fill(0).map((_, j) => {
                    const notas = notasExistentes[estudiantes[j].id] || [];
                    const t = notas.filter(n => n.tipo === 'tarea' && n.indice === i);
                    return t.length > 0 ? parseFloat(t[0].nota) || 0 : 0;
                }))}</td>`;
            }

            const row = `
                <tr class="table-secondary fw-bold">
                    <td>PROMEDIOS</td>
                    ${tareasCols}
                    <td class="text-center">${avg(promTareasArr)}</td>
                    <td class="text-center">${avg(promTareasPctArr)}</td>
                    <td class="text-center">${avg(proyNotaArr)}</td>
                    <td class="text-center">${avg(proyDRArr)}</td>
                    <td class="text-center">${avg(proyPRArr)}</td>
                    <td class="text-center">${avg(proyFinalArr)}</td>
                    <td class="text-center">${avg(proyPctArr)}</td>
                    <td class="text-center">${avg(examNotaArr)}</td>
                    <td class="text-center">${avg(examDREArr)}</td>
                    <td class="text-center">${avg(examERArr)}</td>
                    <td class="text-center">${avg(examFinalArr)}</td>
                    <td class="text-center">${avg(examPctArr)}</td>
                    <td class="text-center">${avg(notaFinalArr)}</td>
                    <td></td>
                </tr>
            `;
            tbody.innerHTML += row;
        }
    } catch (err) {
        console.error('Error:', err);
            tbody.innerHTML = '<tr><td colspan="15" class="text-center text-danger">Error al cargar datos</td></tr>';
    }
}

function calcularFila(input) {
    const val = parseFloat(input.value);
    if (input.value !== '' && (isNaN(val) || val < 0 || val > 10)) {
        showNotification('Las notas deben ser entre 0 y 10', 'warning');
        input.value = '';
        return;
    }
    
    const tr = input.closest('tr');
    
    const pctT = porcentajes.promedio_tareas ?? 0;
    const pctP = porcentajes.proyecto ?? 0;
    const pctE = porcentajes.examen ?? 0;
    const totalPct = pctT + pctP + pctE;
    
    // Get all task values
    const taskInputs = tr.querySelectorAll('input[data-tipo="tarea"]');
    let sumaTareas = 0, countTareas = 0;
    taskInputs.forEach(inp => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) { sumaTareas += v; countTareas++; }
    });
    
    const promTareas = countTareas > 0 ? sumaTareas / countTareas : 0;
    const pctTareas = promTareas * pctT / 100;
    
    tr.querySelector('.prom-tareas').textContent = pctT > 0 ? (promTareas > 0 ? promTareas.toFixed(2) : '') : '<s>-</s>';
    tr.querySelector('.pct-tareas').textContent = pctT > 0 ? (promTareas > 0 ? pctTareas.toFixed(2) : '') : '';
    
    // Proyecto (3 inputs: nota, deber rec, proyecto rec)
    const proyInputs = tr.querySelectorAll('input[data-tipo="proyecto"]');
    const proyVals = [];
    proyInputs.forEach(inp => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) proyVals.push(v);
    });
    let proyFinal = 0;
    if (proyVals.length > 0) {
        const proyProm = proyVals.reduce((s, v) => s + v, 0) / proyVals.length;
        proyFinal = (proyVals[0] && proyProm < proyVals[0]) ? proyVals[0] : proyProm;
    }
    const pctProy = proyFinal * pctP / 100;
    tr.querySelector('.pct-proyecto').textContent = pctP > 0 ? (proyFinal > 0 ? proyFinal.toFixed(2) : '') : '<s>-</s>';
    tr.querySelector('.pct-proyecto-pct').textContent = pctP > 0 ? (proyFinal > 0 ? pctProy.toFixed(2) : '') : '';
    
    // Examen (3 inputs: nota, DRE, ER)
    const examInputs = tr.querySelectorAll('input[data-tipo="examen"]');
    const examVals = [];
    examInputs.forEach(inp => {
        const v = parseFloat(inp.value);
        if (!isNaN(v)) examVals.push(v);
    });
    let examFinal = 0;
    if (examVals.length > 0) {
        const examProm = examVals.reduce((s, v) => s + v, 0) / examVals.length;
        examFinal = (examVals[0] && examProm < examVals[0]) ? examVals[0] : examProm;
    }
    const pctExam = examFinal * pctE / 100;
    tr.querySelector('.pct-examen').textContent = pctE > 0 ? (examFinal > 0 ? examFinal.toFixed(2) : '') : '<s>-</s>';
    tr.querySelector('.pct-examen-pct').textContent = pctE > 0 ? (examFinal > 0 ? pctExam.toFixed(2) : '') : '';
    
    // Nota final - solo con componentes que tienen porcentaje > 0
    const nfEl = tr.querySelector('.nota-final');
    let notaFinal = 0;
    let notaFinalCompleta = false;
    
    if (pctT > 0 && pctP > 0 && pctE > 0) {
        if (proyFinal > 0 && examFinal > 0 && promTareas > 0) {
            notaFinal = pctTareas + pctProy + pctExam;
            notaFinalCompleta = true;
        }
    } else if (pctT > 0 && pctP > 0 && pctE === 0) {
        if (proyFinal > 0 && promTareas > 0) {
            notaFinal = (pctTareas + pctProy) * 100 / totalPct;
            notaFinalCompleta = true;
        }
    } else if (pctT > 0 && pctP === 0 && pctE > 0) {
        if (examFinal > 0 && promTareas > 0) {
            notaFinal = (pctTareas + pctExam) * 100 / totalPct;
            notaFinalCompleta = true;
        }
    } else if (pctT === 0 && pctP > 0 && pctE > 0) {
        if (proyFinal > 0 && examFinal > 0) {
            notaFinal = (pctProy + pctExam) * 100 / totalPct;
            notaFinalCompleta = true;
        }
    } else if (pctT > 0 && pctP === 0 && pctE === 0) {
        if (promTareas > 0) {
            notaFinal = promTareas;
            notaFinalCompleta = true;
        }
    } else if (pctT === 0 && pctP > 0 && pctE === 0) {
        if (proyFinal > 0) {
            notaFinal = proyFinal;
            notaFinalCompleta = true;
        }
    } else if (pctT === 0 && pctP === 0 && pctE > 0) {
        if (examFinal > 0) {
            notaFinal = examFinal;
            notaFinalCompleta = true;
        }
    }
    
    if (notaFinalCompleta) {
        nfEl.textContent = notaFinal.toFixed(2);
        nfEl.className = `text-center bg-success-subtle nota-final ${colorNotaValor(notaFinal)}`;
    } else {
        nfEl.textContent = '-';
        nfEl.className = 'text-center bg-success-subtle nota-final';
    }
}

async function guardarNotas() {
    if (!currentGrupoId) {
        showNotification('Seleccione un grupo', 'warning');
        return;
    }
    
    if (currentTrimestre === 'final') {
        showNotification('No se puede guardar en Promedio Final', 'warning');
        return;
    }
    
    const rows = document.querySelectorAll('#tablaNotasEstudiantes tr[data-estudiante]');
    let totalGuardados = 0;
    
    const promesas = [];
    
    for (const tr of rows) {
        const grupoId = parseInt(tr.getAttribute('data-grupo-id'));
        const esInactivo = tr.getAttribute('data-activo') === '0';
        if (esInactivo) continue; // No guardar notas de estudiantes inactivos
        
        const notas = [];
        
        // Tareas - enviar TODAS (vacías = null)
        const taskInputs = tr.querySelectorAll('input[data-tipo="tarea"]');
        taskInputs.forEach((inp) => {
            notas.push({
                tipo: 'tarea',
                nota: inp.value !== '' ? parseFloat(inp.value) : null,
                fecha_registro: new Date().toISOString().split('T')[0],
                indice: parseInt(inp.getAttribute('data-idx'))
            });
        });
        
        // Proyecto - enviar TODOS (vacíos = null)
        const proyInputs = tr.querySelectorAll('input[data-tipo="proyecto"]');
        proyInputs.forEach((inp) => {
            notas.push({
                tipo: 'proyecto',
                nota: inp.value !== '' ? parseFloat(inp.value) : null,
                fecha_registro: new Date().toISOString().split('T')[0],
                indice: parseInt(inp.getAttribute('data-idx'))
            });
        });
        
        // Examen - enviar TODOS (vacíos = null)
        const examInputs = tr.querySelectorAll('input[data-tipo="examen"]');
        examInputs.forEach((inp) => {
            notas.push({
                tipo: 'examen',
                nota: inp.value !== '' ? parseFloat(inp.value) : null,
                fecha_registro: new Date().toISOString().split('T')[0],
                indice: parseInt(inp.getAttribute('data-idx'))
            });
        });
        
        // Enviar request (aunque el array tenga nulls, el server los maneja)
        promesas.push(
            fetch(`/api/notas/grupo/${grupoId}/trimestre/${currentTrimestre}/multiple`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ notas })
            }).then(res => { if (res.ok) totalGuardados++; return res; })
        );
    }
    
    // Ejecutar TODOS los requests en paralelo
    await Promise.all(promesas);
    
    showNotification(`Notas guardadas: ${totalGuardados} estudiantes`, 'success');
    
    // Recargar tabla para reflejar cambios
    cargarTablaNotas();
}

function abrirComentario(el) {
    let notaId = el.getAttribute('data-nota-id');
    const estudiante = el.getAttribute('data-estudiante');
    const tipo = el.getAttribute('data-tipo');
    const comentarioActual = el.getAttribute('data-comentario') || '';
    const tr = el.closest('tr');
    const grupoId = tr ? parseInt(tr.getAttribute('data-grupo-id')) : currentGrupoId;

    const comentario = prompt(`Comentario para ${estudiante} - ${tipo}:`, comentarioActual);
    if (comentario === null) return;

    if (!notaId) {
        // Crear nota vacía primero, luego guardar comentario
        const tipoStr = el.getAttribute('data-tipo');
        const isTarea = tipoStr && tipoStr.startsWith('T');
        fetch(`/api/notas/crear-vacia`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grupo_id: grupoId,
                trimestre: currentTrimestre,
                tipo: isTarea ? 'tarea' : tipoStr.toLowerCase(),
                nota: null,
                indice: isTarea ? parseInt(tipoStr.substring(1)) - 1 : 0
            })
        })
        .then(res => res.json())
        .then(data => {
            if (data.id) {
                el.setAttribute('data-nota-id', data.id);
                guardarComentario(data.id, comentario, el);
            } else {
                showNotification('Error al crear nota', 'danger');
            }
        })
        .catch(err => {
            console.error('Error:', err);
            showNotification('Error al crear nota', 'danger');
        });
    } else {
        guardarComentario(notaId, comentario, el);
    }
}

function guardarComentario(notaId, comentario, el) {
    fetch(`/api/notas/nota/${notaId}/comentario`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comentario })
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

function exportarPDFNotas() {
    const tabla = document.getElementById('tablaNotas');
    if (!tabla || tabla.querySelector('tbody').rows.length === 0) {
        showNotification('No hay datos para exportar', 'warning');
        return;
    }
    if (typeof html2pdf === 'undefined') {
        showNotification('Librería PDF no cargada. Recargue la página.', 'danger');
        return;
    }
    const grupo = document.getElementById('nombreGrupoSeleccionado').textContent || '';
    const materia = document.getElementById('materia_notas').value || '';
    const trimestreVal = document.getElementById('trimestre_notas').value || '';
    const trimestreText = trimestreVal === 'final' ? 'Promedio Final' : `Trimestre ${trimestreVal}`;

    // Clonar tabla y reemplazar inputs por su valor, y encabezados verticales por horizontales
    const clone = tabla.cloneNode(true);
    clone.querySelectorAll('input').forEach(input => {
        const span = document.createElement('span');
        span.textContent = input.value || '-';
        span.style.fontSize = '11px';
        input.parentNode.replaceChild(span, input);
    });
    // Quitar iconos de comentarios
    clone.querySelectorAll('.btn-comentario, .fa-comment').forEach(el => el.remove());
    // Resetear th y sus divs hijos (quitamos writing-mode y transform)
    clone.querySelectorAll('th').forEach(th => {
        th.style.writingMode = 'horizontal-tb';
        th.style.textOrientation = 'mixed';
        th.style.whiteSpace = 'normal';
        th.style.transform = 'none';
        th.style.fontSize = '11px';
        th.querySelectorAll('div').forEach(div => {
            div.style.writingMode = 'horizontal-tb';
            div.style.textOrientation = 'mixed';
            div.style.transform = 'none';
            div.style.whiteSpace = 'normal';
        });
    });

    const config = {
        margin: [10, 5, 10, 5],
        filename: `Notas_${grupo}_${trimestreText.replace(/\s/g, '_')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }
    };
    const div = document.createElement('div');
    div.innerHTML = '<h4 style="text-align:center; margin-bottom:5px;">Notas - ' + materia + ' - ' + grupo + ' - ' + trimestreText + '</h4><p style="text-align:center; margin-bottom:10px;"><strong>Docente:</strong> ' + (typeof nombreDocente !== 'undefined' ? nombreDocente : '') + '</p>';
    div.appendChild(clone);
    html2pdf().set(config).from(div).save();
}

function exportarExcelNotas() {
    const tabla = document.getElementById('tablaNotas');
    if (!tabla || tabla.querySelector('tbody').rows.length === 0) {
        showNotification('No hay datos para exportar', 'warning');
        return;
    }
    if (typeof XLSX === 'undefined') {
        showNotification('Librería Excel no cargada. Recargue la página.', 'danger');
        return;
    }

    const grupo = document.getElementById('nombreGrupoSeleccionado').textContent || '';
    const materia = document.getElementById('materia_notas').value || '';
    const trimestreVal = document.getElementById('trimestre_notas').value || '';
    const trimestreText = trimestreVal === 'final' ? 'Promedio Final' : `Trimestre ${trimestreVal}`;

    const data = [];

    // Encabezados - fila 1 (grupos)
    const thead1 = tabla.querySelectorAll('thead tr')[0];
    const thead2 = tabla.querySelectorAll('thead tr')[1];
    if (thead1 && thead2) {
        const headers = [];
        const cells1 = thead1.querySelectorAll('th');
        const cells2 = thead2.querySelectorAll('th');
        let colspan = 0;
        for (const th of cells1) {
            const cs = parseInt(th.getAttribute('colspan')) || 1;
            const text = th.textContent.trim();
            if (cs > 1) {
                for (let i = 0; i < cs; i++) {
                    headers.push(text);
                }
            } else {
                const text2 = cells2[colspan] ? cells2[colspan].textContent.trim() : '';
                headers.push(text2 || text);
            }
            colspan += cs;
        }
        // Ensure headers match column count
        while (headers.length < cells2.length) headers.push('');
        data.push(headers);
    }

    // Filas de datos
    const tbody = tabla.querySelector('tbody');
    const rows = tbody.querySelectorAll('tr[data-estudiante]');
    rows.forEach(tr => {
        const row = [];
        const cells = tr.querySelectorAll('td');
        cells.forEach(td => {
            const input = td.querySelector('input');
            if (input) {
                row.push(input.value !== '' ? parseFloat(input.value) : '');
            } else {
                const text = td.textContent.trim();
                row.push(text === '-' || text === '' ? '' : text);
            }
        });
        data.push(row);
    });

    // Fila de promedios
    const promRow = tbody.querySelector('tr.table-secondary');
    if (promRow) {
        const row = [];
        promRow.querySelectorAll('td').forEach(td => {
            row.push(td.textContent.trim());
        });
        data.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [{ wch: 25 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Notas');
    XLSX.writeFile(wb, `Notas_${materia}_${grupo}_${trimestreText.replace(/\s/g, '_')}.xlsx`);
}
