import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ImmoStore } from '../../immo-store';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  readonly store = inject(ImmoStore);
  private readonly fb = inject(NonNullableFormBuilder);
  readonly loginError = signal('');

  readonly loginForm = this.fb.group({
    email: ['admin@immo.local', [Validators.required, Validators.email]],
    password: ['admin123', Validators.required],
  });

  login(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const credentials = this.loginForm.getRawValue();

    if (!this.store.login(credentials.email, credentials.password)) {
      this.loginError.set('Identifiants incorrects. Essaie un compte de démonstration.');
      return;
    }

    this.loginError.set('');
  }

  quickLogin(email: string, password: string): void {
    this.loginForm.setValue({ email, password });
    this.login();
  }
}
