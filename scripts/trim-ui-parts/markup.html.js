// trim-ui-parts/markup.html.js
// Returns the <body> markup for Talking Head Trim UI
export function htmlMarkup() {
  return `
  <header>
    <div class="header-left">
      <h1>Trim UI</h1>
      <span id="summary">Cargando...</span>
    </div>
    <div class="header-center">
      <div id="operationStatus" class="activity-status" role="status" aria-live="polite">Listo</div>
    </div>
    <div class="header-right">
      <div class="header-group history-actions" aria-label="Historial">
        <button id="undoButton" class="icon-btn" data-icon="undo" title="Deshacer (Ctrl+Z)" aria-label="Deshacer" disabled></button>
        <button id="redoButton" class="icon-btn" data-icon="redo" title="Rehacer (Ctrl+Shift+Z)" aria-label="Rehacer" disabled></button>
        <button id="resetButton" class="icon-btn danger" data-icon="reset" title="Reset al corte primario" aria-label="Reset" disabled></button>
      </div>
      <div class="header-group project-actions" aria-label="Proyecto">
        <button id="projectInfoButton" class="icon-btn" data-icon="info" title="Info del proyecto" aria-label="Info del proyecto"></button>
        <button id="rendersButton" class="library-button" data-icon="film" title="Abrir biblioteca de renders" aria-label="Abrir biblioteca de renders">
          <span>Renders</span>
          <span id="renderCountBadge" class="render-count">0</span>
        </button>
      </div>
      <div class="header-group export-actions" aria-label="Guardar y exportar">
        <button id="saveButton" class="secondary-action">Guardar cambios</button>
        <button id="previewButton" class="secondary-action">Render prueba</button>
        <button id="finalButton" class="primary export-primary">Render final</button>
      </div>
    </div>
  </header>

  <main class="editor-shell">
    <section class="viewer-panel">
      <div class="video-stage">
        <video id="sourceVideo" preload="metadata" playsinline></video>
      </div>
        <div class="transport">
          <div class="transport-left">
            <div class="segmented mode-switch" aria-label="Modo de reproduccion">
              <button id="modeEditButton" class="mode-opt active">Corte</button>
              <button id="modeSourceButton" class="mode-opt">Source</button>
            </div>
            <div class="transport-controls" aria-label="Controles de reproduccion">
              <button id="goPrev" class="icon-btn transport-step" data-icon="skip-left" title="Corte anterior" aria-label="Corte anterior"></button>
              <button id="playPauseButton" class="transport-play success" data-icon="play" title="Reproducir" aria-label="Reproducir"></button>
              <button id="goNext" class="icon-btn transport-step" data-icon="skip-right" title="Corte siguiente" aria-label="Corte siguiente"></button>
            </div>
            <span id="playModeLabel" class="timecode">00:00.00 / 00:00.00</span>
          </div>
          <div class="transport-right editor-toggles">
            <label class="tool-toggle" data-icon="eye" title="Reproducir solo segmentos conservados">
              <input id="greenOnlyToggle" type="checkbox" checked />
              <span>Solo corte</span>
            </label>
            <label class="tool-toggle" data-icon="magnet" title="Alinear playhead a bordes de corte">
              <input id="playheadSnapToggle" type="checkbox" checked />
              <span>Snap</span>
            </label>
          </div>
        </div>
      </section>

      <section class="timeline-panel">
        <div class="timeline-bar">
          <div class="timeline-bar-left">
            <span class="field-label">Timeline</span>
          </div>
          <div class="timeline-bar-right zoom-control" aria-label="Zoom del timeline">
            <button id="zoomOutButton" class="icon-btn zoom-button" data-icon="zoom-out" title="Alejar" aria-label="Alejar"></button>
            <input id="zoomSlider" type="range" min="2" max="18" step="1" value="6" aria-label="Zoom del timeline" />
            <button id="zoomInButton" class="icon-btn zoom-button" data-icon="zoom-in" title="Acercar" aria-label="Acercar"></button>
            <span id="zoomValue" class="zoom-value">6 px/s</span>
          </div>
        </div>
      <div id="timelineViewport">
        <div id="timelineTrack">
          <canvas id="waveformCanvas"></canvas>
          <div class="ruler" id="ruler"></div>
          <div id="silenceLayer"></div>
          <div id="edgeLayer"></div>
          <div id="segmentLayer"></div>
          <div id="playhead"><div id="playheadLabel">00:00.00</div></div>
        </div>
      </div>
    </section>

    <aside class="sidebar">
      <div class="edit-panel">
        <section id="panelSegment" class="segment-compact" aria-label="Corte seleccionado">
          <div class="segment-head">
            <div class="segment-title-block">
              <span class="section-title">Corte seleccionado</span>
              <strong id="selectedTitle">Segmento</strong>
            </div>
            <span id="selectedOutput" class="badge">00:00.00</span>
          </div>

          <div class="inspector-grid compact-grid">
            <label><span class="field-label">Inicio</span>
            <input id="startInput" type="text" />
          </label>
          <label><span class="field-label">Final</span>
            <input id="endInput" type="text" />
          </label>
        </div>

          <div class="nudge-bar compact-nudge">
          <span class="field-label">Bordes</span>
          <span class="micro-label">Inicio</span>
          <button class="icon-btn" data-icon="step-left" data-nudge="start:-0.05" title="-50ms inicio" aria-label="-50ms inicio"></button>
          <button class="icon-btn" data-icon="step-right" data-nudge="start:0.05" title="+50ms inicio" aria-label="+50ms inicio"></button>
          <span class="micro-label">Final</span>
          <button class="icon-btn" data-icon="step-left" data-nudge="end:-0.05" title="-50ms final" aria-label="-50ms final"></button>
          <button class="icon-btn" data-icon="step-right" data-nudge="end:0.05" title="+50ms final" aria-label="+50ms final"></button>
          <select id="nudgeScope" title="Alcance" aria-label="Alcance">
            <option value="current" selected>Este</option>
            <option value="all">Todos</option>
          </select>
        </div>

          <div class="inline-actions compact-actions">
          <button id="playContext" data-icon="play-circle" title="Reproducir con margen" aria-label="Reproducir con margen"><span>Contexto</span></button>
          <button id="playSegment" data-icon="play" title="Solo este corte" aria-label="Solo este corte"><span>Solo corte</span></button>
          <label class="checkline"><input id="snapToggle" type="checkbox" checked /> Snap palabras</label>
        </div>

          <div class="silence-section compact-silences">
          <div class="silence-header">
            <span class="section-title" style="margin-bottom:0;">Silencios</span>
            <span id="segmentSilenceCount" class="silence-count">0</span>
          </div>
          <div id="segmentSilences" class="silence-list"></div>
        </div>
        </section>

        <section id="panelTranscript" class="transcript-panel" aria-label="Transcripcion">
          <div class="transcript-meta">
          <span class="section-title" style="margin-bottom:0;">Transcripción</span>
          <div style="display:flex;gap:6px;align-items:center;">
            <span id="dirtyState" class="badge">sin cambios</span>
            <span id="transcriptDropCount" class="badge">0 eliminados</span>
          </div>
        </div>
        <div class="transcript-actions">
          <button id="addDeletedSelectionButton" class="success">Agregar seleccion</button>
          <button id="clearDeletedSelectionButton">Limpiar</button>
          <span id="deletedSelectionLabel" class="badge" style="margin-left:auto;">sin seleccion</span>
        </div>
          <div id="transcriptScroll" class="transcript-scroll">
          <div id="transcriptFlow" class="transcript-flow"></div>
        </div>
        </section>
      </div>
    </aside>
  </main>

  <div id="projectInfoModal" class="modal-backdrop" hidden>
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="projectInfoTitle">
      <div class="modal-head">
        <strong id="projectInfoTitle">Info del proyecto</strong>
        <button id="closeProjectInfoButton" class="icon-btn" data-icon="x" title="Cerrar" aria-label="Cerrar"></button>
      </div>
      <div id="status" class="status">Listo.</div>
    </div>
  </div>

  <div id="rendersModal" class="modal-backdrop" hidden>
    <div class="modal-card renders-modal" role="dialog" aria-modal="true" aria-labelledby="rendersTitle">
      <div class="modal-head">
        <div>
          <strong id="rendersTitle">Biblioteca de renders</strong>
          <p class="modal-subtitle">Selecciona un render para previsualizarlo.</p>
        </div>
        <button id="closeRendersButton" class="icon-btn" data-icon="x" title="Cerrar" aria-label="Cerrar"></button>
      </div>
      <div class="renders-layout">
        <section class="render-list-pane" aria-label="Lista de renders">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
            <span id="rendersSummary" style="font-size:11px;color:var(--t3);">Cargando...</span>
            <button id="refreshRendersButton" class="icon-btn" data-icon="refresh" title="Actualizar" aria-label="Actualizar"></button>
          </div>
          <div id="renderList" class="render-list"></div>
        </section>
        <section class="render-preview-pane" aria-label="Preview">
          <div id="renderEmptyPreview" class="render-empty-preview">Selecciona un render de la lista.</div>
          <video id="renderPreviewVideo" class="render-player" controlslist="nofullscreen nodownload noremoteplayback" disablepictureinpicture playsinline preload="metadata" hidden></video>
          <div id="renderPreviewToolbar" class="render-preview-toolbar" hidden>
            <button id="renderPlayButton" class="secondary-action" data-icon="play" title="Reproducir en el panel" aria-label="Reproducir en el panel"><span>Reproducir</span></button>
            <button id="renderFullscreenButton" class="secondary-action" data-icon="maximize" title="Ver en pantalla completa" aria-label="Ver en pantalla completa">Pantalla completa</button>
          </div>
          <div id="renderDetails" class="render-details">Selecciona un render.</div>
        </section>
      </div>
    </div>
  </div>
`;
}
