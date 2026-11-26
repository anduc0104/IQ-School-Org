CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS org_nodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES org_nodes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  color TEXT NOT NULL DEFAULT '#64748B',
  level INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  node_type TEXT NOT NULL DEFAULT 'department', -- leadership | stream | department
  show_members_on_tree BOOLEAN NOT NULL DEFAULT FALSE,
  source_department_ids INT[] DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id INT UNIQUE,
  name TEXT NOT NULL,
  english_name TEXT,
  email TEXT,
  phone TEXT,
  role_code TEXT,
  username TEXT,
  class_names TEXT[] DEFAULT '{}',
  main_class TEXT,
  is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  extra JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_nodes (
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  node_id UUID NOT NULL REFERENCES org_nodes(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (employee_id, node_id)
);

CREATE INDEX IF NOT EXISTS idx_org_nodes_parent ON org_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
CREATE INDEX IF NOT EXISTS idx_employee_nodes_node ON employee_nodes(node_id);

-- Lookup từ iq_system (chỉ phục vụ lọc/tìm nhân sự, không tạo node sơ đồ)
CREATE TABLE IF NOT EXISTS source_schools (
  id INT PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_classes (
  id INT PRIMARY KEY,
  school_id INT REFERENCES source_schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  school_year TEXT,
  grade TEXT,
  class_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS source_departments (
  id INT PRIMARY KEY,
  name TEXT NOT NULL,
  dept_type TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE employees ADD COLUMN IF NOT EXISTS school_ids INT[] DEFAULT '{}';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS class_ids INT[] DEFAULT '{}';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_ids INT[] DEFAULT '{}';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS department_names TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_source_classes_school ON source_classes(school_id);
CREATE INDEX IF NOT EXISTS idx_employees_school_ids ON employees USING GIN (school_ids);
CREATE INDEX IF NOT EXISTS idx_employees_class_ids ON employees USING GIN (class_ids);
CREATE INDEX IF NOT EXISTS idx_employees_department_ids ON employees USING GIN (department_ids);
