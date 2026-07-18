import { Component, EventEmitter, inject, Output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ImmoStore } from '../../immo-store';
import { PropertyUnit } from '../../models';

@Component({
  selector: 'app-property-form',
  imports: [ReactiveFormsModule],
  templateUrl: './property-form.component.html',
  styleUrl: './property-form.component.scss',
})
export class PropertyFormComponent {
  readonly store = inject(ImmoStore);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly selectedPropertyId = signal<string | null>(null);
  readonly isPropertyModalOpen = signal(false);

  @Output() readonly notice = new EventEmitter<string>();

  readonly propertyForm = this.fb.group({
    reference: ['', Validators.required],
    address: ['', Validators.required],
    district: ['', Validators.required],
    category: ['Chambre', Validators.required],
    bedroomCount: [1, [Validators.required, Validators.min(0)]],
    hasLivingRoom: [false],
    hasInternalWc: [true],
    hasPrivateShower: [true],
    hasKitchen: [false],
    hasBalcony: [false],
    rent: [50000, [Validators.required, Validators.min(1)]],
    deposit: [100000, [Validators.required, Validators.min(0)]],
    charges: [0, [Validators.required, Validators.min(0)]],
    managerId: [''],
    ownerId: [''],
    notes: [''],
  });

  openCreateProperty(): void {
    this.selectedPropertyId.set(null);
    this.resetForm();
    this.isPropertyModalOpen.set(true);
  }

  openEditProperty(property: PropertyUnit): void {
    this.selectedPropertyId.set(property.id);
    this.propertyForm.reset({
      reference: property.reference,
      address: property.address,
      district: property.district,
      category: property.category,
      bedroomCount: property.bedroomCount,
      hasLivingRoom: property.hasLivingRoom,
      hasInternalWc: property.hasInternalWc,
      hasPrivateShower: property.hasPrivateShower,
      hasKitchen: property.hasKitchen,
      hasBalcony: property.hasBalcony,
      rent: property.rent,
      deposit: property.deposit,
      charges: property.charges,
      managerId: property.managerId ?? '',
      ownerId: property.ownerId ?? '',
      notes: property.notes ?? '',
    });
    this.isPropertyModalOpen.set(true);
  }

  closePropertyModal(): void {
    this.isPropertyModalOpen.set(false);
  }

  saveProperty(): void {
    if (this.propertyForm.invalid) {
      this.propertyForm.markAllAsTouched();
      return;
    }

    const input = this.propertyForm.getRawValue();
    const selectedPropertyId = this.selectedPropertyId();

    if (selectedPropertyId) {
      const property = this.store.updateProperty(selectedPropertyId, input);
      this.notice.emit(`Bien ${property.reference} mis à jour.`);
      this.closePropertyModal();
      return;
    }

    const property = this.store.addProperty(input);
    this.selectedPropertyId.set(property.id);
    this.notice.emit(`Bien ${property.reference} créé.`);
    this.closePropertyModal();
  }

  deleteProperty(property: PropertyUnit): void {
    if (!globalThis.confirm(`Supprimer le bien ${property.reference} ?`)) {
      return;
    }

    try {
      this.store.deleteProperty(property.id);

      if (this.selectedPropertyId() === property.id) {
        this.selectedPropertyId.set(null);
        this.resetForm();
        this.closePropertyModal();
      }

      this.notice.emit(`Bien ${property.reference} supprimé.`);
    } catch (error) {
      this.notice.emit(
        error instanceof Error ? error.message : 'Impossible de supprimer ce bien.',
      );
    }
  }

  canDeleteProperty(property: PropertyUnit): boolean {
    return this.store.canDeleteProperty(property.id);
  }

  propertyStatusLabel(property: PropertyUnit): string {
    return property.tenantId ? 'Loué' : 'Libre';
  }

  deleteStatusLabel(property: PropertyUnit): string {
    if (this.canDeleteProperty(property)) {
      return 'Supprimable';
    }

    return property.tenantId ? 'Occupé' : 'Historique';
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

  private resetForm(): void {
    this.propertyForm.reset({
      reference: '',
      address: '',
      district: '',
      category: 'Chambre',
      bedroomCount: 1,
      hasLivingRoom: false,
      hasInternalWc: true,
      hasPrivateShower: true,
      hasKitchen: false,
      hasBalcony: false,
      rent: 50000,
      deposit: 100000,
      charges: 0,
      managerId: '',
      ownerId: '',
      notes: '',
    });
  }
}
