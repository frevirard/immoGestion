export type UserRole = 'USER' | 'MANAGER' | 'ADMIN';
export type AccountStatus = 'PENDING' | 'ACTIVE' | 'DISABLED';
export type AccountVerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
export type RentPaymentStatus = 'PENDING' | 'PAID' | 'DEDUCTED_FROM_DEPOSIT';
export type ExpenseCategory =
  | 'RENOVATION'
  | 'MAINTENANCE'
  | 'REPAIR'
  | 'UTILITIES'
  | 'TAX'
  | 'INSURANCE'
  | 'CLEANING'
  | 'SECURITY'
  | 'EQUIPMENT'
  | 'OTHER';
export type ListingTransactionType = 'RENT' | 'SALE';
export type ListingPropertyType =
  | 'LAND'
  | 'BUILDING'
  | 'HOUSE'
  | 'APARTMENT'
  | 'ROOM'
  | 'STUDIO'
  | 'OFFICE'
  | 'OTHER';
export type ListingStatus = 'PUBLISHED' | 'INACTIVE' | 'ARCHIVED';

export interface User {
  id: string;
  name: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email: string;
  password?: string;
  role: UserRole;
  status?: AccountStatus;
  phone?: string;
  birthDate?: string;
  createdAt?: string;
  deletionRequestedAt?: string;
  deletionScheduledAt?: string;
  verificationStatus?: AccountVerificationStatus;
  verificationRequestedAt?: string;
  verifiedAt?: string;
  verificationRejectedAt?: string;
  verificationRejectionReason?: string;
  verificationDocumentName?: string;
  verificationDocumentType?: string;
  verificationDocumentSize?: number;
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
  paymentId?: string;
  propertyId: string;
  month: string;
  expectedAmount: number;
  paidAmount: number;
  deductionAmount: number;
  remainingAmount: number;
  status: RentPaymentStatus;
  paidAt?: string;
  comment?: string;
  updatedAt?: string;
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

export interface PropertyExpense {
  id: string;
  propertyId: string;
  propertyReference: string;
  managerId?: string;
  managerName: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  comment?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize: number;
  createdByUserId: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseAttachment {
  expenseId: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface ExpenseAttachmentInput {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface PropertyExpenseInput {
  propertyId: string;
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  comment?: string;
  attachment?: ExpenseAttachmentInput;
  removeAttachment?: boolean;
}

export interface ListingPhoto {
  id: string;
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export interface VerificationDocument {
  userId: string;
  userName: string;
  documentName: string;
  documentType: string;
  documentSize: number;
  dataUrl: string;
  requestedAt?: string;
}

export interface MarketplaceListing {
  id: string;
  ownerUserId: string;
  ownerName: string;
  title: string;
  transactionType: ListingTransactionType;
  propertyType: ListingPropertyType;
  status: ListingStatus;
  address: string;
  city?: string;
  district?: string;
  contactPhone: string;
  landTitleAvailable: boolean;
  salePrice: number;
  monthlyRent: number;
  rentalDurationValue: number;
  rentalDurationUnit?: string;
  bedroomCount: number;
  bathroomCount: number;
  surfaceArea: number;
  viewCount: number;
  boosted: boolean;
  boostedAt?: string;
  boostedUntil?: string;
  description?: string;
  photos: ListingPhoto[];
  createdAt: string;
  updatedAt: string;
}

export type ListingInput = Omit<
  MarketplaceListing,
  'id' | 'ownerName' | 'status' | 'viewCount' | 'boosted' | 'boostedAt' | 'boostedUntil' | 'createdAt' | 'updatedAt'
>;

export interface ListingMessage {
  id: string;
  listingId: string;
  senderId: string;
  senderName: string;
  recipientId: string;
  recipientName: string;
  body: string;
  createdAt: string;
  readAt?: string;
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
  expenses: PropertyExpense[];
  listings: MarketplaceListing[];
  listingMessages: ListingMessage[];
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

export interface RegisterInput {
  username: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthDate: string;
  password: string;
}

export interface UserProfileInput {
  username: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthDate: string;
}

export interface PasswordUpdateInput {
  currentPassword: string;
  newPassword: string;
}

export interface VerificationRequestInput {
  documentName: string;
  documentType: string;
  documentSize: number;
  dataUrl: string;
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
