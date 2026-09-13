let gruposInformes = [];

function actualizarTipoInforme() {
    const trimestre = document.getElementById('informeTrimestre').value;
    const select = document.getElementById('tipoInforme');
    select.innerHTML = '<option value="acta">Acta de Calificaciones</option>';
    if (trimestre === '3') {
        select.innerHTML += '<option value="asignatura">Informe Final</option>';
    } else {
        select.innerHTML += '<option value="asignatura">Informe Trimestral de Asignatura</option>';
    }
}

async function cargarGruposInformes() {
    try {
        const response = await fetch('/api/informes/materias');
        gruposInformes = await response.json();
        const select = document.getElementById('informeGrupoSelect');
        select.innerHTML = '<option value="">Seleccionar curso...</option>';
        gruposInformes.forEach(g => {
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

async function generarInforme() {
    const grupoId = document.getElementById('informeGrupoSelect').value;
    const trimestre = document.getElementById('informeTrimestre').value;
    const tipo = document.getElementById('tipoInforme').value;

    if (!grupoId) {
        showNotification('Seleccione un curso', 'warning');
        return;
    }

    document.getElementById('contenidoInforme').style.display = 'block';
    document.getElementById('btnExportarPDF').style.display = 'inline-block';

    if (tipo === 'acta') {
        document.getElementById('contenedorActa').style.display = 'block';
        document.getElementById('contenedorAsignatura').style.display = 'none';
        await generarActa(grupoId, trimestre);
    } else if (tipo === 'asignatura') {
        document.getElementById('contenedorActa').style.display = 'none';
        document.getElementById('contenedorAsignatura').style.display = 'block';

        const esFinal = trimestre === '3';
        document.getElementById('seccionesFinales').style.display = esFinal ? 'block' : 'none';
        document.getElementById('seccionesTrimestrales').style.display = 'block';
        document.getElementById('labelConclusiones').textContent = esFinal ? '6. CONCLUSIONES' : '4. CONCLUSIONES';
        document.getElementById('labelRecomendaciones').textContent = esFinal ? '7. RECOMENDACIONES.' : '5. RECOMENDACIONES.';

        await generarInformeAsignatura(grupoId, trimestre);
    }
}

async function generarActa(grupoId, trimestre) {
    try {
        const response = await fetch(`/api/informes/acta/${grupoId}/trimestre/${trimestre}`);
        const data = await response.json();
        if (data.error) {
            showNotification(data.error, 'danger');
            return;
        }

        document.getElementById('actaTitulo').textContent = 'ACTA DE CALIFICACIONES';
        document.getElementById('actaSubtitulo').textContent = `${data.materia} - ${data.curso} (${data.paralelo}) - Trimestre ${trimestre}`;

        const thead = document.getElementById('tablaInformeHead');
        thead.innerHTML = `
            <tr>
                <th>#</th>
                <th>Cedula</th>
                <th>Estudiante</th>
                <th>Prom. clase</th>
                <th>Proyecto</th>
                <th>Examen</th>
                <th>Nota Final</th>
                <th>% Asistencia</th>
            </tr>
        `;

        const tbody = document.getElementById('tablaInformeBody');
        tbody.innerHTML = '';
        data.estudiantes.forEach((est, i) => {
            const notaFinal = parseFloat(est.nota_final);
            let notaClass = 'text-success';
            if (notaFinal < 4) notaClass = 'text-danger';
            else if (notaFinal < 7) notaClass = 'text-warning';

            tbody.innerHTML += `
                <tr>
                    <td>${i + 1}</td>
                    <td>${est.cedula}</td>
                    <td>${est.nombres_apellidos}</td>
                    <td>${est.prom_tareas}</td>
                    <td>${est.proyecto_final}</td>
                    <td>${est.examen_final}</td>
                    <td class="fw-bold ${notaClass}">${est.nota_final}</td>
                    <td>${est.pct_asistencia}%</td>
                </tr>
            `;
        });

        showNotification('Acta generada correctamente', 'success');
    } catch (err) {
        console.error('Error:', err);
        showNotification('Error al generar acta', 'danger');
    }
}

async function generarInformeAsignatura(materiaId, trimestre) {
    try {
        const esFinal = trimestre === '3';

        let dataTrimestral = null;
        let dataFinal = null;

        if (esFinal) {
            const [respT, respF] = await Promise.all([
                fetch(`/api/informes/asignatura/${materiaId}/trimestre/3`),
                fetch(`/api/informes/final/${materiaId}`)
            ]);
            dataTrimestral = await respT.json();
            dataFinal = await respF.json();
            if (dataTrimestral.error) { showNotification(dataTrimestral.error, 'danger'); return; }
            if (dataFinal.error) { showNotification(dataFinal.error, 'danger'); return; }
        } else {
            const respT = await fetch(`/api/informes/asignatura/${materiaId}/trimestre/${trimestre}`);
            dataTrimestral = await respT.json();
            if (dataTrimestral.error) { showNotification(dataTrimestral.error, 'danger'); return; }
        }

        const data = dataTrimestral;
        const trimestres = { 1: '1er Trimestre', 2: '2do Trimestre', 3: 'Año Lectivo' };

        document.getElementById('infoDocente').textContent = data.profesor || '________________________';
        document.getElementById('infoAsignatura').textContent = data.materia;
        document.getElementById('infoTrimestre').textContent = trimestres[trimestre] || trimestre;
        document.getElementById('infoAnoFigura').textContent = `${data.curso} - ${data.especialidad || ''}`;
        document.getElementById('infoParalelo').textContent = data.paralelo;
        document.getElementById('infoNAlumnos').textContent = data.total_alumnos;

        document.getElementById('resDominanN').textContent = data.resultados.dominan.n;
        document.getElementById('resDominanP').textContent = data.resultados.dominan.pct + '%';
        document.getElementById('resAlcanzanN').textContent = data.resultados.alcanzan.n;
        document.getElementById('resAlcanzanP').textContent = data.resultados.alcanzan.pct + '%';
        document.getElementById('resProximosN').textContent = data.resultados.proximos.n;
        document.getElementById('resProximosP').textContent = data.resultados.proximos.pct + '%';
        document.getElementById('resNoAlcanzanN').textContent = data.resultados.noAlcanzan.n;
        document.getElementById('resNoAlcanzanP').textContent = data.resultados.noAlcanzan.pct + '%';
        document.getElementById('resPromedio').textContent = data.promedio_general;

        const sinNotasData = data.resultados.sinNotas || data.resultados.sinExamen || { n: 0, pct: 0 };
        document.getElementById('resSinExamenN').textContent = sinNotasData.n;
        document.getElementById('resSinExamenP').textContent = sinNotasData.pct + '%';
        const sinNotasNombres = data.estudiantes_sin_notas || data.estudiantes_sin_examen || [];
        document.getElementById('resSinExamenNombres').textContent = sinNotasNombres.join(', ') || 'NINGUNO';

        const analisisEstudiantes = data.estudiantes_analisis;

        const nombresCell = document.getElementById('analisisNombres');
        const dificultadCell = document.getElementById('analisisDificultad');
        const causaCell = document.getElementById('analisisCausa');
        const medidasCell = document.getElementById('analisisMedidas');

        if (analisisEstudiantes.length === 0) {
            nombresCell.textContent = 'NINGUNO';
            dificultadCell.textContent = '';
            causaCell.textContent = '';
            medidasCell.textContent = '';
        } else {
            nombresCell.innerHTML = analisisEstudiantes.map(e => `<div style="min-height:30px;padding:4px 0;border-bottom:1px solid #ccc;">${e.nombre}</div>`).join('');
            dificultadCell.innerHTML = analisisEstudiantes.map((_, i) => `<div style="min-height:30px;padding:2px 0;border-bottom:1px solid #ccc;"><input type="text" class="form-control form-control-sm analisis-dificultad" style="border:none;padding:2px;font-size:0.85em;"></div>`).join('');
            causaCell.innerHTML = analisisEstudiantes.map((_, i) => `<div style="min-height:30px;padding:2px 0;border-bottom:1px solid #ccc;"><input type="text" class="form-control form-control-sm analisis-causa" style="border:none;padding:2px;font-size:0.85em;"></div>`).join('');
            medidasCell.innerHTML = analisisEstudiantes.map((_, i) => `<div style="min-height:30px;padding:2px 0;border-bottom:1px solid #ccc;"><input type="text" class="form-control form-control-sm analisis-medidas" style="border:none;padding:2px;font-size:0.85em;"></div>`).join('');
        }

        if (esFinal && dataFinal) {
            document.getElementById('finalDominanN').textContent = dataFinal.resultados.dominan.n;
            document.getElementById('finalDominanP').textContent = dataFinal.resultados.dominan.pct + '%';
            document.getElementById('finalAlcanzanN').textContent = dataFinal.resultados.alcanzan.n;
            document.getElementById('finalAlcanzanP').textContent = dataFinal.resultados.alcanzan.pct + '%';
            document.getElementById('finalProximosN').textContent = dataFinal.resultados.proximos.n;
            document.getElementById('finalProximosP').textContent = dataFinal.resultados.proximos.pct + '%';
            document.getElementById('finalNoAlcanzanN').textContent = dataFinal.resultados.noAlcanzan.n;
            document.getElementById('finalNoAlcanzanP').textContent = dataFinal.resultados.noAlcanzan.pct + '%';
            document.getElementById('finalPromedio').textContent = dataFinal.promedio_general;
            document.getElementById('finalSinNotasN').textContent = dataFinal.resultados.sinNotas.n;
            document.getElementById('finalSinNotasP').textContent = dataFinal.resultados.sinNotas.pct + '%';

            document.getElementById('promoPromovidosN').textContent = dataFinal.promocion.promovidos.n;
            document.getElementById('promoPromovidosP').textContent = dataFinal.promocion.promovidos.pct + '%';
            document.getElementById('promoSupletorioN').textContent = dataFinal.promocion.supletorios.n;
            document.getElementById('promoSupletorioP').textContent = dataFinal.promocion.supletorios.pct + '%';
            document.getElementById('promoPierdenN').textContent = dataFinal.promocion.perdidas.n;
            document.getElementById('promoPierdenP').textContent = dataFinal.promocion.perdidas.pct + '%';

            const promoBody = document.getElementById('promoCuerpo');
            promoBody.innerHTML = dataFinal.lista_promocion.map((est, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td style="text-align:left;">${est.nombre}</td>
                    <td>${est.estado === 'supletorio' ? est.nota_final : ''}</td>
                    <td>${est.estado === 'perdida' ? est.nota_final : ''}</td>
                </tr>
            `).join('');

            const sinNotaBody = document.getElementById('sinNotaCuerpo');
            if (dataFinal.estudiantes_sin_notas.length === 0) {
                sinNotaBody.innerHTML = '<tr><td colspan="4">NINGUNO</td></tr>';
            } else {
                sinNotaBody.innerHTML = dataFinal.estudiantes_sin_notas.map(nombre => `
                    <tr><td style="text-align:left;" colspan="4">${nombre}</td></tr>
                `).join('');
            }
        }

        document.getElementById('sinExamenNombres').textContent = data.estudiantes_sin_examen.join(', ') || 'NINGUNO';

        document.getElementById('analisisDificultad').value = '';
        document.getElementById('analisisCausa').value = '';
        document.getElementById('analisisMedidas').value = '';
        document.getElementById('conclusiones').value = '';
        document.getElementById('recomendaciones').value = '';

        showNotification('Informe generado correctamente', 'success');
    } catch (err) {
        console.error('Error:', err);
        showNotification('Error al generar informe', 'danger');
    }
}

function repetirAnalisisATodos() {
    const dificultades = document.querySelectorAll('.analisis-dificultad');
    const causas = document.querySelectorAll('.analisis-causa');
    const medidas = document.querySelectorAll('.analisis-medidas');

    if (dificultades.length === 0) {
        showNotification('No hay estudiantes para repetir', 'warning');
        return;
    }

    const primeraDificultad = dificultades[0].value;
    const primeraCausa = causas[0].value;
    const primeraMedida = medidas[0].value;

    if (!primeraDificultad && !primeraCausa && !primeraMedida) {
        showNotification('Ingrese al menos un campo en el primer estudiante', 'warning');
        return;
    }

    for (let i = 1; i < dificultades.length; i++) {
        if (primeraDificultad) dificultades[i].value = primeraDificultad;
        if (primeraCausa) causas[i].value = primeraCausa;
        if (primeraMedida) medidas[i].value = primeraMedida;
    }

    showNotification('Valores repetidos a todos los estudiantes', 'success');
}

function exportarPDFInforme() {
    const tipo = document.getElementById('tipoInforme').value;
    const trimestre = document.getElementById('informeTrimestre').value;
    const esFinal = trimestre === '3' && tipo === 'asignatura';
    let elemento;
    let nombreArchivo;

    if (tipo === 'acta') {
        elemento = document.getElementById('contenedorActa');
        nombreArchivo = 'acta_calificaciones.pdf';
    } else {
        elemento = document.getElementById('contenedorAsignatura');
        nombreArchivo = esFinal ? 'informe_final.pdf' : 'informe_asignatura.pdf';
    }

    if (!elemento || elemento.style.display === 'none') {
        showNotification('Primero genere un informe', 'warning');
        return;
    }

    const prevWidth = elemento.style.width;
    const prevMinWidth = elemento.style.minWidth;

    if (esFinal) {
        const sf = document.getElementById('seccionesFinales');
        const st = document.getElementById('seccionesTrimestrales');
        if (sf) sf.style.display = 'block';
        if (st) st.style.display = 'block';
        elemento.style.width = '1000px';
        elemento.style.minWidth = '1000px';
    } else if (tipo === 'acta') {
        elemento.style.width = '1000px';
        elemento.style.minWidth = '1000px';
    } else {
        elemento.style.width = '990px';
        elemento.style.minWidth = '990px';
    }

    const config = {
        margin: 5,
        filename: nombreArchivo,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'letter', orientation: 'landscape' }
    };

    if (esFinal) {
        html2pdf().set(config).from(elemento).save().then(() => {
            elemento.style.width = prevWidth;
            elemento.style.minWidth = prevMinWidth;
            showNotification('PDF generado', 'success');
        });
    } else {
        html2pdf().set(config).from(elemento).save().then(() => {
            elemento.style.width = prevWidth;
            elemento.style.minWidth = prevMinWidth;
            showNotification('PDF generado', 'success');
        });
    }
}

document.addEventListener('DOMContentLoaded', cargarGruposInformes);
