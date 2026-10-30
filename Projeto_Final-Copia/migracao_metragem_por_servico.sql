-- Opcional: o SQL do banco enviado já contém esta migração idempotente.
-- Execute apenas se ainda não tiver rodado a seção de metragem do schema.
USE sabino_gesso;

SET @tem_area = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orcamento_servicos'
      AND COLUMN_NAME = 'area'
);
SET @sql_area = IF(
    @tem_area = 0,
    'ALTER TABLE orcamento_servicos ADD COLUMN area DECIMAL(10,2) NULL AFTER outro_descricao',
    'SELECT "A coluna area já existe em orcamento_servicos" AS aviso'
);
PREPARE stmt_area FROM @sql_area;
EXECUTE stmt_area;
DEALLOCATE PREPARE stmt_area;

SET @tem_valor = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'orcamento_servicos'
      AND COLUMN_NAME = 'valor'
);
SET @sql_valor = IF(
    @tem_valor = 0,
    'ALTER TABLE orcamento_servicos ADD COLUMN valor DECIMAL(10,2) NULL AFTER area',
    'SELECT "A coluna valor já existe em orcamento_servicos" AS aviso'
);
PREPARE stmt_valor FROM @sql_valor;
EXECUTE stmt_valor;
DEALLOCATE PREPARE stmt_valor;

SHOW COLUMNS FROM orcamento_servicos;
