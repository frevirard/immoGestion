import { Component, Input, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import {
  Archive,
  ArchiveRestore,
  ArrowLeftRight,
  Building2,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CircleUserRound,
  CreditCard,
  Download,
  Eye,
  Home,
  HandCoins,
  ImagePlus,
  LayoutDashboard,
  LogOut,
  MapPin,
  Megaphone,
  MessageCircle,
  Paperclip,
  Pencil,
  Plus,
  PlusCircle,
  Printer,
  ReceiptText,
  RotateCcw,
  Save,
  Search,
  Send,
  SlidersHorizontal,
  Trash2,
  UserPlus,
  Users,
  WalletCards,
  X,
  type IconNode,
  type SVGProps,
} from 'lucide';

export type LucideIconName =
  | 'archive'
  | 'archive-restore'
  | 'arrow-left-right'
  | 'building-2'
  | 'check'
  | 'chevron-left'
  | 'chevron-right'
  | 'circle-user-round'
  | 'circle-dollar-sign'
  | 'credit-card'
  | 'download'
  | 'eye'
  | 'home'
  | 'hand-coins'
  | 'image-plus'
  | 'layout-dashboard'
  | 'log-out'
  | 'map-pin'
  | 'megaphone'
  | 'message-circle'
  | 'paperclip'
  | 'pencil'
  | 'plus'
  | 'plus-circle'
  | 'printer'
  | 'receipt-text'
  | 'rotate-ccw'
  | 'save'
  | 'search'
  | 'send'
  | 'sliders-horizontal'
  | 'trash-2'
  | 'user-plus'
  | 'users'
  | 'wallet-cards'
  | 'x';

const ICONS: Record<LucideIconName, IconNode> = {
  archive: Archive,
  'archive-restore': ArchiveRestore,
  'arrow-left-right': ArrowLeftRight,
  'building-2': Building2,
  check: Check,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'circle-user-round': CircleUserRound,
  'circle-dollar-sign': CircleDollarSign,
  'credit-card': CreditCard,
  download: Download,
  eye: Eye,
  home: Home,
  'hand-coins': HandCoins,
  'image-plus': ImagePlus,
  'layout-dashboard': LayoutDashboard,
  'log-out': LogOut,
  'map-pin': MapPin,
  megaphone: Megaphone,
  'message-circle': MessageCircle,
  paperclip: Paperclip,
  pencil: Pencil,
  plus: Plus,
  'plus-circle': PlusCircle,
  printer: Printer,
  'receipt-text': ReceiptText,
  'rotate-ccw': RotateCcw,
  save: Save,
  search: Search,
  send: Send,
  'sliders-horizontal': SlidersHorizontal,
  'trash-2': Trash2,
  'user-plus': UserPlus,
  users: Users,
  'wallet-cards': WalletCards,
  x: X,
};

@Component({
  selector: 'app-lucide-icon',
  standalone: true,
  template: `<span class="lucide-icon" [innerHTML]="svgMarkup()"></span>`,
  styles: [
    `
      :host {
        display: inline-flex;
        width: 1em;
        height: 1em;
        flex: 0 0 auto;
        line-height: 1;
      }

      .lucide-icon {
        display: inline-flex;
        width: 100%;
        height: 100%;
      }

      .lucide-icon :is(svg) {
        display: block;
        width: 100%;
        height: 100%;
      }
    `,
  ],
})
export class LucideIconComponent {
  private readonly sanitizer = inject(DomSanitizer);

  @Input() name: LucideIconName = 'search';
  @Input() strokeWidth = 2.2;

  svgMarkup(): SafeHtml {
    const icon = ICONS[this.name] ?? Search;
    const children = icon.map(([tag, attrs]) => this.nodeToMarkup(tag, attrs)).join('');

    return this.sanitizer.bypassSecurityTrustHtml(
      `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" style="display:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${this.strokeWidth}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${children}</svg>`,
    );
  }

  private nodeToMarkup(tag: string, attrs: SVGProps): string {
    const attributes = Object.entries(attrs)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}="${this.escapeAttribute(value)}"`)
      .join(' ');

    return `<${tag}${attributes ? ` ${attributes}` : ''}></${tag}>`;
  }

  private escapeAttribute(value: string | number | undefined): string {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }
}
