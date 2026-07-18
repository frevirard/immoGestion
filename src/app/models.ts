export type UserRole = 'ADMIN' | 'MANAGER';
export type RentPaymentStatus = 'PENDING' | 'PAID' | 'DEDUCTED_FROM_DEPOSIT';

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
}

export interface PropertyOwner {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  address?: string;
}

export interface PropertyUnit {
  id: string;
  reference: string;
  address: string;
  district: string;
  category: string;
  bedroomCount: number;
  hasLivingRoom: boolean;
  hasInternalWc: boolean;
  hasPrivateShower: boolean;
  hasKitchen: boolean;
  hasBalcony: boolean;
  rent: number;
  deposit: number;
  charges: number;
  managerId?: string;
  ownerId?: string;
  tenantId?: string;
  notes?: string;
  createdAt: string;
}

export interface Tenant {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  profession?: string;
  idDocument?: string;
  emergencyContact?: string;
  startDate: string;
  depositExpected: number;
  depositPaidAmount: number;
  depositPaidAt?: string;
  depositBalance: number;
}

export interface LeaseContract {
  id: string;
  propertyId: string;
  tenantId: string;
  startDate: string;
  endDate?: string;
  monthlyRent: number;
  deposit: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface OccupancyRecord {
  id: string;
  propertyId: string;
  tenantId: string;
  tenantName: string;
  startedAt: string;
  endedAt?: string;
  createdAt: string;
}

export interface RentPayment {
  id: string;
  propertyId: string;
  tenantId: string;
  managerId?: string;
  month: string;
  expectedAmount: number;
  paidAmount: number;
  deductionAmount: number;
  status: Exclude<RentPaymentStatus, 'PENDING'>;
  paidAt: string;
  comment?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RentPaymentSnapshot {
  propertyId: string;
  month: string;
  expectedAmount: number;
  paidAmount: number;
  deductionAmount: number;
  remainingAmount: number;
  status: RentPaymentStatus;
  paidAt?: string;
  comment?: string;
}

export interface RentHistoryPoint extends RentPaymentSnapshot {
  tenantId: string;
  tenantName: string;
  occupancyId: string;
  startedAt: string;
  endedAt?: string;
}

export interface PropertyCommentPhoto {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface PropertyComment {
  id: string;
  propertyId: string;
  authorId: string;
  authorName: string;
  body: string;
  photos: PropertyCommentPhoto[];
  createdAt: string;
}

export interface AppState {
  users: User[];
  owners: PropertyOwner[];
  properties: PropertyUnit[];
  tenants: Tenant[];
  contracts: LeaseContract[];
  occupancies: OccupancyRecord[];
  payments: RentPayment[];
  comments: PropertyComment[];
}

export interface TenantInput {
  fullName: string;
  phone: string;
  email?: string;
  profession?: string;
  idDocument?: string;
  emergencyContact?: string;
  startDate: string;
  depositExpected: number;
  depositPaidAmount: number;
  depositPaidAt?: string;
}

export interface AgentRentSummary {
  managerId: string;
  managerName: string;
  assignedCount: number;
  occupiedCount: number;
  availableCount: number;
  expectedAmount: number;
  collectedAmount: number;
  deductedFromDeposit: number;
  remainingAmount: number;
}

export interface PortfolioStats {
  total: number;
  occupied: number;
  available: number;
  expectedAmount: number;
  collectedAmount: number;
  deductedFromDeposit: number;
  remainingAmount: number;
}
