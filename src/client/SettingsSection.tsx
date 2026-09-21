import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { foldIntensityOf, frostedGlassOf, keepProseOf, keepToolSemanticsOf, type FoldIntensity } from './fold-intensity.js';
import { deliverableOpenModeOf, type DeliverableOpenMode } from './open-file.js';
import { settingsCopyFor, type SettingsCopy, type SettingsCopyKey } from './settings-copy.js';
import { CONVENTIONAL_SKILL_ROOTS, detectGenerativeMcpappsSkill, shortestInstallCommand, type SkillStatusProbe, type SkillStatusSnapshot } from './skill-status.js';
import css from './SettingsSection.module.css';

export interface ReaderPrefsSnapshot {
  deliverableOpenMode?: DeliverableOpenMode;
  frostedGlass?: boolean;
  foldIntensity?: FoldIntensity;
  autoFold?: boolean;
  processOnly?: boolean;
  keepProse?: boolean;
  keepToolSemantics?: boolean;
}

export interface OpenPrefs {
  getSnapshot: () => ReaderPrefsSnapshot;
  subscribe: (fn: () => void) => () => void;
  actions: {
    setDeliverableOpenMode: (value: DeliverableOpenMode) => void;
    setFrostedGlass: (value: boolean) => void;
    setFoldIntensity?: (value: FoldIntensity) => void;
    setKeepProse?: (value: boolean) => void;
    setKeepToolSemantics?: (value: boolean) => void;
    setAutoFold?: (value: boolean) => void;
  };
}

export interface BetterDisplaySettingsInjected {
  prefs: OpenPrefs;
  copy?: SettingsCopy;
  languageTag?: string;
  checkSkill: SkillStatusProbe;
}

type SettingsProps = BetterDisplaySettingsInjected & {
  /** Official settings.section owner share; unused here. */
  close?: () => void;
  t?: (key: SettingsCopyKey) => string;
};

function text(props: SettingsProps, copy: SettingsCopy, key: keyof SettingsCopy): string {
  if (typeof props.t === 'function') {
    try {
      const value = props.t(key);
      if (typeof value === 'string' && value.length > 0 && value !== key) return value;
    } catch {
      // Fall through to the bundled dictionaries.
    }
  }
  return copy[key];
}

const FOLD_STOPS: { value: FoldIntensity; key: 'foldNone' | 'foldStandard' | 'foldSummary' }[] = [
  { value: 0, key: 'foldNone' },
  { value: 1, key: 'foldStandard' },
  { value: 2, key: 'foldSummary' },
];

