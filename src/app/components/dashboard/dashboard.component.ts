import { Component, inject, Input } from '@angular/core';
import { ImmoStore } from '../../immo-store';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent {
  readonly store = inject(ImmoStore);

  @Input({ required: true }) selectedMonth = '';

  portfolioStats() {
    return this.store.portfolioStatsForMonth(this.selectedMonth);
  }

  rentSummaries() {
    return this.store.agentRentSummaries(this.store.currentUser(), this.selectedMonth);
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
}
