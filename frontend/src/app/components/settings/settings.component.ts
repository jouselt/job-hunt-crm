import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { JobHuntService } from '../../services/job-hunt.service';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, FormsModule],
  templateUrl: './settings.component.html',
  styleUrls: ['./settings.component.css'],
})
export class SettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly jobHunt = inject(JobHuntService);

  form!: FormGroup;
  configured = false;
  masked: string | null = null;
  saved = false;
  error: string | null = null;

  profileJson = '';
  profileConfigured = false;
  profileSummary = '';
  profileFileName: string | null = null;
  profileSaved = false;
  profileSavedAt: string | null = null;
  profileError: string | null = null;
  profileSaving = false;
  profileDirty = false;

  ngOnInit(): void {
    this.form = this.fb.group({ key: ['', Validators.required] });
    this.jobHunt.getJevKeyMasked().subscribe({
      next: (res) => {
        this.configured = res.configured;
        this.masked = res.masked;
      },
      error: () => {},
    });
    this.loadProfile();
  }

  private loadProfile(): void {
    this.jobHunt.getProfile().subscribe({
      next: (res) => {
        this.profileConfigured = !!res.profile;
        this.profileSummary = res.profile ? this.describe(res.profile) : '';
        if (res.profile) this.profileJson = JSON.stringify(res.profile, null, 2);
      },
      error: () => {},
    });
  }

  /** A visible, checkable summary of what is stored, e.g. "19 fields · 6 roles · 33 skills". */
  private describe(profile: any): string {
    const parts = [`${Object.keys(profile).length} fields`];
    if (Array.isArray(profile.roles)) parts.push(`${profile.roles.length} roles`);
    if (Array.isArray(profile.skills)) parts.push(`${profile.skills.length} skills`);
    if (Array.isArray(profile.experience)) parts.push(`${profile.experience.length} jobs`);
    return parts.join(' · ');
  }

  /** Any edit invalidates the previous save, so the "saved" line cannot linger and mislead. */
  onProfileChange(value: string): void {
    this.profileJson = value;
    this.profileSaved = false;
    this.profileDirty = true;
  }

  onProfileFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.profileSaved = false;
    this.profileError = null;

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? '');
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (e: any) {
        this.profileError = `${file.name}: invalid JSON (${e?.message ?? 'parse error'})`;
        return;
      }
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        this.profileError = `${file.name}: the file must contain a JSON object`;
        return;
      }
      this.profileJson = JSON.stringify(parsed, null, 2);
      this.profileFileName = file.name;
      this.profileDirty = true;
    };
    reader.onerror = () => {
      this.profileError = `Could not read ${file.name}`;
    };
    reader.readAsText(file);
    // Reset so picking the same file again still fires a change event.
    input.value = '';
  }

  onSaveProfile(): void {
    this.profileSaved = false;
    this.profileError = null;

    let parsed: any;
    try {
      parsed = JSON.parse(this.profileJson);
    } catch {
      this.profileError = 'Invalid JSON';
      return;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      this.profileError = 'Profile must be a JSON object';
      return;
    }

    this.profileSaving = true;
    this.jobHunt.saveProfile(parsed).subscribe({
      next: () => {
        this.profileSaving = false;
        this.profileSaved = true;
        this.profileDirty = false;
        this.profileFileName = null;
        this.profileSavedAt = new Date().toLocaleTimeString();
        // Re-read from the server so the badge reflects what is actually stored,
        // not what we hoped we sent.
        this.loadProfile();
      },
      error: (err) => {
        this.profileSaving = false;
        this.profileError = err?.status
          ? `Failed to save profile (HTTP ${err.status})`
          : 'Failed to save profile';
      },
    });
  }

  onSave(): void {
    if (this.form.invalid) return;
    this.saved = false;
    this.error = null;
    this.jobHunt.saveJevKey(this.form.value.key).subscribe({
      next: () => {
        this.saved = true;
        this.configured = true;
        this.form.reset();
        this.jobHunt.getJevKeyMasked().subscribe((res) => {
          this.masked = res.masked;
        });
      },
      error: () => {
        this.error = 'Failed to save key';
      },
    });
  }
}
