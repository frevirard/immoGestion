import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { MarketplaceListing } from '../../models';
import { LucideIconComponent } from '../lucide-icon.component';

@Component({
  selector: 'app-listing-card',
  imports: [LucideIconComponent],
  templateUrl: './listing-card.component.html',
  styleUrl: './listing-card.component.scss',
})
export class ListingCardComponent {
  @Input({ required: true }) listing!: MarketplaceListing;
  @Input() mode: 'public' | 'mine' = 'public';
  @Input() currentUserId: string | null = null;
  @Input() ownerVerified = false;
  @Input() isBusy = false;

  @Output() contact = new EventEmitter<MarketplaceListing>();
  @Output() edit = new EventEmitter<MarketplaceListing>();
  @Output() archive = new EventEmitter<MarketplaceListing>();
  @Output() restore = new EventEmitter<MarketplaceListing>();
  @Output() open = new EventEmitter<MarketplaceListing>();

  readonly activePhotoIndex = signal(0);

  get coverPhoto(): string {
    return this.listing.photos?.[this.safePhotoIndex]?.dataUrl ?? this.listing.photos?.[0]?.dataUrl ?? '';
  }

  get safePhotoIndex(): number {
    const photoCount = this.listing.photos?.length ?? 0;
    return photoCount ? Math.min(this.activePhotoIndex(), photoCount - 1) : 0;
  }

  get hasSeveralPhotos(): boolean {
    return (this.listing.photos?.length ?? 0) > 1;
  }

  get canContact(): boolean {
    return (
      this.mode === 'public' &&
      this.listing.status === 'PUBLISHED' &&
      Boolean(this.currentUserId) &&
      this.listing.ownerUserId !== this.currentUserId
    );
  }

  get canSeeViews(): boolean {
    return this.mode === 'mine' || this.listing.ownerUserId === this.currentUserId;
  }

  get isBoostActive(): boolean {
    const today = new Date().toISOString().slice(0, 10);
    return Boolean(this.listing.boosted && (!this.listing.boostedUntil || this.listing.boostedUntil >= today));
  }

  get locationLabel(): string {
    return [this.listing.district, this.listing.city, this.listing.address]
      .filter(Boolean)
      .join(' · ');
  }

  priceLabel(): string {
    if (this.listing.transactionType === 'SALE') {
      return `${this.formatMoney(this.listing.salePrice)} à la vente`;
    }

    return `${this.formatMoney(this.listing.monthlyRent)} / ${this.durationLabel()}`;
  }

  durationLabel(): string {
    if (this.listing.transactionType === 'SALE') {
      return 'vente';
    }

    const unit = this.listing.rentalDurationUnit || 'mois';
    return `${this.listing.rentalDurationValue} ${unit}`;
  }

  propertyTypeLabel(): string {
    const labels: Record<string, string> = {
      LAND: 'Terrain',
      BUILDING: 'Immeuble',
      HOUSE: 'Maison',
      APARTMENT: 'Appartement',
      ROOM: 'Chambre',
      STUDIO: 'Studio',
      OFFICE: 'Bureau',
      OTHER: 'Autre',
    };

    return labels[this.listing.propertyType] ?? this.listing.propertyType;
  }

  transactionLabel(): string {
    return this.listing.transactionType === 'SALE' ? 'Vente' : 'Location';
  }

  statusLabel(): string {
    const labels: Record<string, string> = {
      PUBLISHED: 'Active',
      INACTIVE: 'Désactivée',
      ARCHIVED: 'Archivée',
    };

    return labels[this.listing.status] ?? this.listing.status;
  }

  restoreActionLabel(): string {
    return this.listing.status === 'ARCHIVED' ? 'Désarchiver' : 'Réactiver';
  }

  previousPhoto(event: Event): void {
    event.stopPropagation();
    const photoCount = this.listing.photos?.length ?? 0;

    if (!photoCount) {
      return;
    }

    this.activePhotoIndex.update((index) => (index - 1 + photoCount) % photoCount);
  }

  nextPhoto(event: Event): void {
    event.stopPropagation();
    const photoCount = this.listing.photos?.length ?? 0;

    if (!photoCount) {
      return;
    }

    this.activePhotoIndex.update((index) => (index + 1) % photoCount);
  }

  openListing(): void {
    this.open.emit(this.listing);
  }

  private formatMoney(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'XOF',
      maximumFractionDigits: 0,
    })
      .format(amount || 0)
      .replace(/\u00A0|\u202F/g, ' ');
  }
}
