import { Component, computed, inject, signal } from '@angular/core';
import { ImmoStore } from '../../immo-store';
import { ExpenseCategory, PropertyExpense, PropertyUnit, RentHistoryPoint } from '../../models';
import { LucideIconComponent } from '../lucide-icon.component';

type DashboardTab = 'table' | 'charts' | 'expenses';

interface DashboardStats {
  total: number;
  occupied: number;
  available: number;
  monthlyExpectedAmount: number;
  historicalExpectedAmount: number;
  collectedAmount: number;
  deductedFromDeposit: number;
  remainingAmount: number;
  expenseAmount: number;
  netCollectedAmount: number;
}

interface DashboardRentEntry {
  property: PropertyUnit;
  point: RentHistoryPoint;
}

interface DashboardAgentSummary {
  managerId: string;
  managerName: string;
  assignedCount: number;
  occupiedCount: number;
  availableCount: number;
  expectedAmount: number;
  collectedAmount: number;
  deductedFromDeposit: number;
  remainingAmount: number;
  unpaidRentCount: number;
}

interface DashboardManagerRentDetail {
  key: string;
  propertyReference: string;
  propertyCategory: string;
  tenantName: string;
  month: string;
  expectedAmount: number;
  collectedAmount: number;
  deductedFromDeposit: number;
  remainingAmount: number;
  status: string;
  paidAt?: string;
  comment?: string;
}

interface DashboardManagerDetail {
  summary: DashboardAgentSummary;
  entries: DashboardManagerRentDetail[];
  unpaidEntries: DashboardManagerRentDetail[];
  collectedEntries: DashboardManagerRentDetail[];
}

interface BreakdownItem {
  key: 'collected' | 'deducted' | 'remaining';
  label: string;
  amount: number;
  percent: number;
}

interface MonthlyTrendPoint {
  month: string;
  expectedAmount: number;
  collectedAmount: number;
  deductedFromDeposit: number;
  remainingAmount: number;
}

interface ExpenseChartItem {
  key: string;
  label: string;
  amount: number;
  count: number;
}

interface FinancialRatioItem {
  key: 'collected' | 'remaining' | 'expenses';
  label: string;
  amount: number;
  percent: number;
}

const DASHBOARD_PAGE_SIZE = 5;

