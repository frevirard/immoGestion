import { computed, effect, Injectable, signal } from '@angular/core';
import {
  AgentRentSummary,
  AppState,
  LeaseContract,
  OccupancyRecord,
  PortfolioStats,
  PropertyComment,
  PropertyCommentPhoto,
  PropertyOwner,
  PropertyUnit,
  RentHistoryPoint,
  RentPayment,
  RentPaymentSnapshot,
  Tenant,
  TenantInput,
  User,
} from './models';

const STORAGE_KEY = 'immo-parc-state-v1';
const SESSION_KEY = 'immo-parc-current-user-v1';

type PropertyInput = Omit<PropertyUnit, 'id' | 'createdAt' | 'tenantId'>;

@Injectable({ providedIn: 'root' })
export class ImmoStore {
  readonly state = signal<AppState>(this.loadState());
  readonly currentUserId = signal<string | null>(this.readSession());

  readonly currentUser = computed(() => {
    const userId = this.currentUserId();
    return this.state().users.find((user) => user.id === userId) ?? null;
  });

  readonly managers = computed(() =>
    this.state().users.filter((user) => user.role === 'MANAGER'),
  );

  readonly owners = computed(() => this.state().owners);
  readonly properties = computed(() => this.state().properties);
  readonly tenants = computed(() => this.state().tenants);
  readonly contracts = computed(() => this.state().contracts);
  readonly occupancies = computed(() => this.state().occupancies);
  readonly payments = computed(() => this.state().payments);
  readonly comments = computed(() => this.state().comments);

  readonly visibleProperties = computed(() => {
    const user = this.currentUser();
    const properties = this.properties();

    if (!user) {
      return [];
    }

    if (user.role === 'ADMIN') {
      return properties;
    }

    return properties.filter((property) => property.managerId === user.id);
  });

