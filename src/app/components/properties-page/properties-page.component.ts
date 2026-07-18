import { Component, computed, EventEmitter, inject, Input, Output, signal } from '@angular/core';
import { ImmoStore } from '../../immo-store';
import { PropertyUnit, RentPaymentStatus } from '../../models';
import { PropertyDetailComponent } from '../property-detail/property-detail.component';

type PropertyFilter = 'ALL' | 'OCCUPIED' | 'AVAILABLE';

@Component({
  selector: 'app-properties-page',
  imports: [PropertyDetailComponent],
  templateUrl: './properties-page.component.html',
  styleUrl: './properties-page.component.scss',
})
export class PropertiesPageComponent {
  readonly store = inject(ImmoStore);
  readonly filter = signal<PropertyFilter>('ALL');
  readonly selectedPropertyId = signal<string | null>(null);

  @Input({ required: true }) selectedMonth = '';
  @Output() readonly notice = new EventEmitter<string>();

  readonly visibleProperties = computed(() => {
    const properties = this.store.visibleProperties();

    switch (this.filter()) {
      case 'OCCUPIED':
        return properties.filter((property) => this.isOccupied(property));
      case 'AVAILABLE':
        return properties.filter((property) => !this.isOccupied(property));
      default:
        return properties;
    }
  });

  readonly selectedProperty = computed(() => {
    const selectedPropertyId = this.selectedPropertyId();
    const properties = this.store.visibleProperties();
    return selectedPropertyId
      ? properties.find((property) => property.id === selectedPropertyId) ?? null
      : properties[0] ?? null;
  });

  setFilter(filter: PropertyFilter): void {
    this.filter.set(filter);
  }

  selectProperty(propertyId: string): void {
    this.selectedPropertyId.set(propertyId);
  }

  handleNotice(message: string): void {
    this.notice.emit(message);
  }

  isOccupied(property: PropertyUnit): boolean {
    return Boolean(property.tenantId);
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
}
