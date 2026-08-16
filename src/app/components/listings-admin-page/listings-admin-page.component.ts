import { Component, EventEmitter, inject, Output, signal } from '@angular/core';
import { ImmoStore } from '../../immo-store';
import { MarketplaceListing } from '../../models';

@Component({
  selector: 'app-listings-admin-page',
  templateUrl: './listings-admin-page.component.html',
  styleUrl: './listings-admin-page.component.scss',
})
export class ListingsAdminPageComponent {
  @Output() notice = new EventEmitter<string>();

  readonly store = inject(ImmoStore);
  readonly savingListingId = signal('');

  async boostListing(listing: MarketplaceListing, days: number): Promise<void> {
    const admin = this.store.currentUser();

    if (!admin) {
      return;
    }

    this.savingListingId.set(listing.id);

    try {
      await this.store.boostListing(listing.id, admin.id, true, this.addDays(days));
      this.notice.emit(`Annonce "${listing.title}" boostée pour ${days} jours.`);
    } catch {
      this.notice.emit('Impossible de booster cette annonce.');
    } finally {
      this.savingListingId.set('');
    }
  }

  async removeBoost(listing: MarketplaceListing): Promise<void> {
    const admin = this.store.currentUser();

    if (!admin) {
      return;
    }

    this.savingListingId.set(listing.id);

    try {
      await this.store.boostListing(listing.id, admin.id, false);
      this.notice.emit(`Boost retiré pour "${listing.title}".`);
    } catch {
      this.notice.emit('Impossible de retirer le boost.');
    } finally {
      this.savingListingId.set('');
    }
  }

  isBoostActive(listing: MarketplaceListing): boolean {
    const today = new Date().toISOString().slice(0, 10);
    return Boolean(listing.boosted && (!listing.boostedUntil || listing.boostedUntil >= today));
  }

  listingPrice(listing: MarketplaceListing): string {
    const amount = listing.transactionType === 'SALE' ? listing.salePrice : listing.monthlyRent;
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      maximumFractionDigits: 0,
    })
      .format(amount || 0)
      .replace(/\u00A0|\u202F/g, ' ');
  }

  private addDays(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
  }
}
