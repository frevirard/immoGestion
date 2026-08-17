import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { ImmoApiService } from './immo-api.service';
import {
  AgentRentSummary,
  AppState,
  ExpenseAttachment,
  LeaseContract,
  ListingInput,
  ListingMessage,
  ListingStatus,
  MarketplaceListing,
  PortfolioStats,
  PropertyComment,
  PropertyCommentPhoto,
  PropertyExpense,
  PropertyExpenseInput,
  PropertyOwner,
  ProfilePhotoInput,
  PropertyUnit,
  RegisterInput,
  PasswordUpdateInput,
  RentHistoryPoint,
  RentPayment,
  RentPaymentSnapshot,
  Tenant,
  TenantInput,
  User,
  UserProfileInput,
  VerificationDocument,
  VerificationRequestInput,
} from './models';

const SESSION_KEY = 'immo-parc-current-user-v1';
const API_TIMEOUT_MS = 15_000;

type PropertyInput = Omit<PropertyUnit, 'id' | 'createdAt' | 'tenantId'>;

@Injectable({ providedIn: 'root' })
export class ImmoStore {
  private readonly api = inject(ImmoApiService);

  readonly state = signal<AppState>(createEmptyState());
  readonly currentUserId = signal<string | null>(this.readSession());
  private readonly loadingOperations = signal(0);
  readonly isLoading = computed(() => this.loadingOperations() > 0);
  readonly isInitialized = signal(false);
  readonly apiError = signal('');

  readonly currentUser = computed(() => {
    const userId = this.currentUserId();
    const user = this.state().users.find((user) => user.id === userId) ?? null;

    return user && (user.status ?? 'ACTIVE') === 'ACTIVE' ? user : null;
  });

  readonly managers = computed(() => this.state().users.filter((user) => user.role === 'MANAGER'));

  readonly owners = computed(() => this.state().owners);
  readonly properties = computed(() => this.state().properties);
  readonly tenants = computed(() => this.state().tenants);
  readonly contracts = computed(() => this.state().contracts);
  readonly occupancies = computed(() => this.state().occupancies);
  readonly payments = computed(() => this.state().payments);
  readonly comments = computed(() => this.state().comments);
  readonly expenses = computed(() => this.state().expenses ?? []);
  readonly listings = computed(() => this.state().listings);
  readonly listingMessages = computed(() => this.state().listingMessages);
  readonly publishedListings = computed(() =>
    sortListingsByVisibility(
      this.listings().filter(
        (listing) => listing.status === 'PUBLISHED' && this.isListingOwnerActive(listing),
      ),
    ),
  );
  readonly adminListings = computed(() => sortListingsByVisibility(this.listings()));
  readonly myListings = computed(() => {
    const user = this.currentUser();
    return user
      ? sortListingsByVisibility(
          this.listings().filter((listing) => listing.ownerUserId === user.id),
        )
      : [];
  });
  readonly myListingMessages = computed(() => {
    const user = this.currentUser();

    if (!user) {
      return [];
    }

    return this.listingMessages().filter(
      (message) => message.senderId === user.id || message.recipientId === user.id,
    );
  });
  readonly unreadListingMessagesCount = computed(() => {
    const user = this.currentUser();

    if (!user) {
      return 0;
    }

    return this.listingMessages().filter(
      (message) => message.recipientId === user.id && !message.readAt,
    ).length;
  });

  readonly visibleProperties = computed(() => {
    const user = this.currentUser();
    const properties = this.properties();

    if (!user) {
      return [];
    }

    if (user.role === 'ADMIN') {
      return properties;
    }

    if (user.role === 'USER') {
      return [];
    }

    return properties.filter((property) => property.managerId === user.id);
  });

  readonly visibleExpenses = computed(() => {
    const propertyIds = new Set(this.visibleProperties().map((property) => property.id));
    return this.expenses().filter((expense) => propertyIds.has(expense.propertyId));
  });

