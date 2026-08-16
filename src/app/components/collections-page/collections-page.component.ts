import { Component, computed, EventEmitter, inject, Output, signal } from '@angular/core';
import { ImmoStore } from '../../immo-store';
import { PropertyUnit, RentHistoryPoint } from '../../models';
import { LucideIconComponent } from '../lucide-icon.component';
import {
  RentCollectionModalComponent,
  RentCollectionModalResult,
  RentCollectionMode,
} from '../rent-collection-modal/rent-collection-modal.component';

type CollectionFilter = 'all' | 'due' | 'partial' | 'collected';

interface CollectionRow {
  property: PropertyUnit;
  point: RentHistoryPoint;
}

@Component({
  selector: 'app-collections-page',
  imports: [LucideIconComponent, RentCollectionModalComponent],
  templateUrl: './collections-page.component.html',
  styleUrl: './collections-page.component.scss',
})
export class CollectionsPageComponent {
  readonly store = inject(ImmoStore);
  readonly search = signal('');
  readonly filter = signal<CollectionFilter>('due');
  readonly page = signal(1);
  readonly pageSize = 10;
  readonly dialogRow = signal<CollectionRow | null>(null);
  readonly dialogMode = signal<RentCollectionMode>('collect');
  readonly submitting = signal(false);

  @Output() readonly notice = new EventEmitter<string>();

  readonly allRows = computed<CollectionRow[]>(() => {
    const isAdmin = this.isAdmin();

    return this.store
      .visibleProperties()
      .flatMap((property) =>
        this.store.rentHistoryForProperty(property.id).flatMap((point) => {
          const isCurrentTenant = property.tenantId === point.tenantId;
          const isOutstanding = isCurrentTenant && point.remainingAmount > 0;
          const isRecentCollection =
            point.paidAmount > 0 && (isAdmin || this.isWithinCollectionWindow(point));

          return isOutstanding || isRecentCollection ? [{ property, point }] : [];
        }),
      )
      .sort((first, second) => {
        const firstDue = first.point.remainingAmount > 0 ? 0 : 1;
        const secondDue = second.point.remainingAmount > 0 ? 0 : 1;

        if (firstDue !== secondDue) {
          return firstDue - secondDue;
        }

        return firstDue === 0
          ? first.point.month.localeCompare(second.point.month)
          : second.point.month.localeCompare(first.point.month);
      });
  });

  readonly filteredRows = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('fr');
    const filter = this.filter();

