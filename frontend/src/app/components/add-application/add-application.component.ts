import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { JobHuntService } from '../../services/job-hunt.service';
import { Application, Source } from '../../models/application.model';

@Component({
  selector: 'app-add-application',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <div class="add-form">
      <h2>Add Application</h2>
      <form [formGroup]="form" (ngSubmit)="onSubmit()">
        <div class="field">
          <label>Company *</label>
          <input formControlName="company" type="text" placeholder="Acme Corp">
        </div>
        <div class="field">
          <label>Role *</label>
          <input formControlName="role" type="text" placeholder="Senior Developer">
        </div>
        <div class="field">
          <label>Source</label>
          <select formControlName="source">
            <option value="linkedin">LinkedIn</option>
            <option value="indeed">Indeed</option>
            <option value="referral">Referral</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="field">
          <label>Stage</label>
          <select formControlName="stage">
            <option value="applied">Applied</option>
            <option value="screened">Screened</option>
            <option value="interview">Interview</option>
            <option value="offer">Offer</option>
          </select>
        </div>
        <div class="field">
          <label>Applied Date</label>
          <input formControlName="applied_date" type="date">
        </div>
        <div class="field">
          <label>Follow-up Date</label>
          <input formControlName="follow_up_date" type="date">
        </div>
        <div class="field">
          <label>Notes</label>
          <textarea formControlName="notes" rows="3" placeholder="Additional notes..."></textarea>
        </div>
        <div class="errors" *ngIf="form.invalid && form.touched">
          <span *ngIf="form.get('company')?.errors?.['required']">Company is required</span>
          <span *ngIf="form.get('role')?.errors?.['required']">Role is required</span>
        </div>
        <button type="submit" [disabled]="form.invalid">Add Application</button>
      </form>
    </div>
  `,
  styles: [`
    .add-form { max-width: 500px; margin: 20px auto; padding: 20px; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
    .field { margin-bottom: 15px; }
    .field label { display: block; margin-bottom: 5px; font-weight: 600; }
    .field input, .field select, .field textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
    .field textarea { resize: vertical; }
    .errors { color: #dc3545; margin-bottom: 10px; font-size: 0.9em; }
    button { background: #007bff; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; }
    button:disabled { background: #ccc; cursor: not-allowed; }
  `],
})
export class AddApplicationComponent implements OnInit {
  form!: FormGroup;

  constructor(
    private fb: FormBuilder,
    private jobHuntService: JobHuntService,
  ) {}

  ngOnInit() {
    this.form = this.fb.group({
      company: ['', [Validators.required]],
      role: ['', [Validators.required]],
      source: ['linkedin' as Source],
      stage: ['applied' as Application['stage']],
      applied_date: [this.toDateISO(new Date()), [Validators.required]],
      follow_up_date: [''],
      notes: [''],
    });
  }

  toDateISO(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  onSubmit() {
    if (this.form.invalid) return;
    console.log('Submitting:', this.form.value);
    this.form.reset({
      company: '',
      role: '',
      source: 'linkedin',
      stage: 'applied',
      applied_date: this.toDateISO(new Date()),
      follow_up_date: '',
      notes: '',
    });
  }
}
