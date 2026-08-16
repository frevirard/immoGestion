import { Component, EventEmitter, inject, Output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ImmoStore } from '../../immo-store';
import { PropertyUnit } from '../../models';
import { LucideIconComponent } from '../lucide-icon.component';

@Component({
  selector: 'app-property-form',
  imports: [ReactiveFormsModule, LucideIconComponent],
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
    tenantId: [''],
    notes: [''],
  });

  async openCreateProperty(): Promise<void> {
    await this.store.refresh();
    await this.store.refreshTenants();
    this.selectedPropertyId.set(null);
    this.resetForm();
    this.isPropertyModalOpen.set(true);
  }

  async openEditProperty(property: PropertyUnit): Promise<void> {
    await this.store.refresh();
    await this.store.refreshTenants();
    const freshProperty = this.store.properties().find((candidate) => candidate.id === property.id) ?? property;

    this.selectedPropertyId.set(freshProperty.id);
    this.propertyForm.reset({
      reference: freshProperty.reference,
      address: freshProperty.address,
      district: freshProperty.district,
      category: freshProperty.category,
      bedroomCount: freshProperty.bedroomCount,
      hasLivingRoom: freshProperty.hasLivingRoom,
      hasInternalWc: freshProperty.hasInternalWc,
      hasPrivateShower: freshProperty.hasPrivateShower,
      hasKitchen: freshProperty.hasKitchen,
      hasBalcony: freshProperty.hasBalcony,
      rent: freshProperty.rent,
      deposit: freshProperty.deposit,
      charges: freshProperty.charges,
      managerId: freshProperty.managerId ?? '',
      ownerId: freshProperty.ownerId ?? '',
      tenantId: freshProperty.tenantId ?? '',
      notes: freshProperty.notes ?? '',
    });
    this.isPropertyModalOpen.set(true);
  }

  closePropertyModal(): void {
    this.isPropertyModalOpen.set(false);
  }

  async saveProperty(): Promise<void> {
    if (this.propertyForm.invalid) {
      this.propertyForm.markAllAsTouched();
      return;
    }

    const { tenantId, ...input } = this.propertyForm.getRawValue();
    const selectedPropertyId = this.selectedPropertyId();

    try {
      if (selectedPropertyId) {
        const previousProperty = this.store.properties().find((property) => property.id === selectedPropertyId);
        const property = await this.store.updateProperty(selectedPropertyId, input);
        await this.syncTenantAssignment(property.id, tenantId, previousProperty?.tenantId);
        this.notice.emit(`Bien ${property.reference} mis à jour.`);
        this.closePropertyModal();
        return;
      }

      const property = await this.store.addProperty(input);
      await this.syncTenantAssignment(property.id, tenantId, undefined);
      this.selectedPropertyId.set(property.id);
      this.notice.emit(`Bien ${property.reference} créé.`);
      this.closePropertyModal();
    } catch {
      this.notice.emit('Impossible d’enregistrer ce bien.');
    }
  }

  async deleteProperty(property: PropertyUnit): Promise<void> {
    if (!globalThis.confirm(`Supprimer le bien ${property.reference} ?`)) {
      return;
    }

    try {
      await this.store.deleteProperty(property.id);

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

  canSelectTenant(tenantId: string): boolean {
    const selectedPropertyId = this.selectedPropertyId() ?? undefined;
    return !this.store.isTenantAttachedToAnotherProperty(tenantId, selectedPropertyId);
  }

  tenantOptionLabel(tenantId: string): string {
    return this.canSelectTenant(tenantId) ? '' : ' — déjà rattaché';
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
      tenantId: '',
      notes: '',
    });
  }

  private async syncTenantAssignment(
    propertyId: string,
    tenantId: string,
    previousTenantId?: string,
  ): Promise<void> {
    if ((tenantId || '') === (previousTenantId || '')) {
      return;
    }

    if (tenantId) {
      await this.store.assignTenantToProperty(propertyId, tenantId, Boolean(previousTenantId));
      return;
    }

    if (previousTenantId) {
      await this.store.unassignTenantFromProperty(propertyId);
    }
  }
}