    return this.allRows().filter(({ property, point }) => {
      const matchesQuery =
        !query ||
        [
          property.reference,
          property.address,
          property.district,
          point.tenantName,
          this.store.getManagerName(property.managerId),
          this.formatMonth(point.month),
        ]
          .join(' ')
          .toLocaleLowerCase('fr')
          .includes(query);

      const matchesFilter =
        filter === 'all' ||
        (filter === 'due' && point.remainingAmount > 0) ||
        (filter === 'partial' && point.paidAmount > 0 && point.remainingAmount > 0) ||
        (filter === 'collected' && point.paidAmount > 0 && point.remainingAmount === 0);

      return matchesQuery && matchesFilter;
    });
  });

  readonly pageCount = computed(() => Math.max(1, Math.ceil(this.filteredRows().length / this.pageSize)));
  readonly pageRows = computed(() => {
    const safePage = Math.min(this.page(), this.pageCount());
    const start = (safePage - 1) * this.pageSize;
    return this.filteredRows().slice(start, start + this.pageSize);
  });

  readonly totals = computed(() =>
    this.allRows().reduce(
      (summary, row) => ({
        dueCount: summary.dueCount + (row.point.remainingAmount > 0 ? 1 : 0),
        dueAmount: summary.dueAmount + row.point.remainingAmount,
        recentCollected:
          summary.recentCollected +
          (this.isAdmin() || this.isWithinCollectionWindow(row.point) ? row.point.paidAmount : 0),
      }),
      { dueCount: 0, dueAmount: 0, recentCollected: 0 },
    ),
  );

  updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    this.page.set(1);
  }

  setFilter(filter: CollectionFilter): void {
    this.filter.set(filter);
    this.page.set(1);
  }

  setPage(page: number): void {
    this.page.set(Math.min(Math.max(page, 1), this.pageCount()));
  }

  openDialog(row: CollectionRow, mode: RentCollectionMode): void {
    if (mode === 'collect' && !this.canCollect(row)) {
      this.notice.emit('Cette mensualité ne peut plus être encaissée.');
      return;
    }

    if (mode === 'edit' && !this.canEdit(row)) {
      this.notice.emit('Le délai de modification de cet encaissement est dépassé.');
      return;
    }

    this.dialogMode.set(mode);
    this.dialogRow.set(row);
  }

  closeDialog(): void {
    if (!this.submitting()) {
      this.dialogRow.set(null);
    }
  }

  async confirmCollection(result: RentCollectionModalResult): Promise<void> {
    const row = this.dialogRow();
    const mode = this.dialogMode();

    if (!row) {
      return;
    }

    this.submitting.set(true);
    try {
      if (mode === 'collect') {
        await this.store.markRentPaid(
          row.property.id,
          row.point.month,
          result.amount,
          result.paidAt,
          result.comment || 'Encaissement depuis le registre de collecte.',
        );
      } else {
        await this.store.updateRentPaid(
          row.property.id,
          row.point.month,
          result.amount,
          result.paidAt,
          result.comment,
        );
      }

      this.dialogRow.set(null);
      this.notice.emit(
        mode === 'collect'
          ? `${this.formatMoney(result.amount)} encaissés pour ${row.property.reference}.`
          : `Encaissement de ${row.property.reference} corrigé.`,
      );
    } catch (error) {
      this.notice.emit(this.apiErrorMessage(error, 'Impossible d’enregistrer cet encaissement.'));
    } finally {
      this.submitting.set(false);
    }
  }

  canCollect(row: CollectionRow): boolean {
    return row.property.tenantId === row.point.tenantId && row.point.remainingAmount > 0;
  }

  canEdit(row: CollectionRow): boolean {
    return row.point.paidAmount > 0 && (this.isAdmin() || this.isWithinCollectionWindow(row.point));
  }

  statusLabel(point: RentHistoryPoint): string {
    if (point.remainingAmount > 0 && point.paidAmount > 0) {
      return 'Partiellement encaissé';
    }

    if (point.remainingAmount > 0) {
      return 'À encaisser';
    }

    return point.deductionAmount > 0 ? 'Soldé (mixte)' : 'Encaissé';
  }

  statusClass(point: RentHistoryPoint): string {
    if (point.remainingAmount === 0) {
      return 'paid';
    }

    return point.paidAmount > 0 ? 'partial' : 'due';
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

  formatMonth(month: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(`${month}-01T00:00:00`));
  }

  formatDate(date?: string): string {
    if (!date) {
      return '—';
    }

    return new Intl.DateTimeFormat('fr-FR').format(new Date(`${date.slice(0, 10)}T00:00:00`));
  }

  isAdmin(): boolean {
    return this.store.currentUser()?.role === 'ADMIN';
  }

  private isWithinCollectionWindow(point: RentHistoryPoint): boolean {
    const referenceDate = point.paidAt || point.updatedAt;

    if (!referenceDate) {
      return false;
    }

    const limit = new Date(`${referenceDate.slice(0, 10)}T23:59:59`);
    limit.setDate(limit.getDate() + 15);
    return new Date() <= limit;
  }

  private apiErrorMessage(error: unknown, fallback: string): string {
    if (typeof error !== 'object' || error === null || !('error' in error)) {
      return error instanceof Error ? error.message : fallback;
    }

    const response = (error as { error?: string | { detail?: string; message?: string } }).error;

    if (typeof response === 'string') {
      return response.trim() || fallback;
    }

    return response?.detail || response?.message || fallback;
  }
}
