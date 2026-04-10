import { ModulePermission } from '@/types/roles';

/**
 * Fonte única de verdade: permissões padrão por papel.
 * Usado no seed, criação de usuários pela UI, e fallback do guard.
 * 
 * Os nomes de módulo DEVEM corresponder ao campo `name` da tabela `modules`.
 */

export interface RolePermissionDefault {
  module: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  extra_permissions?: Record<string, boolean>;
}

// Admin tem acesso total (bypass no código), mas permissões ficam registradas para referência
export const ADMIN_DEFAULT_PERMISSIONS: RolePermissionDefault[] = [
  { module: 'dashboard', can_view: true, can_create: false, can_edit: false, can_delete: false },
  { module: 'instances', can_view: true, can_create: true, can_edit: true, can_delete: true,
    extra_permissions: { pair: true, reconnect: true, disconnect: true, test_message: true } },
  { module: 'greetings', can_view: true, can_create: true, can_edit: true, can_delete: true,
    extra_permissions: { test: true } },
  { module: 'absence', can_view: true, can_create: true, can_edit: true, can_delete: true },
  { module: 'status', can_view: true, can_create: true, can_edit: true, can_delete: true,
    extra_permissions: { apply: true } },
  { module: 'chatbot_keys', can_view: true, can_create: true, can_edit: true, can_delete: true,
    extra_permissions: { revoke: true, edit_scopes: true } },
  { module: 'workflow', can_view: true, can_create: true, can_edit: true, can_delete: true,
    extra_permissions: { publish: true, test: true } },
  { module: 'ai_agents', can_view: true, can_create: true, can_edit: true, can_delete: true,
    extra_permissions: { test: true } },
  { module: 'campaigns', can_view: true, can_create: true, can_edit: true, can_delete: true,
    extra_permissions: { send: true, pause: true, reports: true } },
  { module: 'settings', can_view: true, can_create: false, can_edit: true, can_delete: false },
];

// Operador (user): acesso limitado
export const OPERATOR_DEFAULT_PERMISSIONS: RolePermissionDefault[] = [
  { module: 'dashboard', can_view: true, can_create: false, can_edit: false, can_delete: false },
  { module: 'instances', can_view: true, can_create: false, can_edit: true, can_delete: false,
    extra_permissions: { pair: true, test_message: true } },
];

/**
 * Retorna as permissões padrão para um papel.
 * Admin tem bypass total no código, mas permissões são registradas para referência.
 */
export function getDefaultPermissions(role: string): RolePermissionDefault[] {
  switch (role) {
    case 'admin':
      return ADMIN_DEFAULT_PERMISSIONS;
    case 'user':
      return OPERATOR_DEFAULT_PERMISSIONS;
    default:
      return [];
  }
}
