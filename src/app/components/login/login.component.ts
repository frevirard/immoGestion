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

  readonly authMode = signal<'login' | 'register'>('login');
  readonly loginError = signal('');
  readonly registerError = signal('');
  readonly registerMessage = signal('');
  readonly isLoggingIn = signal(false);
  readonly isRegistering = signal(false);

  readonly loginForm = this.fb.group({
    email: ['admin@immo.local', [Validators.required, Validators.email]],
    password: ['admin123', Validators.required],
  });

  readonly registerForm = this.fb.group({
    username: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(30),
        Validators.pattern(/^[\p{L}0-9._-]+$/u),
      ],
    ],
    firstName: ['', Validators.required],
    lastName: ['', Validators.required],
    phone: ['', Validators.required],
    email: ['', [Validators.required, Validators.email]],
    birthDate: ['', Validators.required],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  async login(): Promise<void> {
    if (this.isLoggingIn()) {
      return;
    }

    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      this.loginError.set('Renseigne un email valide et ton mot de passe.');
      return;
    }

    const credentials = this.loginForm.getRawValue();

    this.isLoggingIn.set(true);
    this.loginError.set('');

    try {
      if (!(await this.store.login(credentials.email, credentials.password))) {
        this.loginError.set('Identifiants incorrects ou compte non actif.');
      }
    } finally {
      this.isLoggingIn.set(false);
    }
  }

  async register(): Promise<void> {
    if (this.isRegistering()) {
      return;
    }

    if (this.registerForm.invalid) {
      this.registerForm.markAllAsTouched();
      this.registerError.set(
        'Complète tous les champs avec un pseudo unique, un email valide et un mot de passe de 6 caractères minimum.',
      );
      return;
    }

    this.isRegistering.set(true);
    this.registerError.set('');
    this.registerMessage.set('');

    try {
      const user = await this.store.register(this.registerForm.getRawValue());
      this.registerMessage.set(
        `Compte ${user.username || user.name} créé. Tu es maintenant connecté à ton espace utilisateur.`,
      );
      this.loginForm.patchValue({ email: user.email, password: '' });
      this.registerForm.reset({
        username: '',
        firstName: '',
        lastName: '',
        phone: '',
        email: '',
        birthDate: '',
        password: '',
      });
      this.authMode.set('login');
    } catch (error) {
      this.registerError.set(this.registrationErrorMessage(error));
    } finally {
      this.isRegistering.set(false);
    }
  }

  setMode(mode: 'login' | 'register'): void {
    this.authMode.set(mode);
    this.loginError.set('');
    this.registerError.set('');
    this.registerMessage.set('');
  }

  async quickLogin(email: string, password: string): Promise<void> {
    this.loginForm.setValue({ email, password });
    await this.login();
  }

  private registrationErrorMessage(error: unknown): string {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? Number((error as { status: unknown }).status)
        : 0;

    if (status === 0) {
      return 'Le backend ne répond pas. Démarre Spring Boot sur le port 8080 puis réessaie.';
    }

    if (status === 409) {
      return 'Un compte existe déjà avec cet email ou ce nom d’utilisateur.';
    }

    return 'Impossible de créer ce compte. Vérifie les informations puis réessaie.';
  }
}
