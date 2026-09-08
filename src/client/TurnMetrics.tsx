import { memo, useEffect, useRef, useState } from 'react';
import type { TurnTokenUsage } from '@deepseek-ai/dsh-client-ui-chat/client';
import css from './TurnMetrics.module.css';

interface TurnMetricsProps {
  usage?: TurnTokenUsage;
  runMs?: number;
  tokensPerSecond?: number;
  ttftMs?: number;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

function formatTokens(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(2)}M tok`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k tok`;
  return `${count} tok`;
}

export const TurnMetrics = memo(function TurnMetrics({
  usage,
  runMs,
  tokensPerSecond,
  ttftMs,
}: TurnMetricsProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const hasTiming = typeof runMs === 'number' && runMs > 0;
  const hasTokens = !!usage && typeof usage.totalTokens === 'number' && usage.totalTokens > 0;

  if (!hasTiming && !hasTokens) return null;

  // Build compact pill label
  const pillParts: string[] = [];
  if (hasTiming) pillParts.push(formatDuration(runMs!));
  if (typeof tokensPerSecond === 'number' && tokensPerSecond > 0) {
    pillParts.push(`${tokensPerSecond.toFixed(0)} tok/s`);
  } else if (hasTokens) {
    pillParts.push(formatTokens(usage!.totalTokens));
  }

  const cacheHitPercent = usage?.cacheReadTokens && usage?.totalTokens && usage.totalTokens > usage.outputTokens
    ? Math.round((usage.cacheReadTokens / (usage.totalTokens - usage.outputTokens)) * 100)
    : null;

  return (
    <span ref={containerRef} className={css.container}>
      <button
        type="button"
        className={css.pillButton}
        data-active={open}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        title="查看本轮耗时、吞吐与 Token 消耗概况"
      >
        <svg className={css.pillIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <circle cx="8" cy="8" r="6.5" strokeWidth="1.2" />
          <path d="M8 4.5v3.8l2.5 1.5" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{pillParts.join(' · ')}</span>
      </button>

      {open && (
        <div className={css.metricsPop} role="dialog" aria-label="本轮概况">
          <div className={css.popHeader}>
            <span>本轮性能与用量概况</span>
          </div>

          {hasTiming && (
            <div className={css.popSection}>
              <div className={css.popSectionTitle}>耗时与生成速度</div>
              <div className={css.popGrid}>
                <span className={css.popLabel}>总用时</span>
                <span className={css.popValue}>{formatDuration(runMs!)}</span>

                {typeof tokensPerSecond === 'number' && tokensPerSecond > 0 && (
                  <>
                    <span className={css.popLabel}>生成吞吐 (TPS)</span>
                    <span className={css.popValue}>{tokensPerSecond.toFixed(1)} tok/s</span>
                  </>
                )}

                {typeof ttftMs === 'number' && ttftMs > 0 && (
                  <>
                    <span className={css.popLabel}>首字延迟 (TTFT)</span>
                    <span className={css.popValue}>{(ttftMs / 1000).toFixed(2)}s</span>
                  </>
                )}
              </div>
            </div>
          )}

          {hasTokens && (
            <div className={css.popSection}>
              <div className={css.popSectionTitle}>Token 消耗分解</div>
              <div className={css.popGrid}>
                <span className={css.popLabel}>总消耗</span>
                <span className={css.popValue}>{usage!.totalTokens.toLocaleString()} tok</span>

                <span className={css.popLabel}>
                  输入
                  {cacheHitPercent !== null && (
                    <span className={css.popBadge}>命中 {cacheHitPercent}%</span>
                  )}
                </span>
                <span className={css.popValue}>{usage!.inputTokens?.toLocaleString() ?? 0} tok</span>

                {typeof usage!.cacheReadTokens === 'number' && usage!.cacheReadTokens > 0 && (
                  <>
                    <span className={css.popLabel}>缓存读取</span>
                    <span className={css.popValue}>{usage!.cacheReadTokens.toLocaleString()} tok</span>
                  </>
                )}

                <span className={css.popLabel}>
                  输出
                  {typeof usage!.reasoningTokens === 'number' && usage!.reasoningTokens > 0 && (
                    <span className={css.popBadge}>思考 {usage!.reasoningTokens.toLocaleString()}</span>
                  )}
                </span>
                <span className={css.popValue}>{usage!.outputTokens?.toLocaleString() ?? 0} tok</span>
              </div>
            </div>
          )}
        </div>
      )}
    </span>
  );
});
