-- Historial de comportamiento por estudiante (registrado por el tutor)
CREATE TABLE IF NOT EXISTS historial_comportamiento (
    id INT NOT NULL AUTO_INCREMENT,
    estudiante_id INT NOT NULL,
    tutor_id INT DEFAULT NULL,
    usuario_id INT DEFAULT NULL,
    fecha DATE NOT NULL,
    tipo ENUM('observacion', 'positivo', 'negativo') DEFAULT 'observacion',
    descripcion TEXT NOT NULL,
    school_id INT DEFAULT NULL,
    anio_lectivo VARCHAR(20) DEFAULT '2026-2027',
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_estudiante (estudiante_id),
    CONSTRAINT fk_comportamiento_estudiante FOREIGN KEY (estudiante_id)
        REFERENCES estudiantes (id) ON DELETE CASCADE
);
