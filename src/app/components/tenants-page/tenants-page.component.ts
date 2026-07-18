import { Component, EventEmitter, inject, Output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ImmoStore } from '../../immo-store';
import { Tenant } from '../../models';

@Component({
  selector: 'app-tenants-page',
  imports: [ReactiveFormsModule],
  templateUrl: './tenants-page.component.html',
  styleUrl: './tenants-page.component.scss',
})
export class TenantsPageComponent {
  readonly store = inject(ImmoStore);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly selectedTenantId = signal<string | null>(null);
  readonly isTenantModalOpen = signal(false);
  readonly today = new Date().toISOString().slice(0, 10);

  @Output() readonly notice = new EventEmitter<string>();

  readonly tenantForm = this.fb.group({
    fullName: ['', Validators.required],
    phone: ['', Validators.required],
    email: [''],
    profession: [''],
    idDocument: [''],
    emergencyContact: [''],
    startDate: [this.today, Validators.required],
    depositExpected: [0, [Validators.required, Validators.min(0)]],
    depositPaidAmount: [0, [Validators.required, Validators.min(0)]],
    depositPaidAt: [this.today],
  });

  openCreateTenant(): void {
    this.selectedTenantId.set(null);
    this.resetForm();
    this.isTenantModalOpen.set(true);
  }

  openEditTenant(tenant: Tenant): void {
    this.selectedTenantId.set(tenant.id);
    this.tenantForm.reset({
      fullName: tenant.fullName,
      phone: tenant.phone,
      email: tenant.email ?? '',
      profession: tenant.profession ?? '',
      idDocument: tenant.idDocument ?? '',
      emergencyContact: tenant.emergencyContact ?? '',
      startDate: tenant.startDate,
      depositExpected: tenant.depositExpected,
      depositPaidAmount: tenant.depositPaidAmount,
      depositPaidAt: tenant.depositPaidAt ?? this.today,
    });
    this.isTenantModalOpen.set(true);
  }

  closeTenantModal(): void {
    this.isTenantModalOpen.set(false);
  }

  saveTenant(): void {
    if (this.tenantForm.invalid) {
      this.tenantForm.markAllAsTouched();
      return;
    }

    const input = this.tenantForm.getRawValue();
    const selectedTenantId = this.selectedTenantId();

    if (selectedTenantId) {
      const tenant = this.store.updateTenant(selectedTenantId, input);
      this.notice.emit(`Locataire ${tenant.fullName} mis à jour.`);
      this.closeTenantModal();
      return;
    }

    const tenant = this.store.addTenant(input);
    this.selectedTenantId.set(tenant.id);
    this.notice.emit(`Locataire ${tenant.fullName} ajouté.`);
    this.closeTenantModal();
  }

  deleteTenant(tenant: Tenant): void {
    if (!globalThis.confirm(`Supprimer le locataire ${tenant.fullName} ?`)) {
      return;
    }

    try {
      this.store.deleteTenant(tenant.id);

      if (this.selectedTenantId() === tenant.id) {
        this.selectedTenantId.set(null);
        this.resetForm();
        this.closeTenantModal();
      }

      this.notice.emit(`Locataire ${tenant.fullName} supprimé.`);
    } catch (error) {
      this.notice.emit(
        error instanceof Error
          ? error.message
          : 'Impossible de supprimer ce locataire.',
      );
    }
  }

  canDeleteTenant(tenant: Tenant): boolean {
    return this.store.canDeleteTenant(tenant.id);
  }

  attachedLabel(tenant: Tenant): string {
    return this.canDeleteTenant(tenant) ? 'Non rattaché' : 'Rattaché';
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
    this.tenantForm.reset({
      fullName: '',
      phone: '',
      email: '',
      profession: '',
      idDocument: '',
      emergencyContact: '',
      startDate: this.today,
      depositExpected: 0,
      depositPaidAmount: 0,
      depositPaidAt: this.today,
    });
  }
}