  constructor() {
    void this.refresh();

    effect(() => {
      const currentUserId = this.currentUserId();

      if (!this.canUseStorage()) {
        return;
      }

      if (currentUserId) {
        localStorage.setItem(SESSION_KEY, currentUserId);
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    });
  }

  async refresh(): Promise<void> {
    this.beginLoading();

    try {
      const state = await firstValueFrom(this.api.getState().pipe(timeout(API_TIMEOUT_MS)));
      this.state.set({
        ...state,
        expenses: this.state().expenses ?? [],
      });
      await this.refreshExpensesForCurrentUser();
      this.apiError.set('');
    } catch {
      this.apiError.set('Serveur indisponible');
    } finally {
      this.endLoading();
      this.isInitialized.set(true);
    }
  }

  async refreshTenants(): Promise<Tenant[]> {
    this.beginLoading();

    try {
      const tenants = await firstValueFrom(this.api.listTenants().pipe(timeout(API_TIMEOUT_MS)));
      this.state.update((state) => ({
        ...state,
        tenants,
      }));
      return tenants;
    } finally {
      this.endLoading();
    }
  }

  async login(email: string, password: string): Promise<boolean> {
    try {
      const user = await firstValueFrom(
        this.api.login(email.trim().toLowerCase(), password).pipe(timeout(API_TIMEOUT_MS)),
      );
      await this.refresh();
      this.currentUserId.set(user.id);
      await this.refreshExpenses(user.id);
      return true;
    } catch {
      return false;
    }
  }

  async register(input: RegisterInput): Promise<User> {
    const user = await firstValueFrom(this.api.register(input));
    await this.refresh();
    this.currentUserId.set(user.id);
    return user;
  }

  logout(): void {
    this.currentUserId.set(null);
  }

  async addManager(input: Pick<User, 'name' | 'email' | 'phone' | 'password'>): Promise<User> {
    const manager = await firstValueFrom(this.api.createManager(input));
    await this.refresh();
    return manager;
  }

  async validateUser(userId: string): Promise<User> {
    const user = await firstValueFrom(this.api.validateUser(userId));
    await this.refresh();
    return user;
  }

  async updateUserRole(userId: string, role: User['role']): Promise<User> {
    const user = await firstValueFrom(this.api.updateUserRole(userId, role));
    await this.refresh();
    return user;
  }

  async updateUserProfile(userId: string, input: UserProfileInput): Promise<User> {
    const user = await firstValueFrom(this.api.updateUserProfile(userId, input));
    await this.refresh();
    return user;
  }

  async updateUserProfilePhoto(userId: string, input: ProfilePhotoInput): Promise<User> {
    const user = await firstValueFrom(this.api.updateUserProfilePhoto(userId, input));
    await this.refresh();
    return user;
  }

  async removeUserProfilePhoto(userId: string): Promise<User> {
    const user = await firstValueFrom(this.api.removeUserProfilePhoto(userId));
    await this.refresh();
    return user;
  }

  async updatePassword(userId: string, input: PasswordUpdateInput): Promise<User> {
    const user = await firstValueFrom(this.api.updatePassword(userId, input));
    await this.refresh();
    return user;
  }

  async deactivateAccount(userId: string): Promise<User> {
    const user = await firstValueFrom(this.api.deactivateAccount(userId));
    await this.refresh();
    this.currentUserId.set(null);
    return user;
  }

  async requestVerification(userId: string, input: VerificationRequestInput): Promise<User> {
    const user = await firstValueFrom(this.api.requestVerification(userId, input));
    await this.refresh();
    return user;
  }

  async getVerificationDocument(userId: string, adminId: string): Promise<VerificationDocument> {
    return firstValueFrom(this.api.getVerificationDocument(userId, adminId));
  }

  async approveVerification(userId: string, adminId: string): Promise<User> {
    const user = await firstValueFrom(this.api.approveVerification(userId, adminId));
    await this.refresh();
    return user;
  }

  async rejectVerification(userId: string, adminId: string, reason: string): Promise<User> {
    const user = await firstValueFrom(this.api.rejectVerification(userId, adminId, reason));
    await this.refresh();
    return user;
  }

  async addOwner(input: Omit<PropertyOwner, 'id'>): Promise<PropertyOwner> {
    const owner = await firstValueFrom(this.api.createOwner(input));
    await this.refresh();
    return owner;
  }

  async addTenant(input: TenantInput): Promise<Tenant> {
    const tenant = await firstValueFrom(this.api.createTenant(input));
    await this.refresh();
    return tenant;
  }

  async updateTenant(tenantId: string, input: TenantInput): Promise<Tenant> {
    const tenant = await firstValueFrom(this.api.updateTenant(tenantId, input));
    await this.refresh();
    return tenant;
  }

  canDeleteTenant(tenantId: string): boolean {
    const state = this.state();

    return (
      !state.properties.some((property) => property.tenantId === tenantId) &&
      !state.occupancies.some((occupancy) => occupancy.tenantId === tenantId) &&
      !state.payments.some((payment) => payment.tenantId === tenantId) &&
      !state.contracts.some((contract) => contract.tenantId === tenantId)
    );
  }

  async deleteTenant(tenantId: string): Promise<void> {
    if (!this.canDeleteTenant(tenantId)) {
      throw new Error('Impossible de supprimer un locataire déjà rattaché à un bien.');
    }

    await firstValueFrom(this.api.deleteTenant(tenantId));
    await this.refresh();
  }

  async addProperty(input: PropertyInput): Promise<PropertyUnit> {
    const property = await firstValueFrom(this.api.createProperty(input));
    await this.refresh();
    return property;
  }

  async updateProperty(propertyId: string, input: PropertyInput): Promise<PropertyUnit> {
    const property = await firstValueFrom(this.api.updateProperty(propertyId, input));
    await this.refresh();
    return property;
  }

  canDeleteProperty(propertyId: string): boolean {
    const state = this.state();
    const property = state.properties.find((candidate) => candidate.id === propertyId);

    return Boolean(
      property &&
      !property.tenantId &&
      !state.occupancies.some((occupancy) => occupancy.propertyId === propertyId) &&
      !state.payments.some((payment) => payment.propertyId === propertyId) &&
      !state.contracts.some((contract) => contract.propertyId === propertyId) &&
      !state.comments.some((comment) => comment.propertyId === propertyId) &&
      !(state.expenses ?? []).some((expense) => expense.propertyId === propertyId),
    );
  }

  async deleteProperty(propertyId: string): Promise<void> {
    if (!this.canDeleteProperty(propertyId)) {
      throw new Error(
        'Impossible de supprimer un bien déjà rattaché à un locataire ou possédant un historique.',
      );
    }

    await firstValueFrom(this.api.deleteProperty(propertyId));
    await this.refresh();
  }

  async assignManager(propertyId: string, managerId: string): Promise<void> {
    await firstValueFrom(this.api.assignManager(propertyId, managerId));
    await this.refresh();
  }

  async assignOwner(propertyId: string, ownerId: string): Promise<void> {
    await firstValueFrom(this.api.assignOwner(propertyId, ownerId));
    await this.refresh();
  }

  async upsertTenantForProperty(
    propertyId: string,
    input: TenantInput,
    replaceCurrent = false,
  ): Promise<Tenant> {
    const tenant = await firstValueFrom(
      this.api.upsertTenantForProperty(propertyId, input, replaceCurrent),
    );
    await this.refresh();
    return tenant;
  }

  async assignTenantToProperty(
    propertyId: string,
    tenantId: string,
    replaceCurrent = false,
  ): Promise<Tenant> {
    const tenant = await firstValueFrom(
      this.api.assignTenantToProperty(propertyId, tenantId, replaceCurrent),
    );
    await this.refresh();
    return tenant;
  }

  async unassignTenantFromProperty(propertyId: string): Promise<PropertyUnit> {
    const property = await firstValueFrom(this.api.unassignTenantFromProperty(propertyId));
    await this.refresh();
    return property;
  }

  isTenantAttachedToAnotherProperty(tenantId: string, propertyId?: string): boolean {
    return this.properties().some(
      (property) => property.tenantId === tenantId && property.id !== propertyId,
    );
  }

  async markRentPaid(
    propertyId: string,
    month: string,
    amount: number,
    paidAt: string,
    comment?: string,
  ): Promise<RentPayment> {
    const actor = this.requireCurrentUser();
    const payment = await firstValueFrom(
      this.api.markRentPaid(propertyId, month, amount, paidAt, actor.id, comment),
    );
    await this.refresh();
    return payment;
  }

  async updateRentPaid(
    propertyId: string,
    month: string,
    amount: number,
    paidAt: string,
    comment?: string,
  ): Promise<void> {
    const actor = this.requireCurrentUser();
    await firstValueFrom(
      this.api.updateRentPaid(propertyId, month, amount, paidAt, actor.id, comment),
    );
    await this.refresh();
  }

  async deductRentFromDeposit(
    propertyId: string,
    month: string,
    amount: number,
    comment?: string,
  ): Promise<RentPayment> {
    const actor = this.requireCurrentUser();
    const payment = await firstValueFrom(
      this.api.deductRentFromDeposit(propertyId, month, amount, actor.id, comment),
    );
    await this.refresh();
    return payment;
  }

  async addComment(
    propertyId: string,
    author: User,
    body: string,
    photos: PropertyCommentPhoto[],
  ): Promise<PropertyComment> {
    const comment = await firstValueFrom(this.api.addComment(propertyId, author.id, body, photos));
    await this.refresh();
    return comment;
  }

  async refreshExpenses(actorUserId?: string): Promise<PropertyExpense[]> {
    const userId = actorUserId ?? this.currentUserId();

    if (!userId) {
      this.state.update((state) => ({ ...state, expenses: [] }));
      return [];
    }

    const actor = this.state().users.find((user) => user.id === userId);

    if (!actor || actor.role === 'USER') {
      this.state.update((state) => ({ ...state, expenses: [] }));
      return [];
    }

    this.beginLoading();

    try {
      const expenses = await firstValueFrom(
        this.api.listExpenses(userId).pipe(timeout(API_TIMEOUT_MS)),
      );
      this.state.update((state) => ({ ...state, expenses }));
      return expenses;
    } finally {
      this.endLoading();
    }
  }

  async addExpense(input: PropertyExpenseInput): Promise<PropertyExpense> {
    const actor = this.requireCurrentUser();
    const expense = await firstValueFrom(this.api.createExpense(input, actor.id));
    await this.refreshExpenses(actor.id);
    return expense;
  }

  async updateExpense(expenseId: string, input: PropertyExpenseInput): Promise<PropertyExpense> {
    const actor = this.requireCurrentUser();
    const expense = await firstValueFrom(this.api.updateExpense(expenseId, input, actor.id));
    await this.refreshExpenses(actor.id);
    return expense;
  }

  async deleteExpense(expenseId: string): Promise<void> {
    const actor = this.requireCurrentUser();
    await firstValueFrom(this.api.deleteExpense(expenseId, actor.id));
    await this.refreshExpenses(actor.id);
  }

  async expenseAttachment(expenseId: string): Promise<ExpenseAttachment> {
    const actor = this.requireCurrentUser();
    return firstValueFrom(this.api.getExpenseAttachment(expenseId, actor.id));
  }

  async saveContract(propertyId: string, content: string): Promise<void> {
    await firstValueFrom(this.api.saveContract(propertyId, content));
    await this.refresh();
  }

  async regenerateContract(propertyId: string): Promise<LeaseContract> {
    const contract = await firstValueFrom(this.api.regenerateContract(propertyId));
    await this.refresh();
    return contract;
  }

  async addListing(input: ListingInput): Promise<MarketplaceListing> {
    const listing = await firstValueFrom(this.api.createListing(input));
    await this.refresh();
    return listing;
  }

  async updateListing(listingId: string, input: ListingInput): Promise<MarketplaceListing> {
    const listing = await firstValueFrom(this.api.updateListing(listingId, input));
    await this.refresh();
    return listing;
  }

  async archiveListing(listingId: string, ownerUserId: string): Promise<MarketplaceListing> {
    const listing = await firstValueFrom(this.api.archiveListing(listingId, ownerUserId));
    await this.refresh();
    return listing;
  }

  async restoreListing(listingId: string, ownerUserId: string): Promise<MarketplaceListing> {
    const listing = await firstValueFrom(this.api.restoreListing(listingId, ownerUserId));
    await this.refresh();
    return listing;
  }

  async updateListingStatus(
    listingId: string,
    ownerUserId: string,
    status: ListingStatus,
  ): Promise<MarketplaceListing> {
    const listing = await firstValueFrom(
      this.api.updateListingStatus(listingId, ownerUserId, status),
    );
    await this.refresh();
    return listing;
  }

  async trackListingView(listingId: string, viewerUserId?: string): Promise<MarketplaceListing> {
    const listing = await firstValueFrom(this.api.trackListingView(listingId, viewerUserId));
    await this.refresh();
    return listing;
  }

  async boostListing(
    listingId: string,
    adminUserId: string,
    boosted: boolean,
    boostedUntil?: string,
  ): Promise<MarketplaceListing> {
    const listing = await firstValueFrom(
      this.api.boostListing(listingId, adminUserId, boosted, boostedUntil),
    );
    await this.refresh();
    return listing;
  }

  async sendListingMessage(
    listingId: string,
    senderId: string,
    body: string,
    recipientId?: string,
  ): Promise<ListingMessage> {
    const message = await firstValueFrom(
      this.api.sendListingMessage(listingId, senderId, body, recipientId),
    );
    await this.refresh();
    return message;
  }

  async markListingMessageRead(messageId: string, userId: string): Promise<ListingMessage> {
    const message = await firstValueFrom(this.api.markListingMessageRead(messageId, userId));
    await this.refresh();
    return message;
  }

  getListing(listingId: string): MarketplaceListing | undefined {
    return this.state().listings.find((listing) => listing.id === listingId);
  }

  isUserVerified(userId?: string): boolean {
    return Boolean(
      userId &&
      this.state().users.find((user) => user.id === userId)?.verificationStatus === 'VERIFIED',
    );
  }

  isListingOwnerActive(listing: MarketplaceListing): boolean {
    return this.state().users.some(
      (user) => user.id === listing.ownerUserId && (user.status ?? 'ACTIVE') === 'ACTIVE',
    );
  }

  portfolioStatsForMonth(month: string): PortfolioStats {
    const properties = this.visibleProperties();
    const occupied = properties.filter((property) => Boolean(property.tenantId));
    const totals = occupied.reduce(
      (summary, property) => {
        const snapshot = this.rentSnapshotForProperty(property, month);
        return {
          expectedAmount: summary.expectedAmount + snapshot.expectedAmount,
          collectedAmount: summary.collectedAmount + snapshot.paidAmount,
          deductedFromDeposit: summary.deductedFromDeposit + snapshot.deductionAmount,
          remainingAmount: summary.remainingAmount + snapshot.remainingAmount,
        };
      },
      {
        expectedAmount: 0,
        collectedAmount: 0,
        deductedFromDeposit: 0,
        remainingAmount: 0,
      },
    );

    return {
      total: properties.length,
      occupied: occupied.length,
      available: properties.length - occupied.length,
      ...totals,
    };
  }

  agentRentSummaries(user: User | null, month = currentMonth()): AgentRentSummary[] {
    const managers =
      user?.role === 'MANAGER'
        ? this.managers().filter((manager) => manager.id === user.id)
        : this.managers();

    return managers.map((manager) => {
      const assigned = this.state().properties.filter(
        (property) => property.managerId === manager.id,
      );
      const occupied = assigned.filter((property) => Boolean(property.tenantId));
      const totals = occupied.reduce(
        (summary, property) => {
          const snapshot = this.rentSnapshotForProperty(property, month);
          return {
            expectedAmount: summary.expectedAmount + snapshot.expectedAmount,
            collectedAmount: summary.collectedAmount + snapshot.paidAmount,
            deductedFromDeposit: summary.deductedFromDeposit + snapshot.deductionAmount,
            remainingAmount: summary.remainingAmount + snapshot.remainingAmount,
          };
        },
        {
          expectedAmount: 0,
          collectedAmount: 0,
          deductedFromDeposit: 0,
          remainingAmount: 0,
        },
      );

      return {
        managerId: manager.id,
        managerName: manager.name,
        assignedCount: assigned.length,
        occupiedCount: occupied.length,
        availableCount: assigned.length - occupied.length,
        ...totals,
      };
    });
  }

  rentSnapshotForProperty(property: PropertyUnit, month: string): RentPaymentSnapshot {
    const payment = this.state().payments.find(
      (candidate) => candidate.propertyId === property.id && candidate.month === month,
    );
    const expectedAmount = property.tenantId ? property.rent : 0;
    const paidAmount = payment?.paidAmount ?? 0;
    const deductionAmount = payment?.deductionAmount ?? 0;
    const remainingAmount = Math.max(expectedAmount - paidAmount - deductionAmount, 0);

    return {
      propertyId: property.id,
      month,
      expectedAmount,
      paidAmount,
      deductionAmount,
      remainingAmount,
      status: payment?.status ?? 'PENDING',
      paymentId: payment?.id,
      paidAt: payment?.paidAt,
      comment: payment?.comment,
      updatedAt: payment?.updatedAt,
    };
  }

  paymentHistoryForProperty(propertyId: string): RentPayment[] {
    return [...this.state().payments]
      .filter((payment) => payment.propertyId === propertyId)
      .sort((a, b) => b.month.localeCompare(a.month));
  }

  occupancyHistoryForProperty(propertyId: string) {
    return [...this.state().occupancies]
      .filter((occupancy) => occupancy.propertyId === propertyId)
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  }

  rentHistoryForProperty(propertyId: string, throughMonth = currentMonth()): RentHistoryPoint[] {
    const property = this.state().properties.find((candidate) => candidate.id === propertyId);

    if (!property) {
      return [];
    }

    return this.occupancyHistoryForProperty(propertyId).flatMap((occupancy) => {
      const endMonth = occupancy.endedAt ? occupancy.endedAt.slice(0, 7) : throughMonth;
      return monthRange(occupancy.startedAt.slice(0, 7), endMonth).map((month) => {
        const payment = this.state().payments.find(
          (candidate) =>
            candidate.propertyId === propertyId &&
            candidate.tenantId === occupancy.tenantId &&
            candidate.month === month,
        );

        const expectedAmount = payment?.expectedAmount ?? property.rent;
        const paidAmount = payment?.paidAmount ?? 0;
        const deductionAmount = payment?.deductionAmount ?? 0;

        return {
          propertyId,
          tenantId: occupancy.tenantId,
          tenantName: occupancy.tenantName,
          occupancyId: occupancy.id,
          startedAt: occupancy.startedAt,
          endedAt: occupancy.endedAt,
          month,
          expectedAmount,
          paidAmount,
          deductionAmount,
          remainingAmount: Math.max(expectedAmount - paidAmount - deductionAmount, 0),
          status: payment?.status ?? 'PENDING',
          paymentId: payment?.id,
          paidAt: payment?.paidAt,
          comment: payment?.comment,
          updatedAt: payment?.updatedAt,
        };
      });
    });
  }

  commentsForProperty(propertyId: string): PropertyComment[] {
    return this.state().comments.filter((comment) => comment.propertyId === propertyId);
  }

  getTenantForProperty(property: PropertyUnit): Tenant | undefined {
    return property.tenantId
      ? this.state().tenants.find((tenant) => tenant.id === property.tenantId)
      : undefined;
  }

  getContractForProperty(propertyId: string): LeaseContract | undefined {
    return this.state().contracts.find((contract) => contract.propertyId === propertyId);
  }

  getManagerName(managerId?: string): string {
    if (!managerId) {
      return 'Non attribué';
    }

    return this.state().users.find((user) => user.id === managerId)?.name ?? 'Gérant inconnu';
  }

  getOwnerName(ownerId?: string): string {
    if (!ownerId) {
      return 'Locataire non renseigné';
    }

    return (
      this.state().owners.find((owner) => owner.id === ownerId)?.fullName ?? 'Locataire inconnu'
    );
  }

  getTenantName(tenantId?: string): string {
    if (!tenantId) {
      return 'Aucun locataire';
    }

    return this.state().tenants.find((tenant) => tenant.id === tenantId)?.fullName ?? 'Inconnu';
  }

  propertyComposition(property: PropertyUnit): string {
    const pieces = [`${property.bedroomCount} chambre${property.bedroomCount > 1 ? 's' : ''}`];

    if (property.hasLivingRoom) pieces.push('salon');
    if (property.hasInternalWc) pieces.push('WC interne');
    if (property.hasPrivateShower) pieces.push('douche privée');
    if (property.hasKitchen) pieces.push('cuisine');
    if (property.hasBalcony) pieces.push('balcon');

    return pieces.join(' + ');
  }

  private readSession(): string | null {
    if (!this.canUseStorage()) {
      return null;
    }

    return localStorage.getItem(SESSION_KEY);
  }

  private requireCurrentUser(): User {
    const user = this.currentUser();

    if (!user) {
      throw new Error('Session utilisateur introuvable.');
    }

    return user;
  }

  private canUseStorage(): boolean {
    return typeof localStorage !== 'undefined';
  }

  private beginLoading(): void {
    this.loadingOperations.update((count) => count + 1);
  }

  private endLoading(): void {
    this.loadingOperations.update((count) => Math.max(0, count - 1));
  }

  private async refreshExpensesForCurrentUser(): Promise<void> {
    try {
      await this.refreshExpenses();
    } catch {
      this.state.update((state) => ({ ...state, expenses: [] }));
    }
  }
}

function createEmptyState(): AppState {
  return {
    users: [],
    owners: [],
    properties: [],
    tenants: [],
    contracts: [],
    occupancies: [],
    payments: [],
    comments: [],
    expenses: [],
    listings: [],
    listingMessages: [],
  };
}

function sortListingsByVisibility(listings: MarketplaceListing[]): MarketplaceListing[] {
  return [...listings].sort((first, second) => {
    const boosted = Number(isListingBoostActive(second)) - Number(isListingBoostActive(first));

    if (boosted !== 0) {
      return boosted;
    }

    const views = (second.viewCount ?? 0) - (first.viewCount ?? 0);

    if (views !== 0) {
      return views;
    }

    return (second.createdAt ?? '').localeCompare(first.createdAt ?? '');
  });
}

function isListingBoostActive(listing: MarketplaceListing): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return Boolean(listing.boosted && (!listing.boostedUntil || listing.boostedUntil >= today));
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function monthRange(start: string, end: string): string[] {
  const months: string[] = [];
  const [startYear, startMonth] = start.split('-').map(Number);
  const [endYear, endMonth] = end.split('-').map(Number);
  let cursor = startYear * 12 + startMonth - 1;
  const limit = endYear * 12 + endMonth - 1;

  while (cursor <= limit) {
    const year = Math.floor(cursor / 12);
    const month = (cursor % 12) + 1;
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    cursor += 1;
  }

  return months;
}
