import { Component, EventEmitter, inject, Output } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ImmoStore } from '../../immo-store';

@Component({
  selector: 'app-managers-page',
  imports: [ReactiveFormsModule],
  templateUrl: './managers-page.component.html',
  styleUrl: './managers-page.component.scss',
})
export class ManagersPageComponent {
  readonly store = inject(ImmoStore);
  private readonly fb = inject(NonNullableFormBuilder);

  @Output() readonly notice = new EventEmitter<string>();

  readonly managerForm = this.fb.group({
    name: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    phone: [''],
    password: ['gerant123', [Validators.required, Validators.minLength(6)]],
  });

  createManager(): void {
    if (this.managerForm.invalid) {
      this.managerForm.markAllAsTouched();
      return;
    }

    const input = this.managerForm.getRawValue();
    const emailExists = this.store
      .state()
      .users.some((user) => user.email.toLowerCase() === input.email.trim().toLowerCase());

    if (emailExists) {
      this.notice.emit('Un utilisateur existe déjà avec cette adresse email.');
      return;
    }

    const manager = this.store.addManager(input);
    this.managerForm.reset({ name: '', email: '', phone: '', password: 'gerant123' });
    this.notice.emit(`Gérant ${manager.name} ajouté.`);
  }

  assignedCount(managerId: string): number {
    return this.store.properties().filter((property) => property.managerId === managerId).length;
  }
}
