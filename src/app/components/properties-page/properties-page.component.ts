import { Component, computed, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { ImmoStore } from '../../immo-store';
import { PropertyUnit, RentPaymentStatus } from '../../models';
import { PropertyDetailComponent } from '../property-detail/property-detail.component';
import { LucideIconComponent } from '../lucide-icon.component';

type PropertyFilter = 'ALL' | 'OCCUPIED' | 'AVAILABLE';
type RecoveryFilter = 'ALL' | 'COLLECTED' | 'REMAINING';
type PropertyViewMode = 'LIST' | 'DETAIL';

interface PropertyRecoverySummary {
  expectedAmount: number;
  collectedAmount: number;
  deductedFromDeposit: number;
  remainingAmount: number;
  monthCount: number;
  unpaidMonthCount: number;
}

interface PropertyCard {
  property: PropertyUnit;
  recovery: PropertyRecoverySummary;
}

const PROPERTY_PAGE_SIZE = 8;

@Component({
  selector: 'app-properties-page',
  imports: [PropertyDetailComponent, LucideIconComponent],
  templateUrl: './properties-page.component.html',
  styleUrl: './properties-page.component.scss',
})
export class PropertiesPageComponent {
  readonly store = inject(ImmoStore);
  readonly filter = signal<PropertyFilter>('ALL');
  readonly recoveryFilter = signal<RecoveryFilter>('ALL');
  readonly search = signal('');
  readonly startDate = signal('');
  readonly endDate = signal('');
  readonly selectedPropertyId = signal<string | null>(null);
  readonly viewMode = signal<PropertyViewMode>('LIST');
  readonly propertyPage = signal(1);
  readonly filtersOpen = signal(false);

  @Input({ required: true }) selectedMonth = '';
  @Input() noticeMessage = '';
  @Output() readonly notice = new EventEmitter<string>();

  readonly totalPropertyCount = computed(() => this.store.visibleProperties().length);
  readonly occupiedPropertyCount = computed(
    () => this.store.visibleProperties().filter((property) => this.isOccupied(property)).length,
  );
  readonly availablePropertyCount = computed(
    () => this.totalPropertyCount() - this.occupiedPropertyCount(),
  );
  readonly hasActiveFilters = computed(
    () =>
      this.filter() !== 'ALL' ||
      this.recoveryFilter() !== 'ALL' ||
      Boolean(this.search().trim()) ||
      Boolean(this.startDate()) ||
      Boolean(this.endDate()),
  );

  readonly propertyCards = computed<PropertyCard[]>(() => {
    const properties = this.store.visibleProperties();
    const query = this.normalize(this.search());

    const filteredByStatus = (() => {
      switch (this.filter()) {
        case 'OCCUPIED':
          return properties.filter((property) => this.isOccupied(property));
        case 'AVAILABLE':
          return properties.filter((property) => !this.isOccupied(property));
        default:
          return properties;
      }
    })();

    return filteredByStatus
      .map((property) => ({
        property,
        recovery: this.recoverySummaryForProperty(property),
      }))
      .filter((card) => this.matchesSearch(card.property, query))
      .filter((card) => this.matchesRecoveryFilter(card.recovery));
  });

  readonly visibleProperties = computed(() => {
    return this.propertyCards().map((card) => card.property);
  });

  readonly totalPropertyPages = computed(() =>
    Math.max(1, Math.ceil(this.propertyCards().length / PROPERTY_PAGE_SIZE)),
  );

  readonly currentPropertyPage = computed(() =>
    Math.min(Math.max(1, this.propertyPage()), this.totalPropertyPages()),
  );

  readonly paginatedPropertyCards = computed(() => {
    const start = (this.currentPropertyPage() - 1) * PROPERTY_PAGE_SIZE;
    return this.propertyCards().slice(start, start + PROPERTY_PAGE_SIZE);
  });

  readonly visiblePropertyPages = computed(() => {
    const total = this.totalPropertyPages();
    const current = this.currentPropertyPage();
    const end = Math.min(total, Math.max(5, current + 2));
    const start = Math.max(1, Math.min(current - 2, end - 4));

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });

  readonly periodTotals = computed(() => {
    return this.propertyCards().reduce(
      (totals, card) => ({
        expectedAmount: totals.expectedAmount + card.recovery.expectedAmount,
        collectedAmount: totals.collectedAmount + card.recovery.collectedAmount,
        deductedFromDeposit: totals.deductedFromDeposit + card.recovery.deductedFromDeposit,
        remainingAmount: totals.remainingAmount + card.recovery.remainingAmount,
      }),
      {
        expectedAmount: 0,
        collectedAmount: 0,
        deductedFromDeposit: 0,
        remainingAmount: 0,
      },
    );
  });

  readonly selectedProperty = computed(() => {
    const selectedPropertyId = this.selectedPropertyId();
    return selectedPropertyId
      ? this.store.visibleProperties().find((property) => property.id === selectedPropertyId) ?? null
      : null;
  });

  setFilter(filter: PropertyFilter): void {
    this.filter.set(filter);
    this.resetPropertyPage();
  }

  setRecoveryFilter(filter: RecoveryFilter): void {
    this.recoveryFilter.set(filter);
    this.resetPropertyPage();
  }

  setSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.resetPropertyPage();
  }

  setStartDate(event: Event): void {
    this.startDate.set((event.target as HTMLInputElement).value);
    this.resetPropertyPage();
  }

  setEndDate(event: Event): void {
    this.endDate.set((event.target as HTMLInputElement).value);
    this.resetPropertyPage();
  }

  resetPeriodFilters(): void {
    this.startDate.set('');
    this.endDate.set('');
    this.recoveryFilter.set('ALL');
    this.resetPropertyPage();
  }

  resetAllFilters(): void {
    this.filter.set('ALL');
    this.recoveryFilter.set('ALL');
    this.search.set('');
    this.startDate.set('');
    this.endDate.set('');
    this.resetPropertyPage();
  }

  toggleFilters(): void {
    this.filtersOpen.update((isOpen) => !isOpen);
  }

  selectProperty(propertyId: string): void {
    this.selectedPropertyId.set(propertyId);
  }

  openProperty(propertyId: string): void {
    this.selectedPropertyId.set(propertyId);
    this.viewMode.set('DETAIL');
  }

  openSelectedProperty(): void {
    if (this.selectedProperty()) {
      this.viewMode.set('DETAIL');
    }
  }

  backToList(): void {
    this.viewMode.set('LIST');
  }

  previousPropertyPage(): void {
    this.propertyPage.update((page) => Math.max(1, page - 1));
  }

  nextPropertyPage(): void {
    this.propertyPage.update((page) => Math.min(this.totalPropertyPages(), page + 1));
  }

  goToPropertyPage(page: number): void {
    this.propertyPage.set(Math.min(Math.max(1, page), this.totalPropertyPages()));
  }

  resetPropertyPage(): void {
    this.propertyPage.set(1);
  }

  handleNotice(message: string): void {
    this.notice.emit(message);
  }

  isOccupied(property: PropertyUnit): boolean {
    return Boolean(property.tenantId);
  }

  recoveryStatusLabel(property: PropertyUnit, recovery: PropertyRecoverySummary): string {
    if (!this.isOccupied(property)) {
      return 'Libre';
    }

    if (!recovery.expectedAmount) {
      return 'Aucune échéance';
    }

    if (recovery.remainingAmount > 0) {
      return 'Reste à encaisser';
    }

    return 'Encaissé';
  }

  recoveryStatusClass(property: PropertyUnit, recovery: PropertyRecoverySummary): 'PENDING' | 'PAID' | 'EMPTY' {
    if (!this.isOccupied(property)) {
      return 'EMPTY';
    }

    return recovery.remainingAmount > 0 || !recovery.expectedAmount ? 'PENDING' : 'PAID';
  }

  recoveredAmount(recovery: PropertyRecoverySummary): number {
    return recovery.collectedAmount + recovery.deductedFromDeposit;
  }

  collectionRate(recovery: PropertyRecoverySummary): number {
    if (!recovery.expectedAmount) {
      return 0;
    }

    return Math.min(100, Math.round((this.recoveredAmount(recovery) / recovery.expectedAmount) * 100));
  }

  unpaidMonthLabel(recovery: PropertyRecoverySummary): string {
    if (!recovery.unpaidMonthCount) {
      return 'Aucun mois impayé';
    }

    return `${recovery.unpaidMonthCount} mois non encaissé${recovery.unpaidMonthCount > 1 ? 's' : ''}`;
  }

  periodLabel(): string {
    const { startDate, endDate } = this.normalizedPeriodDates();

    if (!startDate && !endDate) {
      return 'Toutes les échéances connues';
    }

    if (startDate && endDate) {
      return `Du ${this.formatDate(startDate)} au ${this.formatDate(endDate)}`;
    }

    if (startDate) {
      return `Depuis le ${this.formatDate(startDate)}`;
    }

    return `Jusqu’au ${this.formatDate(endDate)}`;
  }

  paymentStatusLabel(snapshot?: { status?: RentPaymentStatus }): string {
    switch (snapshot?.status) {
      case 'PAID':
        return 'Encaissé';
      case 'DEDUCTED_FROM_DEPOSIT':
        return 'Déduit caution';
      default:
        return 'À encaisser';
    }
  }

  paymentStatusClass(snapshot?: { status?: RentPaymentStatus }): RentPaymentStatus {
    return snapshot?.status ?? 'PENDING';
  }

  formatMoney(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      maximumFractionDigits: 0,
    })
      .format(amount)
      .replace(/[\u00A0\u202F]/g, ' ');
  }

  formatDate(date: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${date}T00:00:00`));
  }

  private recoverySummaryForProperty(property: PropertyUnit): PropertyRecoverySummary {
    const { startMonth, endMonth } = this.normalizedPeriodMonths();
    const history = this.store
      .rentHistoryForProperty(property.id, endMonth || currentMonth())
      .filter((point) => (!startMonth || point.month >= startMonth) && (!endMonth || point.month <= endMonth));

    return history.reduce(
      (summary, point) => ({
        expectedAmount: summary.expectedAmount + point.expectedAmount,
        collectedAmount: summary.collectedAmount + point.paidAmount,
        deductedFromDeposit: summary.deductedFromDeposit + point.deductionAmount,
        remainingAmount: summary.remainingAmount + point.remainingAmount,
        monthCount: summary.monthCount + 1,
        unpaidMonthCount: summary.unpaidMonthCount + (point.remainingAmount > 0 ? 1 : 0),
      }),
      {
        expectedAmount: 0,
        collectedAmount: 0,
        deductedFromDeposit: 0,
        remainingAmount: 0,
        monthCount: 0,
        unpaidMonthCount: 0,
      },
    );
  }

  private matchesSearch(property: PropertyUnit, query: string): boolean {
    if (!query) {
      return true;
    }

    return this.normalize(
      [
        property.reference,
        property.category,
        property.address,
        property.district,
        this.store.getManagerName(property.managerId),
        this.store.getOwnerName(property.ownerId),
      ].join(' '),
    ).includes(query);
  }

  private matchesRecoveryFilter(recovery: PropertyRecoverySummary): boolean {
    switch (this.recoveryFilter()) {
      case 'COLLECTED':
        return recovery.expectedAmount > 0 && recovery.remainingAmount === 0;
      case 'REMAINING':
        return recovery.remainingAmount > 0;
      default:
        return true;
    }
  }

  private normalizedPeriodDates(): { startDate: string; endDate: string } {
    const startDate = this.startDate();
    const endDate = this.endDate();

    if (startDate && endDate && startDate > endDate) {
      return { startDate: endDate, endDate: startDate };
    }

    return { startDate, endDate };
  }

  private normalizedPeriodMonths(): { startMonth: string; endMonth: string } {
    const { startDate, endDate } = this.normalizedPeriodDates();
    return {
      startMonth: startDate ? startDate.slice(0, 7) : '',
      endMonth: endDate ? endDate.slice(0, 7) : '',
    };
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
  }
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