export function SettingsSection(props: SettingsProps) {
  const copy = props.copy ?? settingsCopyFor(props.languageTag);
  const snap = useSyncExternalStore(
    props.prefs.subscribe,
    () => props.prefs.getSnapshot() ?? ({} as ReaderPrefsSnapshot),
    () => ({} as ReaderPrefsSnapshot),
  );
  const mode = deliverableOpenModeOf(snap.deliverableOpenMode);
  const glass = frostedGlassOf(snap);
  const keepProse = keepProseOf(snap);
  const keepToolSemantics = keepToolSemanticsOf(snap);
  const autoFold = snap.autoFold !== false && snap.foldIntensity !== 0;
  // The slider is the single owner of fold intensity. Reading it here keeps the
  // control honest even for snapshots written before the three stops existed.
  const intensity = foldIntensityOf(snap);
  const setMode = (value: DeliverableOpenMode) => {
    props.prefs.actions.setDeliverableOpenMode(value);
  };
  const on = mode === 'sidebar';
  const [skill, setSkill] = useState<SkillStatusSnapshot | undefined>();
  const [checking, setChecking] = useState(false);

  const recheck = useCallback(async () => {
    setChecking(true);
    try {
      setSkill(await detectGenerativeMcpappsSkill(props.checkSkill));
    } catch {
      setSkill({
        name: 'generative-mcpapps',
        installed: false,
        via: null,
        roots: [],
        hostReached: false,
      });
    } finally {
      setChecking(false);
    }
  }, [props.checkSkill]);

  useEffect(() => { void recheck(); }, [recheck]);

  return (
    <div className={css.section} data-better-display-settings>
      <div className={css.row}>
        <div className={css.rowText}>
          <div className={css.title}>{text(props, copy, 'openTitle')}</div>
          <div className={css.desc}>{text(props, copy, 'openDescription')}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          className={css.switch}
          data-on={on || undefined}
          data-better-display-open-mode={mode}
          onClick={() => { setMode(on ? 'external' : 'sidebar'); }}
        />
      </div>

      <div className={css.row}>
        <div className={css.rowText}>
          <div className={css.title}>{text(props, copy, 'glassTitle')}</div>
          <div className={css.desc}>{text(props, copy, 'glassDescription')}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={glass}
          className={css.switch}
          data-on={glass || undefined}
          data-better-display-glass={glass ? 'on' : 'off'}
          onClick={() => { props.prefs.actions.setFrostedGlass(!glass); }}
        />
      </div>

      <div className={css.row}>
        <div className={css.rowText}>
          <div className={css.title}>{text(props, copy, 'foldTitle')}</div>
          <div className={css.desc}>{text(props, copy, 'foldDescription')}</div>
        </div>
      </div>
      <div className={css.segment} role="radiogroup" aria-label={text(props, copy, 'foldTitle')}>
        {FOLD_STOPS.map(stop => (
          <button
            key={stop.value}
            type="button"
            role="radio"
            aria-checked={intensity === stop.value}
            className={css.segmentStop}
            data-on={intensity === stop.value || undefined}
            data-better-display-fold-stop={stop.value}
            onClick={() => { props.prefs.actions.setFoldIntensity?.(stop.value); }}
          >
            {text(props, copy, stop.key)}
          </button>
        ))}
      </div>

      <div className={css.rowQuiet}>
        <div className={css.rowText}>
          <div className={css.quietTitle}>{text(props, copy, 'keepProseTitle')}</div>
          <div className={css.quietDesc}>{text(props, copy, 'keepProseDescription')}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={keepProse}
          className={css.switch + ' ' + css.switchQuiet}
          data-on={keepProse || undefined}
          data-better-display-keep-prose={keepProse ? 'on' : 'off'}
          onClick={() => { props.prefs.actions.setKeepProse?.(!keepProse); }}
        />
      </div>

      <div className={css.rowQuiet}>
        <div className={css.rowText}>
          <div className={css.quietTitle}>{text(props, copy, 'keepToolSemanticsTitle')}</div>
          <div className={css.quietDesc}>{text(props, copy, 'keepToolSemanticsDescription')}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={keepToolSemantics}
          className={css.switch + ' ' + css.switchQuiet}
          data-on={keepToolSemantics || undefined}
          data-better-display-keep-tool-semantics={keepToolSemantics ? 'on' : 'off'}
          onClick={() => { props.prefs.actions.setKeepToolSemantics?.(!keepToolSemantics); }}
        />
      </div>

      <section className={css.block} data-better-display-skill={skill?.installed ? 'installed' : 'missing'}>
        <div className={css.title}>{text(props, copy, 'skillTitle')}</div>
        <div className={css.status}>
          <span className={css.badge} data-ok={skill?.installed || undefined}>
            {skill?.installed ? text(props, copy, 'skillInstalled') : text(props, copy, 'skillMissing')}
          </span>
        </div>
        <p className={css.desc}>{text(props, copy, 'skillPurpose')}</p>
        <p className={css.desc}>{text(props, copy, 'skillPluginNote')}</p>
        {skill && !skill.installed ? (
          <>
            <p className={css.desc}>{skill.hostReached ? text(props, copy, 'skillInstall') : text(props, copy, 'skillUnavailable')}</p>
            <pre className={css.pre}>{shortestInstallCommand()}</pre>
            <ul className={css.roots} data-better-display-skill-roots>
              {CONVENTIONAL_SKILL_ROOTS.map(root => (
                <li key={root}>{root}</li>
              ))}
            </ul>
          </>
        ) : null}
        <div className={css.actions}>
          <button type="button" className={css.button} disabled={checking} onClick={() => { void recheck(); }}>
            {checking ? text(props, copy, 'skillChecking') : text(props, copy, 'skillRecheck')}
          </button>
        </div>
      </section>
    </div>
  );
}
