import { IsString, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * A Jev API key is a single-line token. This shape check exists because the
 * field previously accepted ANY non-empty string, so pasting something that is
 * not a key (a profile JSON, a password, a whole document) was stored happily,
 * the UI answered "Key saved.", and the mistake only surfaced much later as a
 * 401 from TypeSafe in the middle of a triage run.
 *
 * Deliberately does not hardcode a prefix: it only asserts "one line, no
 * whitespace, sane length", which is true of any token and false of a pasted
 * document. `\S` keeps it agnostic to the vendor's actual key format.
 */
export const JEV_KEY_PATTERN = /^\S{8,512}$/;

export class SetJevKeyDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Matches(JEV_KEY_PATTERN, {
    message:
      'key must be a single-line API token of 8 to 512 characters with no spaces. ' +
      'If you pasted a JSON document or a multi-line value, that is not an API key.',
  })
  key!: string;
}
