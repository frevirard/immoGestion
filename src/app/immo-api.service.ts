import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  AppState,
  ExpenseAttachment,
  LeaseContract,
  ListingInput,
  ListingMessage,
  ListingStatus,
  MarketplaceListing,
  PropertyComment,
  PropertyCommentPhoto,
  ProfilePhotoInput,
  PropertyExpense,
  PropertyExpenseInput,
  PropertyOwner,
  PropertyUnit,
  RegisterInput,
  RentPayment,
  Tenant,
  TenantInput,
  User,
  UserProfileInput,
  UserRole,
  PasswordUpdateInput,
  VerificationDocument,
  VerificationRequestInput,
} from './models';

type PropertyInput = Omit<PropertyUnit, 'id' | 'createdAt' | 'tenantId'>;

@Injectable({ providedIn: 'root' })
export class ImmoApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = 'http://localhost:8080/api';

  getState() {
    return this.http.get<AppState>(`${this.baseUrl}/app-state`);
  }

  login(email: string, password: string) {
    return this.http.post<User>(`${this.baseUrl}/auth/login`, { email, password });
  }

  register(input: RegisterInput) {
    return this.http.post<User>(`${this.baseUrl}/auth/register`, input);
  }

  createManager(input: Pick<User, 'name' | 'email' | 'phone' | 'password'>) {
    return this.http.post<User>(`${this.baseUrl}/users/managers`, input);
  }

  validateUser(userId: string) {
    return this.http.put<User>(`${this.baseUrl}/users/${userId}/validate`, {});
  }

  updateUserRole(userId: string, role: UserRole) {
    return this.http.put<User>(`${this.baseUrl}/users/${userId}/role`, { role });
  }

  updateUserProfile(userId: string, input: UserProfileInput) {
    return this.http.put<User>(`${this.baseUrl}/users/${userId}/profile`, input);
  }

  updateUserProfilePhoto(userId: string, input: ProfilePhotoInput) {
    return this.http.put<User>(`${this.baseUrl}/users/${userId}/profile-photo`, input);
  }

  removeUserProfilePhoto(userId: string) {
    return this.http.delete<User>(`${this.baseUrl}/users/${userId}/profile-photo`);
  }

  updatePassword(userId: string, input: PasswordUpdateInput) {
    return this.http.put<User>(`${this.baseUrl}/users/${userId}/password`, input);
  }

  deactivateAccount(userId: string) {
    return this.http.delete<User>(`${this.baseUrl}/users/${userId}`);
  }

  requestVerification(userId: string, input: VerificationRequestInput) {
    return this.http.post<User>(`${this.baseUrl}/users/${userId}/verification-request`, input);
  }

  getVerificationDocument(userId: string, adminId: string) {
    return this.http.get<VerificationDocument>(
      `${this.baseUrl}/users/${userId}/verification-document?adminId=${encodeURIComponent(adminId)}`,
    );
  }

  approveVerification(userId: string, adminId: string) {
    return this.http.put<User>(`${this.baseUrl}/users/${userId}/verification/approve`, {
      id: adminId,
    });
  }

  rejectVerification(userId: string, adminId: string, reason: string) {
    return this.http.put<User>(`${this.baseUrl}/users/${userId}/verification/reject`, {
      adminId,
      reason,
    });
  }

  createOwner(input: Omit<PropertyOwner, 'id'>) {
    return this.http.post<PropertyOwner>(`${this.baseUrl}/owners`, input);
  }

  createProperty(input: PropertyInput) {
    return this.http.post<PropertyUnit>(`${this.baseUrl}/properties`, input);
  }

  updateProperty(propertyId: string, input: PropertyInput) {
    return this.http.put<PropertyUnit>(`${this.baseUrl}/properties/${propertyId}`, input);
  }

  deleteProperty(propertyId: string) {
    return this.http.delete<void>(`${this.baseUrl}/properties/${propertyId}`);
  }

  assignManager(propertyId: string, managerId: string) {
    return this.http.put<PropertyUnit>(`${this.baseUrl}/properties/${propertyId}/manager`, {
      id: managerId,
    });
  }

  assignOwner(propertyId: string, ownerId: string) {
    return this.http.put<PropertyUnit>(`${this.baseUrl}/properties/${propertyId}/owner`, {
      id: ownerId,
    });
  }

  createTenant(input: TenantInput) {
    return this.http.post<Tenant>(`${this.baseUrl}/tenants`, input);
  }

  listTenants() {
    return this.http.get<Tenant[]>(`${this.baseUrl}/tenants`);
  }

  updateTenant(tenantId: string, input: TenantInput) {
    return this.http.put<Tenant>(`${this.baseUrl}/tenants/${tenantId}`, input);
  }

  deleteTenant(tenantId: string) {
    return this.http.delete<void>(`${this.baseUrl}/tenants/${tenantId}`);
  }

  upsertTenantForProperty(propertyId: string, input: TenantInput, replaceCurrent = false) {
    return this.http.post<Tenant>(
      `${this.baseUrl}/properties/${propertyId}/tenant?replaceCurrent=${replaceCurrent}`,
      input,
    );
  }

  assignTenantToProperty(propertyId: string, tenantId: string, replaceCurrent = false) {
    return this.http.put<Tenant>(
      `${this.baseUrl}/properties/${propertyId}/tenant?replaceCurrent=${replaceCurrent}`,
      { id: tenantId },
    );
  }

  unassignTenantFromProperty(propertyId: string) {
    return this.http.delete<PropertyUnit>(`${this.baseUrl}/properties/${propertyId}/tenant`);
  }

  markRentPaid(
    propertyId: string,
    month: string,
    amount: number,
    paidAt: string,
    actorUserId: string,
    comment?: string,
  ) {
    return this.http.post<RentPayment>(`${this.baseUrl}/properties/${propertyId}/payments/paid`, {
      month,
      amount,
      paidAt,
      comment,
      actorUserId,
    });
  }

  updateRentPaid(
    propertyId: string,
    month: string,
    amount: number,
    paidAt: string,
    actorUserId: string,
    comment?: string,
  ) {
    return this.http.put<void>(`${this.baseUrl}/properties/${propertyId}/payments/paid`, {
      month,
      amount,
      paidAt,
      comment,
      actorUserId,
    });
  }

  deductRentFromDeposit(
    propertyId: string,
    month: string,
    amount: number,
    actorUserId: string,
    comment?: string,
  ) {
    return this.http.post<RentPayment>(`${this.baseUrl}/properties/${propertyId}/payments/deduct`, {
      month,
      amount,
      comment,
      actorUserId,
    });
  }

  addComment(propertyId: string, authorId: string, body: string, photos: PropertyCommentPhoto[]) {
    return this.http.post<PropertyComment>(`${this.baseUrl}/properties/${propertyId}/comments`, {
      authorId,
      body,
      photos,
    });
  }

  listExpenses(actorUserId: string) {
    return this.http.get<PropertyExpense[]>(
      `${this.baseUrl}/expenses?actorUserId=${encodeURIComponent(actorUserId)}`,
    );
  }

  createExpense(input: PropertyExpenseInput, actorUserId: string) {
    return this.http.post<PropertyExpense>(`${this.baseUrl}/expenses`, {
      ...input,
      actorUserId,
    });
  }

  updateExpense(expenseId: string, input: PropertyExpenseInput, actorUserId: string) {
    return this.http.put<PropertyExpense>(`${this.baseUrl}/expenses/${expenseId}`, {
      ...input,
      actorUserId,
    });
  }

  deleteExpense(expenseId: string, actorUserId: string) {
    return this.http.delete<void>(
      `${this.baseUrl}/expenses/${expenseId}?actorUserId=${encodeURIComponent(actorUserId)}`,
    );
  }

  getExpenseAttachment(expenseId: string, actorUserId: string) {
    return this.http.get<ExpenseAttachment>(
      `${this.baseUrl}/expenses/${expenseId}/attachment?actorUserId=${encodeURIComponent(actorUserId)}`,
    );
  }

  saveContract(propertyId: string, content: string) {
    return this.http.put<LeaseContract>(`${this.baseUrl}/contracts/${propertyId}`, { content });
  }

  regenerateContract(propertyId: string) {
    return this.http.post<LeaseContract>(`${this.baseUrl}/contracts/${propertyId}/regenerate`, {});
  }

  createListing(input: ListingInput) {
    return this.http.post<MarketplaceListing>(`${this.baseUrl}/listings`, input);
  }

  updateListing(listingId: string, input: ListingInput) {
    return this.http.put<MarketplaceListing>(`${this.baseUrl}/listings/${listingId}`, input);
  }

  archiveListing(listingId: string, ownerUserId: string) {
    return this.http.post<MarketplaceListing>(`${this.baseUrl}/listings/${listingId}/archive`, {
      id: ownerUserId,
    });
  }

  restoreListing(listingId: string, ownerUserId: string) {
    return this.http.post<MarketplaceListing>(`${this.baseUrl}/listings/${listingId}/restore`, {
      id: ownerUserId,
    });
  }

  updateListingStatus(listingId: string, ownerUserId: string, status: ListingStatus) {
    return this.http.put<MarketplaceListing>(`${this.baseUrl}/listings/${listingId}/status`, {
      ownerUserId,
      status,
    });
  }

  trackListingView(listingId: string, viewerUserId?: string) {
    return this.http.post<MarketplaceListing>(`${this.baseUrl}/listings/${listingId}/view`, {
      id: viewerUserId ?? '',
    });
  }

  boostListing(listingId: string, adminUserId: string, boosted: boolean, boostedUntil?: string) {
    return this.http.post<MarketplaceListing>(`${this.baseUrl}/listings/${listingId}/boost`, {
      adminUserId,
      boosted,
      boostedUntil,
    });
  }

  sendListingMessage(listingId: string, senderId: string, body: string, recipientId?: string) {
    return this.http.post<ListingMessage>(`${this.baseUrl}/listings/${listingId}/messages`, {
      senderId,
      recipientId,
      body,
    });
  }

  markListingMessageRead(messageId: string, userId: string) {
    return this.http.post<ListingMessage>(`${this.baseUrl}/listings/messages/${messageId}/read`, {
      id: userId,
    });
  }
}