@Component({
  selector: 'app-dashboard',
  imports: [LucideIconComponent],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  readonly store = inject(ImmoStore);

  readonly activeTab = signal<DashboardTab>('table');
  readonly startDate = signal(startOfYearDate());
  readonly endDate = signal(todayDate());
  readonly tablePage = signal(1);
  readonly selectedManagerId = signal<string | null>(null);
  readonly isPeriodFilterOpen = signal(false);

  readonly globalStats = computed<DashboardStats>(() => {
    const properties = this.store.visibleProperties();
    const occupied = properties.filter((property) => Boolean(property.tenantId));
    const history = properties.flatMap((property) =>
      this.store.rentHistoryForProperty(property.id, currentMonth()),
    );
    const expenseAmount = this.store.visibleExpenses().reduce(
      (total, expense) => total + expense.amount,
      0,
    );
    const collectedAmount = history.reduce((total, point) => total + point.paidAmount, 0);

    return {
      total: properties.length,
      occupied: occupied.length,
      available: properties.length - occupied.length,
      monthlyExpectedAmount: occupied.reduce((total, property) => total + property.rent, 0),
      historicalExpectedAmount: history.reduce((total, point) => total + point.expectedAmount, 0),
      collectedAmount,
      deductedFromDeposit: history.reduce((total, point) => total + point.deductionAmount, 0),
      remainingAmount: history.reduce((total, point) => total + point.remainingAmount, 0),
      expenseAmount,
      netCollectedAmount: collectedAmount - expenseAmount,
    };
  });

  readonly filteredExpenses = computed(() => {
    const { startDate, endDate } = this.normalizedPeriodDates();
    return this.store
      .visibleExpenses()
      .filter((expense) => expense.expenseDate >= startDate && expense.expenseDate <= endDate);
  });

  readonly expenseStats = computed(() => {
    const expenses = this.filteredExpenses();
    const amount = expenses.reduce((total, expense) => total + expense.amount, 0);
    return {
      count: expenses.length,
      amount,
      average: expenses.length ? amount / expenses.length : 0,
      properties: new Set(expenses.map((expense) => expense.propertyId)).size,
    };
  });

  readonly expensesByCategory = computed(() =>
    this.groupExpenses(
      (expense) => expense.category,
      (category) => this.expenseCategoryLabel(category as ExpenseCategory),
    ),
  );

  readonly expensesByProperty = computed(() =>
    this.groupExpenses(
      (expense) => expense.propertyId,
      (propertyId) =>
        this.store.visibleProperties().find((property) => property.id === propertyId)?.reference ??
        'Bien inconnu',
    ),
  );

  readonly expensesByManager = computed(() =>
    this.groupExpenses(
      (expense) => expense.managerId || 'unassigned',
      (managerId) => (managerId === 'unassigned' ? 'Non attribué' : this.store.getManagerName(managerId)),
    ),
  );

  readonly maxExpenseAmount = computed(() =>
    Math.max(
      ...this.expensesByCategory().map((item) => item.amount),
      ...this.expensesByProperty().map((item) => item.amount),
      ...this.expensesByManager().map((item) => item.amount),
      1,
    ),
  );

  readonly filteredRentEntries = computed<DashboardRentEntry[]>(() => {
    const { startMonth, endMonth } = this.normalizedPeriodMonths();

    return this.store.visibleProperties().flatMap((property) =>
      this.store
        .rentHistoryForProperty(property.id, endMonth)
        .filter((point) => point.month >= startMonth && point.month <= endMonth)
        .map((point) => ({ property, point })),
    );
  });

  readonly rentSummaries = computed<DashboardAgentSummary[]>(() => {
    const user = this.store.currentUser();
    const managers =
      user?.role === 'MANAGER'
        ? this.store.managers().filter((manager) => manager.id === user.id)
        : this.store.managers();
    const properties = this.store.visibleProperties();
    const entries = this.filteredRentEntries();

    return managers
      .map((manager) => {
        const assigned = properties.filter((property) => property.managerId === manager.id);
        const occupied = assigned.filter((property) => Boolean(property.tenantId));
        const managerEntries = entries.filter((entry) => entry.property.managerId === manager.id);
        const expectedAmount = managerEntries.reduce(
          (total, entry) => total + entry.point.expectedAmount,
          0,
        );
        const collectedAmount = managerEntries.reduce(
          (total, entry) => total + entry.point.paidAmount,
          0,
        );
        const deductedFromDeposit = managerEntries.reduce(
          (total, entry) => total + entry.point.deductionAmount,
          0,
        );
        const remainingAmount = managerEntries.reduce(
          (total, entry) => total + entry.point.remainingAmount,
          0,
        );
        const unpaidRentCount = managerEntries.filter((entry) => entry.point.remainingAmount > 0).length;

        return {
          managerId: manager.id,
          managerName: manager.name,
          assignedCount: assigned.length,
          occupiedCount: occupied.length,
          availableCount: assigned.length - occupied.length,
          expectedAmount,
          collectedAmount,
          deductedFromDeposit,
          remainingAmount,
          unpaidRentCount,
        };
      })
      .sort((first, second) => {
        const amountDelta = second.remainingAmount - first.remainingAmount;
        return amountDelta || first.managerName.localeCompare(second.managerName);
      });
  });

  readonly totalTablePages = computed(() =>
    Math.max(1, Math.ceil(this.rentSummaries().length / DASHBOARD_PAGE_SIZE)),
  );

  readonly currentTablePage = computed(() =>
    Math.min(Math.max(1, this.tablePage()), this.totalTablePages()),
  );

  readonly paginatedRentSummaries = computed(() => {
    const start = (this.currentTablePage() - 1) * DASHBOARD_PAGE_SIZE;
    return this.rentSummaries().slice(start, start + DASHBOARD_PAGE_SIZE);
  });

  readonly visibleTablePages = computed(() => {
    const total = this.totalTablePages();
    const current = this.currentTablePage();
    const end = Math.min(total, Math.max(5, current + 2));
    const start = Math.max(1, Math.min(current - 2, end - 4));

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });

  readonly periodStats = computed(() => {
    const summaries = this.rentSummaries();
    return {
      expectedAmount: summaries.reduce((total, summary) => total + summary.expectedAmount, 0),
      collectedAmount: summaries.reduce((total, summary) => total + summary.collectedAmount, 0),
      deductedFromDeposit: summaries.reduce(
        (total, summary) => total + summary.deductedFromDeposit,
        0,
      ),
      remainingAmount: summaries.reduce((total, summary) => total + summary.remainingAmount, 0),
    };
  });

  readonly financialRatio = computed<FinancialRatioItem[]>(() => {
    const stats = this.periodStats();
    const values = [
      {
        key: 'collected' as const,
        label: 'Loyers perçus',
        amount: Math.max(stats.collectedAmount, 0),
      },
      {
        key: 'remaining' as const,
        label: 'Reste à encaisser',
        amount: Math.max(stats.remainingAmount, 0),
      },
      {
        key: 'expenses' as const,
        label: 'Dépenses',
        amount: Math.max(this.expenseStats().amount, 0),
      },
    ];
    const total = values.reduce((sum, item) => sum + item.amount, 0);

    return values.map((item) => ({
      ...item,
      percent: total > 0 ? Math.round((item.amount / total) * 100) : 0,
    }));
  });

  readonly financialDonutGradient = computed(() => {
    const items = this.financialRatio();
    const total = items.reduce((sum, item) => sum + item.amount, 0);

    if (total <= 0) {
      return 'conic-gradient(var(--gray-200) 0 100%)';
    }

    const collectedEnd = (items[0].amount / total) * 100;
    const remainingEnd = collectedEnd + (items[1].amount / total) * 100;

    return `conic-gradient(
      var(--emerald-500) 0 ${collectedEnd}%,
      var(--rose-500) ${collectedEnd}% ${remainingEnd}%,
      var(--amber-500) ${remainingEnd}% 100%
    )`;
  });

  readonly selectedManagerDetail = computed<DashboardManagerDetail | null>(() => {
    const managerId = this.selectedManagerId();

    if (!managerId) {
      return null;
    }

    const summary = this.rentSummaries().find((candidate) => candidate.managerId === managerId);

    if (!summary) {
      return null;
    }

    const entries = this.filteredRentEntries()
      .filter((entry) => entry.property.managerId === managerId)
      .map<DashboardManagerRentDetail>((entry) => ({
        key: `${entry.property.id}-${entry.point.occupancyId}-${entry.point.month}`,
        propertyReference: entry.property.reference,
        propertyCategory: entry.property.category,
        tenantName: entry.point.tenantName,
        month: entry.point.month,
        expectedAmount: entry.point.expectedAmount,
        collectedAmount: entry.point.paidAmount,
        deductedFromDeposit: entry.point.deductionAmount,
        remainingAmount: entry.point.remainingAmount,
        status: entry.point.status,
        paidAt: entry.point.paidAt,
        comment: entry.point.comment,
      }))
      .sort((first, second) => {
        const monthDelta = second.month.localeCompare(first.month);
        return monthDelta || first.propertyReference.localeCompare(second.propertyReference);
      });

    return {
      summary,
      entries,
      unpaidEntries: entries.filter((entry) => entry.remainingAmount > 0),
      collectedEntries: entries.filter(
        (entry) => entry.collectedAmount > 0 || entry.deductedFromDeposit > 0,
      ),
    };
  });

  readonly statusBreakdown = computed<BreakdownItem[]>(() => {
    const stats = this.periodStats();
    const total = Math.max(stats.expectedAmount, 0);

    return [
      {
        key: 'collected',
        label: 'Encaissé',
        amount: stats.collectedAmount,
        percent: this.barPercent(stats.collectedAmount, total),
      },
      {
        key: 'deducted',
        label: 'Déduit caution',
        amount: stats.deductedFromDeposit,
        percent: this.barPercent(stats.deductedFromDeposit, total),
      },
      {
        key: 'remaining',
        label: 'Reste',
        amount: stats.remainingAmount,
        percent: this.barPercent(stats.remainingAmount, total),
      },
    ];
  });

  readonly chartAgentSummaries = computed(() =>
    this.rentSummaries()
      .filter(
        (summary) =>
          summary.expectedAmount ||
          summary.collectedAmount ||
          summary.deductedFromDeposit ||
          summary.remainingAmount,
      )
      .slice(0, 8),
  );

  readonly maxAgentRemaining = computed(() =>
    Math.max(...this.chartAgentSummaries().map((summary) => summary.remainingAmount), 1),
  );

  readonly monthlyTrend = computed<MonthlyTrendPoint[]>(() => {
    const grouped = new Map<string, MonthlyTrendPoint>();

    for (const entry of this.filteredRentEntries()) {
      const existing =
        grouped.get(entry.point.month) ??
        {
          month: entry.point.month,
          expectedAmount: 0,
          collectedAmount: 0,
          deductedFromDeposit: 0,
          remainingAmount: 0,
        };

      existing.expectedAmount += entry.point.expectedAmount;
      existing.collectedAmount += entry.point.paidAmount;
      existing.deductedFromDeposit += entry.point.deductionAmount;
      existing.remainingAmount += entry.point.remainingAmount;
      grouped.set(entry.point.month, existing);
    }

    return [...grouped.values()].sort((first, second) => first.month.localeCompare(second.month)).slice(-12);
  });

  readonly maxTrendAmount = computed(() =>
    Math.max(...this.monthlyTrend().map((point) => point.expectedAmount), 1),
  );

  setActiveTab(tab: DashboardTab): void {
    this.activeTab.set(tab);
  }

  togglePeriodFilter(): void {
    this.isPeriodFilterOpen.update((isOpen) => !isOpen);
  }

  setStartDate(event: Event): void {
    this.startDate.set((event.target as HTMLInputElement).value);
    this.resetTablePage();
  }

  setEndDate(event: Event): void {
    this.endDate.set((event.target as HTMLInputElement).value);
    this.resetTablePage();
  }

  resetPeriod(): void {
    this.startDate.set(startOfYearDate());
    this.endDate.set(todayDate());
    this.resetTablePage();
    this.isPeriodFilterOpen.set(false);
  }

  previousPage(): void {
    this.tablePage.update((page) => Math.max(1, page - 1));
  }

  nextPage(): void {
    this.tablePage.update((page) => Math.min(this.totalTablePages(), page + 1));
  }

  goToPage(page: number): void {
    this.tablePage.set(Math.min(Math.max(1, page), this.totalTablePages()));
  }

  resetTablePage(): void {
    this.tablePage.set(1);
  }

  selectManager(managerId: string): void {
    this.selectedManagerId.set(this.selectedManagerId() === managerId ? null : managerId);
  }

  clearSelectedManager(): void {
    this.selectedManagerId.set(null);
  }

  isManagerSelected(managerId: string): boolean {
    return this.selectedManagerId() === managerId;
  }

  barPercent(amount: number, max: number): number {
    return max > 0 ? Math.min(100, Math.round((amount / max) * 100)) : 0;
  }

  periodLabel(): string {
    const { startDate, endDate } = this.normalizedPeriodDates();
    return `Du ${this.formatDate(startDate)} au ${this.formatDate(endDate)}`;
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
    if (!date) {
      return 'date non définie';
    }

    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${date}T00:00:00`));
  }

  formatMonth(month: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${month}-01T00:00:00`));
  }

  formatShortMonth(month: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      month: 'short',
      year: '2-digit',
    }).format(new Date(`${month}-01T00:00:00`));
  }

  rentStatusLabel(entry: Pick<DashboardManagerRentDetail, 'remainingAmount' | 'deductedFromDeposit' | 'collectedAmount' | 'status'>): string {
    if (entry.remainingAmount > 0) {
      return 'À encaisser';
    }

    if (entry.deductedFromDeposit > 0 && entry.collectedAmount === 0) {
      return 'Déduit caution';
    }

    if (entry.deductedFromDeposit > 0) {
      return 'Mixte';
    }

    return entry.status === 'PAID' ? 'Encaissé' : 'Soldé';
  }

  expenseCategoryLabel(category: ExpenseCategory): string {
    const labels: Record<ExpenseCategory, string> = {
      RENOVATION: 'Rénovation',
      MAINTENANCE: 'Entretien',
      REPAIR: 'Réparation',
      UTILITIES: 'Eau, électricité et charges',
      TAX: 'Taxes et frais',
      INSURANCE: 'Assurance',
      CLEANING: 'Nettoyage',
      SECURITY: 'Sécurité',
      EQUIPMENT: 'Équipement',
      OTHER: 'Autres',
    };
    return labels[category];
  }

  private groupExpenses(
    keySelector: (expense: PropertyExpense) => string,
    labelSelector: (key: string) => string,
  ): ExpenseChartItem[] {
    const groups = new Map<string, ExpenseChartItem>();

    for (const expense of this.filteredExpenses()) {
      const key = keySelector(expense);
      const group = groups.get(key) ?? { key, label: labelSelector(key), amount: 0, count: 0 };
      group.amount += expense.amount;
      group.count += 1;
      groups.set(key, group);
    }

    return [...groups.values()]
      .sort((first, second) => second.amount - first.amount || first.label.localeCompare(second.label))
      .slice(0, 8);
  }

  private normalizedPeriodDates(): { startDate: string; endDate: string } {
    const startDate = this.startDate() || startOfYearDate();
    const endDate = this.endDate() || todayDate();

    return startDate <= endDate
      ? { startDate, endDate }
      : { startDate: endDate, endDate: startDate };
  }

  private normalizedPeriodMonths(): { startMonth: string; endMonth: string } {
    const { startDate, endDate } = this.normalizedPeriodDates();
    return {
      startMonth: startDate.slice(0, 7),
      endMonth: endDate.slice(0, 7),
    };
  }
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfYearDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-01-01`;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
