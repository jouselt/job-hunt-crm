import { TestBed } from '@angular/core/testing';
import { SettingsComponent } from './settings.component';
import { JobHuntService } from '../../services/job-hunt.service';
import { of, throwError } from 'rxjs';

/** Poll until the predicate holds, so a real FileReader's async read is awaited
 *  without depending on an arbitrary sleep duration. */
async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate() && Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('SettingsComponent', () => {
  const storedProfile = {
    roles: ['Senior Fullstack Developer'],
    skills: ['Angular', 'TypeScript'],
    seniority: 'senior',
    location: 'Santiago, Chile',
    remote_ok: true,
    relocation: 'Northern Europe',
    notes: 'stored',
  };

  let service: {
    getJevKeyMasked: jasmine.Spy;
    saveJevKey: jasmine.Spy;
    getProfile: jasmine.Spy;
    saveProfile: jasmine.Spy;
  };

  const makeComponent = () => {
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    return fixture;
  };

  /** Feed a File to the handler the way the template's (change) binding would. */
  const selectFile = (fixture: any, file: File) => {
    fixture.componentInstance.onProfileFileSelected({
      target: { files: [file], value: 'x' },
    } as unknown as Event);
  };

  beforeEach(async () => {
    service = {
      getJevKeyMasked: jasmine.createSpy().and.returnValue(of({ configured: true, masked: '****abcd' })),
      saveJevKey: jasmine.createSpy().and.returnValue(of(undefined)),
      getProfile: jasmine.createSpy().and.returnValue(of({ configured: true, profile: storedProfile })),
      saveProfile: jasmine.createSpy().and.returnValue(of(undefined)),
    };

    await TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [{ provide: JobHuntService, useValue: service }],
    }).compileComponents();
  });

  it('shows the stored profile summary on load', () => {
    const fixture = makeComponent();
    const text = fixture.nativeElement.textContent as string;

    expect(service.getProfile).toHaveBeenCalled();
    expect(text).toContain('7 fields');
    expect(text).toContain('1 roles');
    expect(text).toContain('2 skills');
  });

  it('warns instead of showing a summary when no profile is stored', () => {
    service.getProfile.and.returnValue(of({ configured: false, profile: null }));
    const fixture = makeComponent();
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain('No profile configured yet');
  });

  it('loads a .json file into the textarea', async () => {
    const fixture = makeComponent();
    const file = new File(['{"roles":["Senior Frontend Engineer"],"seniority":"senior"}'], 'triage-profile.json', {
      type: 'application/json',
    });

    selectFile(fixture, file);
    await waitFor(() => fixture.componentInstance.profileJson.includes('Senior Frontend Engineer'));

    expect(fixture.componentInstance.profileJson).toContain('Senior Frontend Engineer');
    expect(fixture.componentInstance.profileFileName).toBe('triage-profile.json');
    expect(fixture.componentInstance.profileError).toBeNull();
  });

  it('reports a non-object .json file and leaves the textarea untouched', async () => {
    const fixture = makeComponent();
    fixture.componentInstance.profileJson = '{"unchanged":true}';
    const file = new File(['[1,2,3]'], 'array.json', { type: 'application/json' });

    selectFile(fixture, file);
    await waitFor(() => fixture.componentInstance.profileError !== null);

    expect(fixture.componentInstance.profileError).toContain('must contain a JSON object');
    expect(fixture.componentInstance.profileJson).toBe('{"unchanged":true}');
  });

  it('reports a malformed .json file', async () => {
    const fixture = makeComponent();
    const file = new File(['{not json'], 'broken.json', { type: 'application/json' });

    selectFile(fixture, file);
    await waitFor(() => fixture.componentInstance.profileError !== null);

    expect(fixture.componentInstance.profileError).toContain('invalid JSON');
  });

  it('saves the parsed profile and confirms with a timestamp', () => {
    const fixture = makeComponent();
    fixture.componentInstance.onProfileChange('{"roles":["Senior Fullstack Developer"]}');

    fixture.componentInstance.onSaveProfile();

    expect(service.saveProfile).toHaveBeenCalledWith({ roles: ['Senior Fullstack Developer'] });
    expect(fixture.componentInstance.profileSaved).toBe(true);
    expect(fixture.componentInstance.profileSavedAt).toBeTruthy();
    expect(fixture.componentInstance.profileError).toBeNull();
  });

  it('refuses invalid JSON and does not call the API', () => {
    const fixture = makeComponent();
    fixture.componentInstance.onProfileChange('{not json');

    fixture.componentInstance.onSaveProfile();

    expect(service.saveProfile).not.toHaveBeenCalled();
    expect(fixture.componentInstance.profileError).toBe('Invalid JSON');
  });

  it('refuses a JSON array and does not call the API', () => {
    const fixture = makeComponent();
    fixture.componentInstance.onProfileChange('[1,2,3]');

    fixture.componentInstance.onSaveProfile();

    expect(service.saveProfile).not.toHaveBeenCalled();
    expect(fixture.componentInstance.profileError).toBe('Profile must be a JSON object');
  });

  it('surfaces the HTTP status when the save fails', () => {
    service.saveProfile.and.returnValue(throwError(() => ({ status: 400 })));
    const fixture = makeComponent();
    fixture.componentInstance.onProfileChange('{"roles":["x"]}');

    fixture.componentInstance.onSaveProfile();

    expect(fixture.componentInstance.profileSaved).toBe(false);
    expect(fixture.componentInstance.profileError).toBe('Failed to save profile (HTTP 400)');
    expect(fixture.componentInstance.profileSaving).toBe(false);
  });

  it('surfaces the server message when the key is rejected', () => {
    service.saveJevKey.and.returnValue(
      throwError(() => ({ status: 400, error: { message: 'TypeSafe rejected this key (401).' } })),
    );
    const fixture = makeComponent();
    fixture.componentInstance.form.setValue({ key: 'not_a_key' });

    fixture.componentInstance.onSave();

    expect(fixture.componentInstance.saved).toBe(false);
    expect(fixture.componentInstance.error).toBe('TypeSafe rejected this key (401).');
  });

  it('joins an array of validation messages from the server', () => {
    service.saveProfile.and.returnValue(
      throwError(() => ({ status: 400, error: { message: ['profile must be an object'] } })),
    );
    const fixture = makeComponent();
    fixture.componentInstance.onProfileChange('{"roles":["x"]}');

    fixture.componentInstance.onSaveProfile();

    expect(fixture.componentInstance.profileError).toBe('profile must be an object');
  });

  it('clears the saved confirmation when the profile is edited again', () => {
    const fixture = makeComponent();
    fixture.componentInstance.onProfileChange('{"roles":["x"]}');
    fixture.componentInstance.onSaveProfile();
    expect(fixture.componentInstance.profileSaved).toBe(true);

    fixture.componentInstance.onProfileChange('{"roles":["y"]}');

    expect(fixture.componentInstance.profileSaved).toBe(false);
    expect(fixture.componentInstance.profileDirty).toBe(true);
  });
});
