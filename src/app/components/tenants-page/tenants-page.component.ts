import { Component, computed, EventEmitter, inject, OnInit, Output, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ImmoStore } from '../../immo-store';
import { Tenant } from '../../models';
import { LucideIconComponent } from '../lucide-icon.component';

type TenantFilter = 'ALL' | 'ATTACHED' | 'FREE';

const TENANT_PAGE_SIZE = 8;

@Component({
  selector: 'app-tenants-page',
  imports: [ReactiveFormsModule, LucideIconComponent],
  templateUrl: './tenants-page.component.html',
  styleUrl: './tenants-page.component.scss',
})
export class TenantsPageComponent implements OnInit {
  readonly store = inject(ImmoStore);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly selectedTenantId = signal<string | null>(null);
  readonly isTenantModalOpen = signal(false);
  readonly tenantSearch = signal('');
  readonly tenantFilter = signal<TenantFilter>('ALL');
  readonly tenantPage = signal(1);
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

  readonly totalTenantCount = computed(() => this.store.tenants().length);
  readonly attachedTenantCount = computed(
    () => this.store.tenants().filter((tenant) => !this.canDeleteTenant(tenant)).length,
  );
  readonly freeTenantCount = computed(() => this.totalTenantCount() - this.attachedTenantCount());

  readonly filteredTenants = computed(() => {
    const query = this.normalize(this.tenantSearch());

    return this.store
      .tenants()
      .filter((tenant) => this.matchesTenantFilter(tenant))
      .filter((tenant) => this.matchesTenantSearch(tenant, query))
      .sort((first, second) => first.fullName.localeCompare(second.fullName));
  });

  readonly totalTenantPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredTenants().length / TENANT_PAGE_SIZE)),
  );

  readonly currentTenantPage = computed(() =>
    Math.min(Math.max(1, this.tenantPage()), this.totalTenantPages()),
  );

  readonly paginatedTenants = computed(() => {
    const start = (this.currentTenantPage() - 1) * TENANT_PAGE_SIZE;
    return this.filteredTenants().slice(start, start + TENANT_PAGE_SIZE);
  });

  readonly visibleTenantPages = computed(() => {
    const total = this.totalTenantPages();
    const current = this.currentTenantPage();
    const end = Math.min(total, Math.max(5, current + 2));
    const start = Math.max(1, Math.min(current - 2, end - 4));

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
  });

  ngOnInit(): void {
    void this.loadTenantsFromDatabase();
  }

  async loadTenantsFromDatabase(): Promise<void> {
    try {
      await this.store.refresh();
      await this.store.refreshTenants();
    } catch {
      this.notice.emit('Impossible de charger la liste des locataires depuis la base.');
    }
  }

  openCreateTenant(): void {
    this.selectedTenantId.set(null);
    this.resetForm();
    this.isTenantModalOpen.set(true);
  }

  setTenantSearch(event: Event): void {
    this.tenantSearch.set((event.target as HTMLInputElement).value);
    this.resetTenantPage();
  }

  setTenantFilter(filter: TenantFilter): void {
    this.tenantFilter.set(filter);
    this.resetTenantPage();
  }

  resetTenantFilters(): void {
    this.tenantSearch.set('');
    this.tenantFilter.set('ALL');
    this.resetTenantPage();
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

  async saveTenant(): Promise<void> {
    if (this.tenantForm.invalid) {
      this.tenantForm.markAllAsTouched();
      return;
    }

    const input = this.tenantForm.getRawValue();
    const selectedTenantId = this.selectedTenantId();

    try {
      if (selectedTenantId) {
        const tenant = await this.store.updateTenant(selectedTenantId, input);
        await this.store.refreshTenants();
        this.notice.emit(`Locataire ${tenant.fullName} mis à jour.`);
        this.closeTenantModal();
        return;
      }

      const tenant = await this.store.addTenant(input);
      await this.store.refreshTenants();
      this.selectedTenantId.set(tenant.id);
      this.notice.emit(`Locataire ${tenant.fullName} ajouté.`);
      this.closeTenantModal();
    } catch {
      this.notice.emit('Impossible d’enregistrer ce locataire.');
    }
  }

  async deleteTenant(tenant: Tenant): Promise<void> {
    if (!globalThis.confirm(`Supprimer le locataire ${tenant.fullName} ?`)) {
      return;
    }

    try {
      await this.store.deleteTenant(tenant.id);
      await this.store.refreshTenants();

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

  previousTenantPage(): void {
    this.tenantPage.update((page) => Math.max(1, page - 1));
  }

  nextTenantPage(): void {
    this.tenantPage.update((page) => Math.min(this.totalTenantPages(), page + 1));
  }

  goToTenantPage(page: number): void {
    this.tenantPage.set(Math.min(Math.max(1, page), this.totalTenantPages()));
  }

  resetTenantPage(): void {
    this.tenantPage.set(1);
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

  formatDate(date: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(`${date}T00:00:00`));
  }

  private matchesTenantFilter(tenant: Tenant): boolean {
    switch (this.tenantFilter()) {
      case 'ATTACHED':
        return !this.canDeleteTenant(tenant);
      case 'FREE':
        return this.canDeleteTenant(tenant);
      default:
        return true;
    }
  }

  private matchesTenantSearch(tenant: Tenant, query: string): boolean {
    if (!query) {
      return true;
    }

    return this.normalize(
      [
        tenant.fullName,
        tenant.phone,
        tenant.email,
        tenant.profession,
        tenant.idDocument,
        tenant.emergencyContact,
      ]
        .filter(Boolean)
        .join(' '),
    ).includes(query);
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
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
