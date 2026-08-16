import { Component, computed, inject, signal } from '@angular/core';
import { ImmoStore } from '../../immo-store';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { CollectionsPageComponent } from '../collections-page/collections-page.component';
import { ExpensesPageComponent } from '../expenses-page/expenses-page.component';
import { ListingsAdminPageComponent } from '../listings-admin-page/listings-admin-page.component';
import { ManagersPageComponent } from '../managers-page/managers-page.component';
import { PropertyFormComponent } from '../property-form/property-form.component';
import { PropertiesPageComponent } from '../properties-page/properties-page.component';
import { TenantsPageComponent } from '../tenants-page/tenants-page.component';
import { LucideIconComponent, type LucideIconName } from '../lucide-icon.component';

type AppPage =
  | 'dashboard'
  | 'properties'
  | 'collections'
  | 'expenses'
  | 'add-property'
  | 'managers'
  | 'tenants'
  | 'listings';

@Component({
  selector: 'app-shell',
  imports: [
    DashboardComponent,
    CollectionsPageComponent,
    ExpensesPageComponent,
    ListingsAdminPageComponent,
    ManagersPageComponent,
    PropertyFormComponent,
    PropertiesPageComponent,
    TenantsPageComponent,
    LucideIconComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  readonly store = inject(ImmoStore);
  readonly activePage = signal<AppPage>('dashboard');
  readonly selectedMonth = signal(new Date().toISOString().slice(0, 7));
  readonly notice = signal('');
  readonly isMenuOpen = signal(false);

  readonly navItems = computed(() => {
    const common = [
      { id: 'dashboard' as const, label: 'Tableau de bord', helper: 'Vue globale' },
      { id: 'properties' as const, label: 'Biens', helper: 'Consulter le parc' },
      { id: 'collections' as const, label: 'Encaissements', helper: 'Collecter les loyers' },
      { id: 'expenses' as const, label: 'Dépenses', helper: 'Suivre les charges' },
      { id: 'tenants' as const, label: 'Locataires', helper: 'CRUD locataires' },
    ];

    if (!this.isAdmin()) {
      return common;
    }

    return [
      ...common,
      { id: 'add-property' as const, label: 'Ajouter un bien', helper: 'Création' },
      { id: 'managers' as const, label: 'Gérants', helper: 'Comptes agents' },
      { id: 'listings' as const, label: 'Annonces', helper: 'Boost & visibilité' },
    ];
  });

  setPage(page: AppPage): void {
    this.activePage.set(page);
    this.notice.set('');
    this.closeMenu();

    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>('.workspace')?.scrollTo({
        top: 0,
        behavior: 'auto',
      });
    });
  }

  toggleMenu(): void {
    this.isMenuOpen.update((isOpen) => !isOpen);
  }

  closeMenu(): void {
    this.isMenuOpen.set(false);
  }

  navIcon(page: AppPage): LucideIconName {
    const icons: Record<AppPage, LucideIconName> = {
      dashboard: 'layout-dashboard',
      properties: 'building-2',
      collections: 'hand-coins',
      expenses: 'receipt-text',
      tenants: 'users',
      'add-property': 'plus-circle',
      managers: 'user-plus',
      listings: 'megaphone',
    };

    return icons[page];
  }

  setSelectedMonth(event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    if (value) {
      this.selectedMonth.set(value);
    }
  }

  handleNotice(message: string): void {
    this.notice.set(message);
  }

  logout(): void {
    this.store.logout();
  }

  isAdmin(): boolean {
    return this.store.currentUser()?.role === 'ADMIN';
  }
}
