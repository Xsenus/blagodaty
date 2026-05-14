import './churchPreloader.css';

type ChurchPreloaderProps = {
  label?: string;
  description?: string;
  fullscreen?: boolean;
  compact?: boolean;
  visualOnly?: boolean;
  className?: string;
};

export function ChurchPreloader({
  label = 'Загрузка',
  description,
  fullscreen = false,
  compact = false,
  visualOnly = false,
  className = '',
}: ChurchPreloaderProps) {
  const classNames = [
    'church-preloader',
    fullscreen ? 'is-fullscreen' : '',
    compact ? 'is-compact' : '',
    visualOnly ? 'is-visual-only' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classNames} role={visualOnly ? undefined : 'status'} aria-live={visualOnly ? undefined : 'polite'} aria-label={label}>
      <div className="preloader-bg" />
      <div className="sun-rays" />
      <div className="soft-sun" />
      <div className="loader-orbit" />
      <div className="loader-dot" />
      <div className="sparkles" />

      <div className="angel" aria-hidden="true">
        <div className="angel-aura" />
        <div className="angel-halo" />
        <div className="angel-wing angel-wing-left">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="angel-wing angel-wing-right">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="angel-hair angel-hair-left" />
        <div className="angel-hair angel-hair-right" />
        <div className="angel-head">
          <span className="angel-eye angel-eye-left" />
          <span className="angel-eye angel-eye-right" />
          <span className="angel-nose" />
          <span className="angel-mouth" />
        </div>
        <div className="angel-neck" />
        <div className="angel-arm angel-arm-left">
          <span className="angel-hand" />
        </div>
        <div className="angel-arm angel-arm-right">
          <span className="angel-hand" />
        </div>
        <div className="angel-body">
          <span className="angel-collar" />
          <span className="angel-sash" />
          <span className="robe-fold robe-fold-1" />
          <span className="robe-fold robe-fold-2" />
          <span className="robe-fold robe-fold-3" />
        </div>
      </div>

      <div className="church-scene" aria-hidden="true">
        <div className="ground-shadow" />
        <div className="foundation-blocks">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div className="church-base">
          <div className="side-window side-window-left" />
          <div className="side-window side-window-right" />
          <div className="round-window" />
          <div className="door" />
          <div className="door-arch" />
        </div>
        <div className="roof roof-left" />
        <div className="roof roof-right" />
        <div className="tower">
          <div className="tower-window" />
        </div>
        <div className="tower-roof" />
        <div className="cross">
          <span className="cross-vertical" />
          <span className="cross-horizontal" />
        </div>
      </div>

      <div className="progress-wrap" aria-hidden="true">
        <div className="progress-line" />
      </div>

      {!visualOnly ? (
        <div className="church-preloader-copy">
          <strong>{label}</strong>
          {description ? <span>{description}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
