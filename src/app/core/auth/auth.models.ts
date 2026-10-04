export interface TenantRef {
  readonly id: string;
  readonly name: string;
}

export interface UserRef {
  readonly id: string;
  readonly displayName: string;
  readonly email: string;
}

export interface SessionState {
  readonly user: UserRef | null;
  readonly tenant: TenantRef | null;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly accessToken: string | null;
}

export const EMPTY_SESSION: SessionState = {
  user: null,
  tenant: null,
  roles: [],
  permissions: [],
  accessToken: null,
};
