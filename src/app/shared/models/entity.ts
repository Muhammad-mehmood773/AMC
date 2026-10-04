export interface Identifiable {
  readonly id: string;
}

export interface TenantScoped {
  readonly tenantId: string;
}

export interface Auditable {
  readonly createdAt: string;
  readonly createdBy: string;
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
}
