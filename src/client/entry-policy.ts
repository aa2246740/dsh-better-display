/** Select the reading view on entry, without fighting a later explicit tab choice. */
export class ReaderEntryPolicy {
  private entered = false;

  constructor(private readonly requested: boolean, private readonly consumeRequest: () => void = () => {}) {}

  select(view: string | null | undefined): 'reader' | null {
    const requested = !this.entered && this.requested;
    if (!this.entered) {
      this.entered = true;
      if (this.requested) this.consumeRequest();
    }
    return (requested || view == null) && view !== 'reader' ? 'reader' : null;
  }
}

export function readerEntryRequested(search: string): boolean {
  const value = new URLSearchParams(search).get('reader');
  return value === '1' || /^0\.1\.0-trial\.\d+$/.test(value ?? '');
}
