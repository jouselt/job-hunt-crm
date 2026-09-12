import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AddApplicationComponent } from './add-application.component';
import { JobHuntService } from '../../services/job-hunt.service';
import { Observable, of } from 'rxjs';
import { Application } from '../../models/application.model';

describe('AddApplicationComponent', () => {
  let createApplicationSpy: jasmine.Spy;

  const makeService = () => ({
    applications$: of([] as Application[]),
    pipelineStats$: of(null),
    createApplication: createApplicationSpy,
    loadApplications: jasmine.createSpy('loadApplications'),
  });

  beforeEach(async () => {
    createApplicationSpy = jasmine
      .createSpy('createApplication')
      .and.returnValue(of({} as Application));

    await TestBed.configureTestingModule({
      imports: [AddApplicationComponent],
      providers: [
        { provide: JobHuntService, useValue: makeService() },
        { provide: Router, useValue: { navigate: jasmine.createSpy() } },
      ],
    }).compileComponents();
  });

  it('starts invalid (missing company/role) and does not submit', () => {
    const fixture = TestBed.createComponent(AddApplicationComponent);
    fixture.detectChanges();

    expect(fixture.componentInstance.form.invalid).toBeTrue();

    fixture.componentInstance.onSubmit();
    expect(createApplicationSpy).not.toHaveBeenCalled();
  });

  it('submits and calls createApplication when company/role are set', () => {
    const fixture = TestBed.createComponent(AddApplicationComponent);
    fixture.detectChanges();

    const form = fixture.componentInstance.form;
    form.patchValue({ company: 'Acme', role: 'Dev' });

    expect(form.valid).toBeTrue();
    fixture.componentInstance.onSubmit();
    expect(createApplicationSpy).toHaveBeenCalled();
  });
});