  constructor() {
    effect(() => {
      this.saveState(this.state());
    });

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

  login(email: string, password: string): boolean {
    const normalizedEmail = email.trim().toLowerCase();
    const user = this.state().users.find(
      (candidate) =>
        candidate.email.toLowerCase() === normalizedEmail &&
        candidate.password === password,
    );

    if (!user) {
      return false;
    }

    this.currentUserId.set(user.id);
    return true;
  }

  logout(): void {
    this.currentUserId.set(null);
  }

  resetDemoData(): void {
    this.state.set(createSeedState());
    this.currentUserId.set(null);
  }

  addManager(input: Pick<User, 'name' | 'email' | 'phone' | 'password'>): User {
    const manager: User = {
      id: createId('usr'),
      role: 'MANAGER',
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone?.trim(),
      password: input.password,
    };

    this.state.update((state) => ({
      ...state,
      users: [...state.users, manager],
    }));

    return manager;
  }

  addOwner(input: Omit<PropertyOwner, 'id'>): PropertyOwner {
    const owner: PropertyOwner = {
      id: createId('own'),
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim(),
      address: input.address?.trim(),
    };

    this.state.update((state) => ({
      ...state,
      owners: [...state.owners, owner],
    }));

    return owner;
  }

  addTenant(input: TenantInput): Tenant {
    const depositExpected = Number(input.depositExpected) || 0;
    const depositPaidAmount = Number(input.depositPaidAmount) || 0;
    const tenant: Tenant = {
      id: createId('ten'),
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim(),
      profession: input.profession?.trim(),
      idDocument: input.idDocument?.trim(),
      emergencyContact: input.emergencyContact?.trim(),
      startDate: input.startDate,
      depositExpected,
      depositPaidAmount,
      depositPaidAt: normalizeOptionalId(input.depositPaidAt),
      depositBalance: depositPaidAmount,
    };

    this.state.update((state) => ({
      ...state,
      tenants: [tenant, ...state.tenants],
    }));

    return tenant;
  }

  updateTenant(tenantId: string, input: TenantInput): Tenant {
    const existingTenant = this.state().tenants.find((tenant) => tenant.id === tenantId);

    if (!existingTenant) {
      throw new Error('Locataire introuvable.');
    }

    const depositExpected = Number(input.depositExpected) || 0;
    const depositPaidAmount = Number(input.depositPaidAmount) || 0;
    const deductions = totalDepositDeductionsForTenant(this.state().payments, tenantId);
    const updatedTenant: Tenant = {
      ...existingTenant,
      fullName: input.fullName.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim(),
      profession: input.profession?.trim(),
      idDocument: input.idDocument?.trim(),
      emergencyContact: input.emergencyContact?.trim(),
      startDate: input.startDate,
      depositExpected,
      depositPaidAmount,
      depositPaidAt: normalizeOptionalId(input.depositPaidAt),
      depositBalance: Math.max(depositPaidAmount - deductions, 0),
    };

    this.state.update((state) => ({
      ...state,
      tenants: state.tenants.map((tenant) =>
        tenant.id === tenantId ? updatedTenant : tenant,
      ),
      occupancies: state.occupancies.map((occupancy) =>
        occupancy.tenantId === tenantId
          ? { ...occupancy, tenantName: updatedTenant.fullName }
          : occupancy,
      ),
    }));

    return updatedTenant;
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

  deleteTenant(tenantId: string): void {
    if (!this.canDeleteTenant(tenantId)) {
      throw new Error('Impossible de supprimer un locataire déjà rattaché à un bien.');
    }

    this.state.update((state) => ({
      ...state,
      tenants: state.tenants.filter((tenant) => tenant.id !== tenantId),
    }));
  }

  addProperty(input: PropertyInput): PropertyUnit {
    const property: PropertyUnit = {
      ...this.normalizePropertyInput(input),
      id: createId('b'),
      createdAt: today(),
    };

    this.state.update((state) => ({
      ...state,
      properties: [property, ...state.properties],
    }));

    return property;
  }

  updateProperty(propertyId: string, input: PropertyInput): PropertyUnit {
    const normalizedInput = this.normalizePropertyInput(input);
    let updatedProperty: PropertyUnit | undefined;

    this.state.update((state) => {
      const existingProperty = state.properties.find((property) => property.id === propertyId);

      if (!existingProperty) {
        return state;
      }

      updatedProperty = {
        ...existingProperty,
        ...normalizedInput,
      };

      return {
        ...state,
        properties: state.properties.map((property) =>
          property.id === propertyId ? updatedProperty! : property,
        ),
      };
    });

    if (!updatedProperty) {
      throw new Error('Bien introuvable.');
    }

    return updatedProperty;
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
        !state.comments.some((comment) => comment.propertyId === propertyId),
    );
  }

  deleteProperty(propertyId: string): void {
    if (!this.canDeleteProperty(propertyId)) {
      throw new Error(
        'Impossible de supprimer un bien déjà rattaché à un locataire ou possédant un historique.',
      );
    }

    this.state.update((state) => ({
      ...state,
      properties: state.properties.filter((property) => property.id !== propertyId),
    }));
  }

  assignManager(propertyId: string, managerId: string): void {
    const normalizedManagerId = normalizeOptionalId(managerId);
    this.state.update((state) => ({
      ...state,
      properties: state.properties.map((property) =>
        property.id === propertyId
          ? { ...property, managerId: normalizedManagerId }
          : property,
      ),
    }));
  }

  assignOwner(propertyId: string, ownerId: string): void {
    const normalizedOwnerId = normalizeOptionalId(ownerId);
    this.state.update((state) => ({
      ...state,
      properties: state.properties.map((property) =>
        property.id === propertyId ? { ...property, ownerId: normalizedOwnerId } : property,
      ),
    }));
  }

  upsertTenantForProperty(propertyId: string, input: TenantInput, replaceCurrent = false): Tenant {
    const property = this.state().properties.find((candidate) => candidate.id === propertyId);

    if (!property) {
      throw new Error('Bien introuvable');
    }

    let savedTenant: Tenant | undefined;

    this.state.update((state) => {
      const currentProperty = state.properties.find((candidate) => candidate.id === propertyId);

      if (!currentProperty) {
        return state;
      }

      const existingTenant = currentProperty.tenantId
        ? state.tenants.find((tenant) => tenant.id === currentProperty.tenantId)
        : undefined;

      const shouldCreateNewTenant = replaceCurrent || !existingTenant;
      const tenantId = shouldCreateNewTenant ? createId('ten') : existingTenant!.id;
      const depositExpected = Number(input.depositExpected) || currentProperty.deposit || 0;
      const depositPaidAmount = Number(input.depositPaidAmount) || 0;
      const deductions = totalDepositDeductionsForTenant(state.payments, tenantId);
      const tenantToSave: Tenant = {
        id: tenantId,
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        email: input.email?.trim(),
        profession: input.profession?.trim(),
        idDocument: input.idDocument?.trim(),
        emergencyContact: input.emergencyContact?.trim(),
        startDate: input.startDate,
        depositExpected,
        depositPaidAmount,
        depositPaidAt: normalizeOptionalId(input.depositPaidAt),
        depositBalance: Math.max(depositPaidAmount - deductions, 0),
      };
      savedTenant = tenantToSave;

      const tenants = existingTenant && !shouldCreateNewTenant
        ? state.tenants.map((tenant) => (tenant.id === tenantToSave.id ? tenantToSave : tenant))
        : [...state.tenants, tenantToSave];

      const properties = state.properties.map((candidate) =>
        candidate.id === propertyId ? { ...candidate, tenantId: tenantToSave.id } : candidate,
      );

      const openOccupancy = state.occupancies.find(
        (occupancy) => occupancy.propertyId === propertyId && !occupancy.endedAt,
      );
      const occupancies =
        shouldCreateNewTenant || !openOccupancy
          ? [
              ...state.occupancies.map((occupancy) =>
                occupancy.propertyId === propertyId && !occupancy.endedAt
                  ? {
                      ...occupancy,
                      endedAt: previousDay(input.startDate),
                    }
                  : occupancy,
              ),
              {
                id: createId('occ'),
                propertyId,
                tenantId: tenantToSave.id,
                tenantName: tenantToSave.fullName,
                startedAt: tenantToSave.startDate,
                createdAt: today(),
              },
            ]
          : state.occupancies.map((occupancy) =>
              occupancy.id === openOccupancy.id
                ? {
                    ...occupancy,
                    tenantName: tenantToSave.fullName,
                    startedAt: tenantToSave.startDate,
                  }
                : occupancy,
            );

      const existingContract = state.contracts.find(
        (contract) => contract.propertyId === propertyId,
      );

      const contracts = existingContract
        ? state.contracts.map((contract) =>
            contract.propertyId === propertyId
              ? {
                  ...contract,
                  tenantId: tenantToSave.id,
                  startDate: tenantToSave.startDate,
                  monthlyRent: currentProperty.rent,
                  deposit: tenantToSave.depositExpected,
                  updatedAt: today(),
                }
              : contract,
          )
        : [
            ...state.contracts,
            this.createContract(currentProperty, tenantToSave, state.owners, today()),
          ];

      return {
        ...state,
        properties,
        tenants,
        contracts,
        occupancies,
      };
    });

    if (!savedTenant) {
      throw new Error('Locataire non enregistré');
    }

    return savedTenant;
  }

  markRentPaid(propertyId: string, month: string, paidAt: string, comment?: string): RentPayment {
    const state = this.state();
    const property = state.properties.find((candidate) => candidate.id === propertyId);

    if (!property?.tenantId) {
      throw new Error('Sélectionne un bien occupé.');
    }

    const existing = state.payments.find(
      (payment) => payment.propertyId === propertyId && payment.month === month,
    );

    const payment: RentPayment = {
      id: existing?.id ?? createId('pay'),
      propertyId,
      tenantId: property.tenantId,
      managerId: property.managerId,
      month,
      expectedAmount: property.rent,
      paidAmount: property.rent,
      deductionAmount: 0,
      status: 'PAID',
      paidAt,
      comment: comment?.trim(),
      createdAt: existing?.createdAt ?? today(),
      updatedAt: today(),
    };

    this.state.update((currentState) => {
      const shouldRestoreDeposit =
        existing?.status === 'DEDUCTED_FROM_DEPOSIT' && existing.deductionAmount > 0;

      const tenants = shouldRestoreDeposit
        ? currentState.tenants.map((tenant) =>
            tenant.id === existing.tenantId
              ? {
                  ...tenant,
                  depositBalance: tenant.depositBalance + existing.deductionAmount,
                }
              : tenant,
          )
        : currentState.tenants;

      const payments = existing
        ? currentState.payments.map((candidate) =>
            candidate.id === existing.id ? payment : candidate,
          )
        : [...currentState.payments, payment];

      return {
        ...currentState,
        tenants,
        payments,
      };
    });

    return payment;
  }

  deductRentFromDeposit(propertyId: string, month: string, comment?: string): RentPayment {
    const state = this.state();
    const property = state.properties.find((candidate) => candidate.id === propertyId);

    if (!property?.tenantId) {
      throw new Error('Sélectionne un bien occupé.');
    }

    const tenant = state.tenants.find((candidate) => candidate.id === property.tenantId);

    if (!tenant) {
      throw new Error('Locataire introuvable.');
    }

    const existing = state.payments.find(
      (payment) => payment.propertyId === propertyId && payment.month === month,
    );

    if (existing?.status === 'PAID') {
      throw new Error('Ce loyer est déjà marqué comme encaissé.');
    }

    if (existing?.status === 'DEDUCTED_FROM_DEPOSIT') {
      throw new Error('Ce loyer a déjà été déduit de la caution.');
    }

    const amountToDeduct = property.rent;

    if (tenant.depositBalance < amountToDeduct) {
      throw new Error('Caution insuffisante pour couvrir ce loyer impayé.');
    }

    const payment: RentPayment = {
      id: existing?.id ?? createId('pay'),
      propertyId,
      tenantId: tenant.id,
      managerId: property.managerId,
      month,
      expectedAmount: property.rent,
      paidAmount: 0,
      deductionAmount: amountToDeduct,
      status: 'DEDUCTED_FROM_DEPOSIT',
      paidAt: today(),
      comment: comment?.trim() || 'Loyer impayé déduit de la caution.',
      createdAt: existing?.createdAt ?? today(),
      updatedAt: today(),
    };

    this.state.update((currentState) => {
      const tenants = currentState.tenants.map((candidate) =>
        candidate.id === tenant.id
          ? {
              ...candidate,
              depositBalance: candidate.depositBalance - amountToDeduct,
            }
          : candidate,
      );

      const payments = existing
        ? currentState.payments.map((candidate) =>
            candidate.id === existing.id ? payment : candidate,
          )
        : [...currentState.payments, payment];

      return {
        ...currentState,
        tenants,
        payments,
      };
    });

    return payment;
  }

  addComment(
    propertyId: string,
    author: User,
    body: string,
    photos: PropertyCommentPhoto[],
  ): PropertyComment {
    const comment: PropertyComment = {
      id: createId('com'),
      propertyId,
      authorId: author.id,
      authorName: author.name,
      body: body.trim(),
      photos,
      createdAt: new Date().toISOString(),
    };

    this.state.update((state) => ({
      ...state,
      comments: [comment, ...state.comments],
    }));

    return comment;
  }

  saveContract(propertyId: string, content: string): void {
    this.state.update((state) => ({
      ...state,
      contracts: state.contracts.map((contract) =>
        contract.propertyId === propertyId
          ? { ...contract, content, updatedAt: today() }
          : contract,
      ),
    }));
  }

  regenerateContract(propertyId: string): LeaseContract | undefined {
    let regenerated: LeaseContract | undefined;

    this.state.update((state) => {
      const property = state.properties.find((candidate) => candidate.id === propertyId);
      const tenant = property?.tenantId
        ? state.tenants.find((candidate) => candidate.id === property.tenantId)
        : undefined;

      if (!property || !tenant) {
        return state;
      }

      const regeneratedContract = this.createContract(property, tenant, state.owners, today());
      regenerated = regeneratedContract;

      const hasExisting = state.contracts.some((contract) => contract.propertyId === propertyId);
      const contracts = hasExisting
        ? state.contracts.map((contract) =>
            contract.propertyId === propertyId
              ? { ...regeneratedContract, id: contract.id, createdAt: contract.createdAt }
              : contract,
          )
        : [...state.contracts, regeneratedContract];

      return {
        ...state,
        contracts,
      };
    });

    return regenerated;
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
      paidAt: payment?.paidAt,
      comment: payment?.comment,
    };
  }

