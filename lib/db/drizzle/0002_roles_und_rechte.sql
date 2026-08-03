CREATE TABLE roles (
  id text PRIMARY KEY,
  school_id text,
  key text NOT NULL,
  display_name text NOT NULL,
  display_name_en text,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX roles_school_id_key_key ON roles (school_id, key);

CREATE TABLE role_permissions (
  id text PRIMARY KEY,
  role_id text NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX role_permissions_role_id_permission_key ON role_permissions (role_id, permission);
