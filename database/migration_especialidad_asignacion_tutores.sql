-- Agrega especialidad a asignacion_tutores para asignar tutor por curso+paralelo+especialidad
CREATE TABLE IF NOT EXISTS asignacion_tutores (
    id INT NOT NULL AUTO_INCREMENT,
    tutor_id INT NOT NULL,
    curso VARCHAR(50) NOT NULL,
    paralelo VARCHAR(10) NOT NULL,
    especialidad VARCHAR(100) DEFAULT NULL,
    anio_lectivo VARCHAR(20) DEFAULT '2026-2027',
    school_id INT DEFAULT NULL,
    created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY unique_tutor_curso (tutor_id, curso, paralelo, anio_lectivo, school_id)
);

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asignacion_tutores' AND COLUMN_NAME = 'especialidad');
SET @sql := IF(@col = 0, 'ALTER TABLE asignacion_tutores ADD COLUMN especialidad VARCHAR(100) DEFAULT NULL AFTER paralelo', 'SELECT 1');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
