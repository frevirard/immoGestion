import { Component, computed, inject, signal } from '@angular/core';
import { ImmoStore } from '../../immo-store';
import { DashboardComponent } from '../dashboard/dashboard.component';
import { ManagersPageComponent } from '../managers-page/managers-page.component';
import { PropertyFormComponent } from '../property-form/property-form.component';
import { PropertiesPageComponent } from '../properties-page/properties-page.component';
import { TenantsPageComponent } from '../tenants-page/tenants-page.component';

type AppPage = 'dashboard' | 'properties' | 'add-property' | 'managers' | 'tenants';

@Component({
  selector: 'app-shell',
  imports: [
    DashboardComponent,
    ManagersPageComponent,
    PropertyFormComponent,
    PropertiesPageComponent,
    TenantsPageComponent,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  readonly store = inject(ImmoStore);
  readonly activePage = signal<AppPage>('dashboard');
  readonly selectedMonth = signal(new Date().toISOString().slice(0, 7));
  readonly notice = signal('');

  readonly navItems = computed(() => {
    const common = [
      { id: 'dashboard' as const, label: 'Tableau de bord', helper: 'Vue globale' },
      { id: 'properties' as const, label: 'Biens', helper: 'Consulter le parc' },
      { id: 'tenants' as const, label: 'Locataires', helper: 'CRUD locataires' },
    ];

    if (!this.isAdmin()) {
      return common;
    }

    return [
      ...common,
      { id: 'add-property' as const, label: 'Ajouter un bien', helper: 'Création' },
      { id: 'managers' as const, label: 'Gérants', helper: 'Comptes agents' },
    ];
  });

  setPage(page: AppPage): void {
    this.activePage.set(page);
    this.notice.set('');
  }

  setSelectedMonth(event: Event): void {
    this.selectedMonth.set((event.target as HTMLInputElement).value);
  }

  handleNotice(message: string): void {
    this.notice.set(message);
  }

  logout(): void {
    this.store.logout();
  }

  resetDemoData(): void {
    this.store.resetDemoData();
    this.activePage.set('dashboard');
    this.notice.set('Données de démonstration restaurées.');
  }

  isAdmin(): boolean {
    return this.store.currentUser()?.role === 'ADMIN';
  }
}