  paymentHistoryForProperty(propertyId: string): RentPayment[] {
    return [...this.state().payments]
      .filter((payment) => payment.propertyId === propertyId)
      .sort((a, b) => b.month.localeCompare(a.month) || b.updatedAt.localeCompare(a.updatedAt));
  }

  occupancyHistoryForProperty(propertyId: string): OccupancyRecord[] {
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
      const endMonth = minMonth(monthFromDate(occupancy.endedAt ?? `${throughMonth}-01`), throughMonth);
      const months = monthRange(monthFromDate(occupancy.startedAt), endMonth);

      return months.map((month) => {
        const payment =
          this.state().payments.find(
            (candidate) =>
              candidate.propertyId === propertyId &&
              candidate.tenantId === occupancy.tenantId &&
              candidate.month === month,
          ) ??
          this.state().payments.find(
            (candidate) => candidate.propertyId === propertyId && candidate.month === month,
          );
        const expectedAmount = payment?.expectedAmount ?? property.rent;
        const paidAmount = payment?.paidAmount ?? 0;
        const deductionAmount = payment?.deductionAmount ?? 0;
        const remainingAmount = Math.max(expectedAmount - paidAmount - deductionAmount, 0);

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
          remainingAmount,
          status: payment?.status ?? 'PENDING',
          paidAt: payment?.paidAt,
          comment: payment?.comment,
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
      return 'Locateur non renseigné';
    }

    return (
      this.state().owners.find((owner) => owner.id === ownerId)?.fullName ??
      'Locateur inconnu'
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

    if (property.hasLivingRoom) {
      pieces.push('salon');
    }

    if (property.hasInternalWc) {
      pieces.push('WC interne');
    }

    if (property.hasPrivateShower) {
      pieces.push('douche privée');
    }

    if (property.hasKitchen) {
      pieces.push('cuisine');
    }

    if (property.hasBalcony) {
      pieces.push('balcon');
    }

    return pieces.join(' + ');
  }

  private normalizePropertyInput(input: PropertyInput): PropertyInput {
    return {
      ...input,
      reference: input.reference.trim(),
      address: input.address.trim(),
      district: input.district.trim(),
      category: input.category.trim(),
      bedroomCount: Number(input.bedroomCount) || 0,
      managerId: normalizeOptionalId(input.managerId),
      ownerId: normalizeOptionalId(input.ownerId),
      rent: Number(input.rent) || 0,
      deposit: Number(input.deposit) || 0,
      charges: Number(input.charges) || 0,
      notes: input.notes?.trim(),
    };
  }

  private createContract(
    property: PropertyUnit,
    tenant: Tenant,
    owners: PropertyOwner[],
    generatedAt: string,
  ): LeaseContract {
    const owner =
      owners.find((candidate) => candidate.id === property.ownerId)?.fullName ??
      'locateur à renseigner';

    return {
      id: createId('ctr'),
      propertyId: property.id,
      tenantId: tenant.id,
      startDate: tenant.startDate,
      monthlyRent: property.rent,
      deposit: tenant.depositExpected,
      createdAt: generatedAt,
      updatedAt: generatedAt,
      content: [
        'CONTRAT DE LOCATION',
        '',
        `Référence du bien : ${property.reference}`,
        `Adresse : ${property.address}, ${property.district}`,
        `Composition : ${this.propertyComposition(property)}`,
        '',
        `Entre le locateur : ${owner}`,
        `Et le locataire : ${tenant.fullName}`,
        tenant.idDocument ? `Pièce d'identité : ${tenant.idDocument}` : '',
        tenant.phone ? `Téléphone du locataire : ${tenant.phone}` : '',
        '',
        `Le présent contrat prend effet le ${formatDate(tenant.startDate)}.`,
        `Le loyer mensuel est fixé à ${formatMoney(property.rent)}.`,
        `La caution prévue est fixée à ${formatMoney(tenant.depositExpected)}.`,
        `La caution reçue est de ${formatMoney(tenant.depositPaidAmount)}${
          tenant.depositPaidAt ? `, reçue le ${formatDate(tenant.depositPaidAt)}` : ''
        }.`,
        `Le solde actuel de caution est de ${formatMoney(tenant.depositBalance)}.`,
        property.charges
          ? `Les charges mensuelles sont estimées à ${formatMoney(property.charges)}.`
          : '',
        '',
        'Article 1 - Objet',
        'Le locateur donne en location le bien désigné ci-dessus au locataire, qui accepte de l’occuper paisiblement et conformément à sa destination.',
        '',
        'Article 2 - Paiement',
        'Le loyer est payable à la fin de chaque mois auprès du gérant désigné ou de toute personne mandatée par le locateur.',
        '',
        'Article 3 - Caution',
        'En cas de loyer impayé, une déduction sur caution peut être enregistrée si le solde disponible est suffisant. Le solde de caution est alors recalculé.',
        '',
        'Article 4 - Entretien',
        'Le locataire s’engage à maintenir le bien en bon état, à signaler toute dégradation et à ne pas réaliser de transformation sans accord préalable.',
        '',
        'Fait pour servir et valoir ce que de droit.',
        '',
        'Signature du locateur : ____________________',
        'Signature du locataire : ___________________',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  private loadState(): AppState {
    if (!this.canUseStorage()) {
      return createSeedState();
    }

    const rawState = localStorage.getItem(STORAGE_KEY);

    if (!rawState) {
      return createSeedState();
    }

    try {
      return normalizeState(JSON.parse(rawState) as Partial<AppState>);
    } catch {
      return createSeedState();
    }
  }

  private saveState(state: AppState): void {
    if (!this.canUseStorage()) {
      return;
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  private readSession(): string | null {
    if (!this.canUseStorage()) {
      return null;
    }

    return localStorage.getItem(SESSION_KEY);
  }

  private canUseStorage(): boolean {
    return typeof localStorage !== 'undefined';
  }
}

function createSeedState(): AppState {
  const admin: User = {
    id: 'usr-admin',
    name: 'Administrateur',
    email: 'admin@immo.local',
    password: 'admin123',
    role: 'ADMIN',
    phone: '+225 07 00 00 00 00',
  };

  const managerAwa: User = {
    id: 'usr-awa',
    name: 'Awa Traoré',
    email: 'awa@immo.local',
    password: 'gerant123',
    role: 'MANAGER',
    phone: '+225 05 44 12 89 10',
  };

  const managerJean: User = {
    id: 'usr-jean',
    name: 'Jean Kouamé',
    email: 'jean@immo.local',
    password: 'gerant123',
    role: 'MANAGER',
    phone: '+225 07 18 30 11 22',
  };

  const ownerDiallo: PropertyOwner = {
    id: 'own-diallo',
    fullName: 'M. Abdoulaye Diallo',
    phone: '+225 01 22 33 44 55',
    email: 'diallo@example.com',
    address: 'Cocody Angré',
  };

  const ownerKone: PropertyOwner = {
    id: 'own-kone',
    fullName: 'Mme Mariam Koné',
    phone: '+225 07 66 77 88 99',
    email: 'kone@example.com',
    address: 'Yopougon Niangon',
  };

  const tenantMamadou: Tenant = {
    id: 'ten-mamadou',
    fullName: 'Mamadou Bamba',
    phone: '+225 05 08 08 08 08',
    email: 'mamadou@example.com',
    profession: 'Commerçant',
    idDocument: 'CNI CI-2026-004512',
    emergencyContact: '+225 07 10 10 10 10',
    startDate: '2026-07-01',
    depositExpected: 240000,
    depositPaidAmount: 240000,
    depositPaidAt: '2026-07-01',
    depositBalance: 240000,
  };

  const tenantSarah: Tenant = {
    id: 'ten-sarah',
    fullName: 'Sarah Akissi',
    phone: '+225 01 09 09 09 09',
    email: 'sarah@example.com',
    profession: 'Étudiante',
    idDocument: 'CNI CI-2025-091102',
    emergencyContact: '+225 05 20 20 20 20',
    startDate: '2026-06-15',
    depositExpected: 400000,
    depositPaidAmount: 400000,
    depositPaidAt: '2026-06-15',
    depositBalance: 400000,
  };

  const properties: PropertyUnit[] = [
    {
      id: 'b-001',
      reference: 'ANG-001',
      address: 'Immeuble Les Palmiers',
      district: 'Angré 8e tranche',
      category: 'Chambre',
      bedroomCount: 1,
      hasLivingRoom: false,
      hasInternalWc: true,
      hasPrivateShower: true,
      hasKitchen: false,
      hasBalcony: false,
      rent: 60000,
      deposit: 120000,
      charges: 5000,
      managerId: managerAwa.id,
      ownerId: ownerDiallo.id,
      createdAt: '2026-07-01',
      notes: 'Chambre simple avec WC interne.',
    },
    {
      id: 'b-002',
      reference: 'ANG-002',
      address: 'Immeuble Les Palmiers',
      district: 'Angré 8e tranche',
      category: 'Chambre salon',
      bedroomCount: 1,
      hasLivingRoom: true,
      hasInternalWc: true,
      hasPrivateShower: true,
      hasKitchen: true,
      hasBalcony: false,
      rent: 120000,
      deposit: 240000,
      charges: 10000,
      managerId: managerAwa.id,
      ownerId: ownerDiallo.id,
      tenantId: tenantMamadou.id,
      createdAt: '2026-06-20',
      notes: 'Bien occupé, contrat éditable.',
    },
    {
      id: 'b-003',
      reference: 'YOP-101',
      address: 'Résidence Akwaba',
      district: 'Yopougon Niangon',
      category: 'Deux chambres salon',
      bedroomCount: 2,
      hasLivingRoom: true,
      hasInternalWc: true,
      hasPrivateShower: true,
      hasKitchen: true,
      hasBalcony: true,
      rent: 200000,
      deposit: 400000,
      charges: 15000,
      managerId: managerJean.id,
      ownerId: ownerKone.id,
      tenantId: tenantSarah.id,
      createdAt: '2026-06-10',
      notes: 'Appartement familial avec balcon.',
    },
    {
      id: 'b-004',
      reference: 'COC-017',
      address: 'Cour commune Soleil',
      district: 'Cocody Riviera',
      category: 'Studio',
      bedroomCount: 1,
      hasLivingRoom: false,
      hasInternalWc: false,
      hasPrivateShower: false,
      hasKitchen: true,
      hasBalcony: false,
      rent: 85000,
      deposit: 170000,
      charges: 7000,
      ownerId: ownerKone.id,
      createdAt: '2026-07-10',
      notes: 'En attente d’attribution à un gérant.',
    },
  ];

  const payments: RentPayment[] = [
    {
      id: 'pay-mamadou-2026-07',
      propertyId: 'b-002',
      tenantId: tenantMamadou.id,
      managerId: managerAwa.id,
      month: '2026-07',
      expectedAmount: 120000,
      paidAmount: 120000,
      deductionAmount: 0,
      status: 'PAID',
      paidAt: '2026-07-05',
      comment: 'Paiement reçu en espèces.',
      createdAt: '2026-07-05',
      updatedAt: '2026-07-05',
    },
    {
      id: 'pay-sarah-2026-06',
      propertyId: 'b-003',
      tenantId: tenantSarah.id,
      managerId: managerJean.id,
      month: '2026-06',
      expectedAmount: 200000,
      paidAmount: 200000,
      deductionAmount: 0,
      status: 'PAID',
      paidAt: '2026-06-30',
      comment: 'Premier loyer encaissé.',
      createdAt: '2026-06-30',
      updatedAt: '2026-06-30',
    },
  ];

  const occupancies: OccupancyRecord[] = [
    {
      id: 'occ-mamadou',
      propertyId: 'b-002',
      tenantId: tenantMamadou.id,
      tenantName: tenantMamadou.fullName,
      startedAt: tenantMamadou.startDate,
      createdAt: tenantMamadou.startDate,
    },
    {
      id: 'occ-sarah',
      propertyId: 'b-003',
      tenantId: tenantSarah.id,
      tenantName: tenantSarah.fullName,
      startedAt: tenantSarah.startDate,
      createdAt: tenantSarah.startDate,
    },
  ];

  const contracts: LeaseContract[] = [
    createSeedContract('ctr-mamadou', properties[1], tenantMamadou, ownerDiallo.fullName, '2026-07-01'),
    createSeedContract('ctr-sarah', properties[2], tenantSarah, ownerKone.fullName, '2026-06-15'),
  ];

  const comments: PropertyComment[] = [
    {
      id: 'com-ang-001',
      propertyId: 'b-001',
      authorId: managerAwa.id,
      authorName: managerAwa.name,
      body: 'Prévoir une visite de contrôle avant la prochaine mise en location.',
      photos: [],
      createdAt: '2026-07-12T09:00:00.000Z',
    },
  ];

  return {
    users: [admin, managerAwa, managerJean],
    owners: [ownerDiallo, ownerKone],
    properties,
    tenants: [tenantMamadou, tenantSarah],
    contracts,
    occupancies,
    payments,
    comments,
  };
}

function normalizeState(rawState: Partial<AppState>): AppState {
  const seed = createSeedState();
  const users = rawState.users?.length ? rawState.users : seed.users;
  const owners = rawState.owners?.length ? rawState.owners : seed.owners;
  const properties = rawState.properties?.length ? rawState.properties : seed.properties;
  const rawPayments = rawState.payments ?? [];
  const payments = rawPayments.map((payment) => normalizePayment(payment));
  const tenants = (rawState.tenants?.length ? rawState.tenants : seed.tenants).map((tenant) =>
    normalizeTenant(tenant, properties, payments),
  );
  const contracts = rawState.contracts?.length ? rawState.contracts : seed.contracts;
  const occupancies = rawState.occupancies?.length
    ? rawState.occupancies
    : createOccupanciesFromCurrentTenants(properties, tenants);
  const comments = (rawState.comments ?? []).map((comment) => ({
    ...comment,
    photos: comment.photos ?? [],
  }));

  return {
    users,
    owners,
    properties,
    tenants,
    contracts,
    occupancies,
    payments,
    comments,
  };
}

function createOccupanciesFromCurrentTenants(
  properties: PropertyUnit[],
  tenants: Tenant[],
): OccupancyRecord[] {
  return properties
    .filter((property) => Boolean(property.tenantId))
    .map((property) => {
      const tenant = tenants.find((candidate) => candidate.id === property.tenantId);
      const startedAt = tenant?.startDate ?? property.createdAt;

      return {
        id: createId('occ'),
        propertyId: property.id,
        tenantId: property.tenantId!,
        tenantName: tenant?.fullName ?? 'Locataire inconnu',
        startedAt,
        createdAt: startedAt,
      };
    });
}

function normalizeTenant(
  tenant: Partial<Tenant> & Pick<Tenant, 'id' | 'fullName' | 'phone' | 'startDate'>,
  properties: PropertyUnit[],
  payments: RentPayment[],
): Tenant {
  const property = properties.find((candidate) => candidate.tenantId === tenant.id);
  const depositExpected = Number(tenant.depositExpected ?? property?.deposit ?? 0);
  const depositPaidAmount = Number(tenant.depositPaidAmount ?? depositExpected);
  const deductionTotal = totalDepositDeductionsForTenant(payments, tenant.id);
  const depositBalance = Number(
    tenant.depositBalance ?? Math.max(depositPaidAmount - deductionTotal, 0),
  );

  return {
    id: tenant.id,
    fullName: tenant.fullName,
    phone: tenant.phone,
    email: tenant.email,
    profession: tenant.profession,
    idDocument: tenant.idDocument,
    emergencyContact: tenant.emergencyContact,
    startDate: tenant.startDate,
    depositExpected,
    depositPaidAmount,
    depositPaidAt: tenant.depositPaidAt ?? tenant.startDate,
    depositBalance,
  };
}

function normalizePayment(payment: Partial<RentPayment> & Pick<RentPayment, 'id' | 'propertyId' | 'tenantId' | 'month'>): RentPayment {
  const status = payment.status === 'DEDUCTED_FROM_DEPOSIT' ? 'DEDUCTED_FROM_DEPOSIT' : 'PAID';
  const paidAmount = Number(payment.paidAmount ?? 0);
  const deductionAmount = Number(payment.deductionAmount ?? 0);
  const timestamp = payment.updatedAt ?? payment.createdAt ?? payment.paidAt ?? today();

  return {
    id: payment.id,
    propertyId: payment.propertyId,
    tenantId: payment.tenantId,
    managerId: payment.managerId,
    month: payment.month,
    expectedAmount: Number(payment.expectedAmount ?? paidAmount + deductionAmount),
    paidAmount,
    deductionAmount,
    status,
    paidAt: payment.paidAt ?? today(),
    comment: payment.comment,
    createdAt: payment.createdAt ?? timestamp,
    updatedAt: timestamp,
  };
}

function totalDepositDeductionsForTenant(payments: RentPayment[], tenantId: string): number {
  return payments
    .filter(
      (payment) =>
        payment.tenantId === tenantId && payment.status === 'DEDUCTED_FROM_DEPOSIT',
    )
    .reduce((sum, payment) => sum + payment.deductionAmount, 0);
}

function createSeedContract(
  id: string,
  property: PropertyUnit,
  tenant: Tenant,
  ownerName: string,
  date: string,
): LeaseContract {
  return {
    id,
    propertyId: property.id,
    tenantId: tenant.id,
    startDate: tenant.startDate,
    monthlyRent: property.rent,
    deposit: tenant.depositExpected,
    createdAt: date,
    updatedAt: date,
    content: [
      'CONTRAT DE LOCATION',
      '',
      `Référence du bien : ${property.reference}`,
      `Adresse : ${property.address}, ${property.district}`,
      `Composition : ${property.bedroomCount} chambre${property.bedroomCount > 1 ? 's' : ''}${
        property.hasLivingRoom ? ' + salon' : ''
      }${property.hasInternalWc ? ' + WC interne' : ''}${
        property.hasPrivateShower ? ' + douche privée' : ''
      }${property.hasKitchen ? ' + cuisine' : ''}${property.hasBalcony ? ' + balcon' : ''}`,
      '',
      `Entre le locateur : ${ownerName}`,
      `Et le locataire : ${tenant.fullName}`,
      tenant.idDocument ? `Pièce d'identité : ${tenant.idDocument}` : '',
      tenant.phone ? `Téléphone du locataire : ${tenant.phone}` : '',
      '',
      `Le présent contrat prend effet le ${formatDate(tenant.startDate)}.`,
      `Le loyer mensuel est fixé à ${formatMoney(property.rent)}.`,
      `La caution reçue est de ${formatMoney(tenant.depositPaidAmount)}${
        tenant.depositPaidAt ? `, reçue le ${formatDate(tenant.depositPaidAt)}` : ''
      }.`,
      '',
      'Fait pour servir et valoir ce que de droit.',
      '',
      'Signature du locateur : ____________________',
      'Signature du locataire : ___________________',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

function normalizeOptionalId(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth(): string {
  return today().slice(0, 7);
}

function monthFromDate(date: string): string {
  return date.slice(0, 7);
}

function minMonth(firstMonth: string, secondMonth: string): string {
  return firstMonth <= secondMonth ? firstMonth : secondMonth;
}

function monthRange(startMonth: string, endMonth: string): string[] {
  if (startMonth > endMonth) {
    return [];
  }

  const months: string[] = [];
  const cursor = new Date(`${startMonth}-01T00:00:00`);
  const end = new Date(`${endMonth}-01T00:00:00`);

  while (cursor <= end) {
    months.push(cursor.toISOString().slice(0, 7));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function previousDay(date: string): string {
  const previous = new Date(`${date}T00:00:00`);
  previous.setDate(previous.getDate() - 1);
  return previous.toISOString().slice(0, 10);
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    maximumFractionDigits: 0,
  })
    .format(amount)
    .replace(/[\u00A0\u202F]/g, ' ');
}

function formatDate(date: string): string {
  if (!date) {
    return '';
  }

  return new Intl.DateTimeFormat('fr-FR').format(new Date(`${date}T00:00:00`));
}
